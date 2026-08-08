import {
  Session,
  utf8ToBytes,
  bytesToUtf8,
  type PublicIdentityBundle,
  type Envelope,
} from '@chitchat/e2ee';
import type { SerializedSession } from '@chitchat/e2ee';
import { api } from '../api/client';
import { idbGet, idbSet } from './idbKeyval';
import { getOrCreateDeviceId } from './deviceId';
import { getOrCreateIdentity } from './e2ee';
import { getCachedPlaintext, setCachedPlaintext } from './decryptedMessageCache';

// GET /devices/:userId/bundle returns one of these per active device — same
// shape as PublicIdentityBundle plus the deviceId it belongs to (see
// keys.service.ts's getBundlesForUser on the backend).
export type DeviceBundle = PublicIdentityBundle & { deviceId: string };

// Per-peer-device Double Ratchet session cache. One Session per (peerUserId,
// peerDeviceId) — sessions persist across reloads in IndexedDB, next to the
// identity itself (see idbKeyval.ts / e2ee.ts), since ratchet state has to
// survive exactly as long as the conversation does.
function sessionKey(peerUserId: string, peerDeviceId: string): string {
  return `session:${peerUserId}:${peerDeviceId}`;
}

const memoryCache = new Map<string, Session>();

export async function loadSession(peerUserId: string, peerDeviceId: string): Promise<Session | null> {
  const key = sessionKey(peerUserId, peerDeviceId);
  const cached = memoryCache.get(key);
  if (cached) return cached;

  const stored = await idbGet<SerializedSession>(key);
  if (!stored) return null;
  const session = Session.fromSerialized(stored);
  memoryCache.set(key, session);
  return session;
}

export async function saveSession(peerUserId: string, peerDeviceId: string, session: Session): Promise<void> {
  memoryCache.set(sessionKey(peerUserId, peerDeviceId), session);
  await idbSet(sessionKey(peerUserId, peerDeviceId), session.toSerialized());
}

// A device bundle is only actually needed to START a new session — once one
// exists, re-fetching on every send was pure overhead: a network round trip
// per member per message (2 sequential ones for a 1:1 chat, serially awaited,
// was the dominant chunk of perceived send latency), AND the server consumes
// one of the recipient's limited one-time prekeys on every single fetch, so
// re-fetching for messages that didn't need it was silently burning through
// that pool far faster than necessary. A short TTL cache means an active
// back-and-forth conversation hits the network for this at most once per
// window, while still picking up e.g. a contact's newly-registered device
// reasonably soon.
const BUNDLE_CACHE_TTL_MS = 5 * 60 * 1000;
const bundleCache = new Map<string, { bundles: DeviceBundle[]; fetchedAt: number }>();

export async function fetchBundlesForUser(userId: string): Promise<DeviceBundle[]> {
  const cached = bundleCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < BUNDLE_CACHE_TTL_MS) {
    return cached.bundles;
  }
  const { data } = await api.get<DeviceBundle[]>(`/devices/${userId}/bundle`);
  bundleCache.set(userId, { bundles: data, fetchedAt: Date.now() });
  return data;
}

interface ResolvedTarget {
  userId: string;
  deviceId: string;
  session: Session;
}

/**
 * Resolves (creating if needed) a session for every active device of every
 * given user — excluding this device itself, so we never encrypt a copy to
 * ourselves. `memberUserIds` should include the sender's own userId so their
 * other devices (another tab, their phone) get a synced copy too.
 */
async function resolveSessionsForMembers(memberUserIds: string[]): Promise<ResolvedTarget[]> {
  const identity = await getOrCreateIdentity();
  const myDeviceId = getOrCreateDeviceId();
  const targets: ResolvedTarget[] = [];
  // Defensive against a duplicate userId in memberUserIds (or any other path
  // that could produce the same target twice) — encrypting the same device
  // twice would advance its ratchet twice for one logical send and the
  // backend would reject the duplicate (userId, deviceId) pair outright.
  const seen = new Set<string>();

  // Fetch every member's bundle concurrently rather than one-at-a-time — on
  // a cache miss (see fetchBundlesForUser) this is the difference between N
  // sequential network round trips and one wait for the slowest of them.
  const bundlesByUser = await Promise.all(
    memberUserIds.map(async (userId) => {
      try {
        return await fetchBundlesForUser(userId);
      } catch (err) {
        console.warn(`[E2EE] Failed to fetch key bundle for ${userId}:`, err);
        return [];
      }
    }),
  );

  for (let i = 0; i < memberUserIds.length; i++) {
    const userId = memberUserIds[i];
    const bundles = bundlesByUser[i];

    for (const bundle of bundles) {
      if (bundle.deviceId === myDeviceId) continue; // never encrypt to this same device
      const key = `${userId}:${bundle.deviceId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let session = await loadSession(userId, bundle.deviceId);
      if (!session) {
        try {
          session = Session.createOutbound(identity, bundle);
        } catch (err) {
          console.warn(`[E2EE] Failed to start session with ${userId}/${bundle.deviceId}:`, err);
          continue;
        }
      }
      targets.push({ userId, deviceId: bundle.deviceId, session });
    }
  }

  return targets;
}

/**
 * Encrypts `plaintext` once per target device across every given chat
 * member (including the sender, for their own other devices). Returns the
 * wire-ready ciphers array expected by SendMessageDto. Each entry carries
 * userId alongside deviceId — deviceId strings are only unique per user, not
 * globally, so the backend needs both to resolve the right Device row.
 */
export async function encryptForMembers(
  memberUserIds: string[],
  plaintext: string,
): Promise<{ userId: string; deviceId: string; ciphertext: string }[]> {
  const targets = await resolveSessionsForMembers(memberUserIds);
  const bytes = utf8ToBytes(plaintext);

  const ciphers: { userId: string; deviceId: string; ciphertext: string }[] = [];
  for (const { userId, deviceId, session } of targets) {
    const envelope = session.encrypt(bytes);
    await saveSession(userId, deviceId, session);
    ciphers.push({ userId, deviceId, ciphertext: JSON.stringify(envelope) });
  }
  return ciphers;
}

/**
 * Decrypts a batch of messages in place (e.g. a page of chat history from
 * GET /chats/:chatId/messages), consulting the persistent plaintext cache
 * first — checked BEFORE looking at `cipher` at all, deliberately. Two
 * reasons this order matters:
 *  1. A Double Ratchet message key is single-use, so re-decrypting an
 *     already-consumed cipher (which WILL happen on every reload otherwise,
 *     since chatStore is plain in-memory) throws instead of succeeding.
 *  2. Your OWN sent messages never have a cipher for your OWN device in the
 *     first place (you don't need to decrypt what you just typed) — the
 *     cache, seeded at send time (see message.handlers.ts's
 *     handleMessageSent), is the ONLY thing that can ever produce their
 *     content again after a reload wipes the in-memory store. Bailing out
 *     early on `!cipher` before checking the cache would permanently show
 *     every message you've ever sent as unrecoverable after any refresh.
 */
// Named sentinels for the three "can't show real content" placeholder
// strings below — exported so UI layers (MessageBubble, chat-list preview)
// can detect and render them distinctly instead of as literal message text
// indistinguishable from something someone actually typed and sent.
export const PLACEHOLDER_MESSAGE_NOT_AVAILABLE = '🔒 Message not available on this device';
export const PLACEHOLDER_DECRYPT_FAILED = '⚠️ Unable to decrypt this message';
export const PLACEHOLDER_APPROVE_DEVICE =
  '🔒 Approve this device from another device (Settings → Linked Devices) to load older messages';

export function isE2eePlaceholder(content: string | null | undefined): boolean {
  return (
    content === PLACEHOLDER_MESSAGE_NOT_AVAILABLE ||
    content === PLACEHOLDER_DECRYPT_FAILED ||
    content === PLACEHOLDER_APPROVE_DEVICE
  );
}

export async function decryptMessagesInPlace(
  messages: { id: string; chatId?: string; isEncrypted?: boolean; cipher?: string | null; senderId: string; senderDeviceId?: string; content: string | null }[],
  // A single boolean covers the common case (one chat's own history/live
  // message — ChatView.tsx, message.handlers.ts). A resolver function is
  // for batches spanning MULTIPLE chats of possibly different types (e.g.
  // HomePage.tsx decrypting every chat's lastMessage preview in one pass).
  isGroupChat: boolean | ((chatId: string) => boolean) = false,
): Promise<void> {
  // Lazy imports — both modules import FROM this file (e2eeGroupSessions
  // reuses encryptForMembers/decryptFromSender; deviceLinkSync reuses
  // loadSession/saveSession/fetchBundlesForUser/decryptFromSender), so a
  // static import back here would be circular.
  const { decryptGroupMessage } = await import('./e2eeGroupSessions');
  const { getDeviceApprovalStatus } = await import('./deviceLinkSync');
  const resolveIsGroup =
    typeof isGroupChat === 'function' ? isGroupChat : () => isGroupChat;

  for (const message of messages) {
    if (!message.isEncrypted) continue;

    const cached = await getCachedPlaintext(message.id);
    if (cached !== null) {
      message.content = cached;
      continue;
    }

    if (!message.cipher) {
      // Genuinely different from a decrypt FAILURE below (cipher present,
      // but wrong/expired key) — there's no cipher addressed to this
      // device at all, because this device didn't exist yet when the
      // message was sent (a new device/reinstall has no retroactive
      // history — see E2EE_PLAN.md's Phase 4a). Previously this left
      // `content` as the server's raw `null`, which MessageBubble renders
      // as nothing at all — a blank bubble with no explanation, easy to
      // mistake for the whole feature being broken. Show a message-shaped
      // placeholder that at least says why, consistent with the decrypt
      // failure case below. Deliberately not cached: unlike a genuine
      // decrypt failure, this isn't really "for this message" so much as
      // "on this device" — no reason to make it permanently sticky if the
      // message is ever re-synced by some future mechanism.
      message.content = getDeviceApprovalStatus()
        ? PLACEHOLDER_MESSAGE_NOT_AVAILABLE
        : PLACEHOLDER_APPROVE_DEVICE;
      continue;
    }

    try {
      message.content = message.chatId && resolveIsGroup(message.chatId)
        ? await decryptGroupMessage(message.chatId, message.senderId, message.senderDeviceId!, message.cipher)
        : await decryptFromSender(message.senderId, message.senderDeviceId!, message.cipher);
      await setCachedPlaintext(message.id, message.content);
    } catch (err) {
      console.error('[E2EE] Failed to decrypt message:', err);
      message.content = getDeviceApprovalStatus()
        ? PLACEHOLDER_DECRYPT_FAILED
        : PLACEHOLDER_APPROVE_DEVICE;
    }
  }
}

// Dedupes concurrent/duplicate decrypt attempts for the SAME ciphertext,
// keyed by the raw cipher string (unique per message — a Double Ratchet
// message key is single-use, so encrypting can never produce the same
// ciphertext twice). This is what actually makes decryptFromSender safe to
// call more than once for the same message from anywhere — React's
// StrictMode double-invokes effects in dev (so the history-fetch effect in
// ChatView.tsx genuinely runs twice), and the real-time socket handler can
// race with a concurrent history fetch for the same message. Without this,
// the second call would try to consume an already-spent message key and
// fail with "nonce mismatch" even though the message is perfectly decryptable.
const decryptAttempts = new Map<string, Promise<string>>();

/**
 * Decrypts an incoming message's cipher. Creates the session from the
 * embedded X3DH header on a peer device's first-ever message to us.
 */
export function decryptFromSender(
  senderUserId: string,
  senderDeviceId: string,
  cipherJson: string,
): Promise<string> {
  const cached = decryptAttempts.get(cipherJson);
  if (cached) return cached;

  const attempt = decryptFromSenderUncached(senderUserId, senderDeviceId, cipherJson);
  decryptAttempts.set(cipherJson, attempt);
  return attempt;
}

async function decryptFromSenderUncached(
  senderUserId: string,
  senderDeviceId: string,
  cipherJson: string,
): Promise<string> {
  const envelope: Envelope = JSON.parse(cipherJson);
  const identity = await getOrCreateIdentity();

  let session = await loadSession(senderUserId, senderDeviceId);
  if (!session) {
    if (!envelope.isPrekeyMessage) {
      throw new Error('E2EE: no session exists and message carries no X3DH header — cannot decrypt');
    }
    session = Session.createInbound(identity, envelope.x3dhHeader);
  }

  const plaintextBytes = session.decrypt(envelope);
  await saveSession(senderUserId, senderDeviceId, session);
  return bytesToUtf8(plaintextBytes);
}
