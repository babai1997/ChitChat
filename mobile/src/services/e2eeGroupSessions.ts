import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  generateSenderKeyState,
  createDistributionMessage,
  senderKeyEncrypt,
  initReceivingChain,
  senderKeyDecrypt,
  serializeSenderKeyState,
  deserializeSenderKeyState,
  serializeReceivingChainState,
  deserializeReceivingChainState,
  utf8ToBytes,
  bytesToUtf8,
  type SenderKeyState,
  type ReceivingChainState,
  type SenderKeyMessage,
  type SerializedSenderKeyState,
  type SerializedReceivingChainState,
} from '@chitchat/e2ee';
import { api } from '../api/client';
import { getOrCreateDeviceId } from './deviceId';
import { encryptForMembers, decryptFromSender } from './e2eeSessions';
import { socketManager } from '../shared/socket/SocketManager';
import { SOCKET_EVENTS } from '../shared/constants/socket-events';

// Sender Keys (Phase 2 group E2EE, see E2EE_PLAN.md) — one symmetric chain
// PER (chat, own device), broadcast identically to every member, instead of
// Phase 1's pairwise Double Ratchet session per recipient device. The
// distribution handshake ("here's my chain key") reuses Phase 1's pairwise
// sessions wholesale — see distributeSenderKey below — so this file adds no
// new session-management code of its own, only the chain itself.
//
// Persisted in AsyncStorage, same as e2eeSessions.ts's Double Ratchet
// sessions — NOT expo-secure-store, since chain state (and its skipped-key
// cache) can outgrow the OS keychain's per-item size limit.

function ownKeyStorageKey(chatId: string): string {
  return `chitchat_e2ee_senderkey_own_${chatId}`;
}
function receivingKeyStorageKey(
  chatId: string,
  senderUserId: string,
  senderDeviceId: string,
  chainId: string,
): string {
  return `chitchat_e2ee_senderkey_recv_${chatId}_${senderUserId}_${senderDeviceId}_${chainId}`;
}

const ownStateCache = new Map<string, SenderKeyState>();
const receivingStateCache = new Map<string, ReceivingChainState>();

async function loadOwnState(chatId: string): Promise<SenderKeyState | null> {
  const cached = ownStateCache.get(chatId);
  if (cached) return cached;
  const raw = await AsyncStorage.getItem(ownKeyStorageKey(chatId));
  if (!raw) return null;
  const state = deserializeSenderKeyState(JSON.parse(raw) as SerializedSenderKeyState);
  ownStateCache.set(chatId, state);
  return state;
}

async function saveOwnState(chatId: string, state: SenderKeyState): Promise<void> {
  ownStateCache.set(chatId, state);
  await AsyncStorage.setItem(ownKeyStorageKey(chatId), JSON.stringify(serializeSenderKeyState(state)));
}

async function loadReceivingState(
  chatId: string,
  senderUserId: string,
  senderDeviceId: string,
  chainId: string,
): Promise<ReceivingChainState | null> {
  const key = receivingKeyStorageKey(chatId, senderUserId, senderDeviceId, chainId);
  const cached = receivingStateCache.get(key);
  if (cached) return cached;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const state = deserializeReceivingChainState(JSON.parse(raw) as SerializedReceivingChainState);
  receivingStateCache.set(key, state);
  return state;
}

async function saveReceivingState(
  chatId: string,
  senderUserId: string,
  senderDeviceId: string,
  chainId: string,
  state: ReceivingChainState,
): Promise<void> {
  const key = receivingKeyStorageKey(chatId, senderUserId, senderDeviceId, chainId);
  receivingStateCache.set(key, state);
  await AsyncStorage.setItem(key, JSON.stringify(serializeReceivingChainState(state)));
}

/**
 * Sends this device's CURRENT (or a freshly-generated) chain key to the
 * given members' devices, pairwise-encrypted via each recipient's existing
 * Phase-1 Double Ratchet session (reusing encryptForMembers wholesale — a
 * SenderKeyDistributionMessage is, from Phase 1's point of view, just
 * another plaintext string to encrypt). Delivered over the socket for
 * real-time push; the server also persists it (see sender-keys.service.ts)
 * so an offline target catches up later via fetchAndApplyPendingDistributions.
 */
async function distributeSenderKey(
  chatId: string,
  state: SenderKeyState,
  targetUserIds: string[],
): Promise<void> {
  if (targetUserIds.length === 0) return;
  const dm = createDistributionMessage(state);
  const pairwiseCiphers = await encryptForMembers(targetUserIds, JSON.stringify(dm));
  if (pairwiseCiphers.length === 0) return;

  const myDeviceId = await getOrCreateDeviceId();
  socketManager.emit(SOCKET_EVENTS.SENDER_KEY_DISTRIBUTE, {
    chatId,
    senderDeviceId: myDeviceId,
    targets: pairwiseCiphers.map(({ userId, deviceId, ciphertext }) => ({
      recipientUserId: userId,
      recipientDeviceId: deviceId,
      ciphertext,
    })),
  });
}

/**
 * Returns this device's sending chain for `chatId`, generating one if none
 * exists yet — sender key generation is lazy, triggered by the first group
 * send. Distribution happens separately, on every send — see
 * encryptGroupMessage.
 */
async function getOrCreateOwnSenderKey(chatId: string): Promise<SenderKeyState> {
  const existing = await loadOwnState(chatId);
  if (existing) return existing;

  const state = generateSenderKeyState();
  await saveOwnState(chatId, state);
  return state;
}

/**
 * Encrypts a group message, lazily creating this device's chain key if
 * needed. Redistributes the CURRENT chain to every current member on
 * EVERY send, not just at creation — otherwise a member's device that logs
 * in AFTER the chain was first distributed (no membership change involved,
 * so no member-added/removed event ever fires) would never receive it and
 * would be stuck unable to decrypt anything from this device, forever, not
 * just retroactively (a real bug found in production testing, distinct
 * from the accepted "no retroactive history" gap — that one is bounded to
 * past messages; this one had no bound at all). distributeSenderKey's
 * bundle fetch always resolves EVERY currently-active device of each
 * target user, and applying an already-known chain is a no-op on the
 * receiving end, so this is safe — just not free: every send pays for one
 * extra pairwise-encrypt per member device. Acceptable for now; a "which
 * devices have already confirmed this exact chainId" cache would cut the
 * redundant cost if group sizes ever make this a real bottleneck.
 */
export async function encryptGroupMessage(
  chatId: string,
  memberUserIds: string[],
  plaintext: string,
): Promise<string> {
  const state = await getOrCreateOwnSenderKey(chatId);
  await distributeSenderKey(chatId, state, memberUserIds);
  const message = senderKeyEncrypt(state, utf8ToBytes(plaintext));
  await saveOwnState(chatId, state);
  return JSON.stringify(message);
}

/**
 * Rekeys after a member is removed — a fresh chain (new chainId), only ever
 * distributed to `remainingMemberIds`, so the removed member's cached old
 * chain key can't decrypt anything sent from now on. A no-op if this device
 * never had an active chain for this chat in the first place.
 */
export async function rekeySenderKey(
  chatId: string,
  remainingMemberIds: string[],
): Promise<void> {
  const existing = await loadOwnState(chatId);
  if (!existing) return;

  const fresh = generateSenderKeyState();
  await saveOwnState(chatId, fresh);
  await distributeSenderKey(chatId, fresh, remainingMemberIds);
}

/**
 * Distributes the CURRENT chain (not a new one) to a member who just
 * joined — no-op if this device has no active chain yet.
 */
export async function distributeSenderKeyToNewMember(
  chatId: string,
  newUserId: string,
): Promise<void> {
  const existing = await loadOwnState(chatId);
  if (!existing) return;
  await distributeSenderKey(chatId, existing, [newUserId]);
}

/**
 * Applies an incoming distribution (own device already decrypted the outer
 * pairwise envelope — see socket handler) by seeding a receiving chain, but
 * only if we don't already have one for this exact chainId: a chain is a
 * pure one-way function of its starting key, so re-seeding is harmless, but
 * skipping when possible preserves any skipped-message-key cache we've
 * already built up for out-of-order deliveries.
 */
async function applyDistributionMessage(
  chatId: string,
  senderUserId: string,
  senderDeviceId: string,
  dm: { chainId: string; iteration: number; chainKey: string; signingPublicKey: string },
): Promise<void> {
  const existing = await loadReceivingState(chatId, senderUserId, senderDeviceId, dm.chainId);
  if (existing) return;
  const state = initReceivingChain(dm);
  await saveReceivingState(chatId, senderUserId, senderDeviceId, dm.chainId, state);
}

/** Real-time distribution push (SOCKET_EVENTS.SENDER_KEY_NEW) — the ciphertext is pairwise-encrypted, decrypt via the existing Phase-1 session. */
export async function handleIncomingDistribution(payload: {
  chatId: string;
  senderUserId: string;
  senderDeviceId: string;
  ciphertext: string;
}): Promise<void> {
  try {
    const plaintext = await decryptFromSender(
      payload.senderUserId,
      payload.senderDeviceId,
      payload.ciphertext,
    );
    const dm = JSON.parse(plaintext) as {
      chainId: string;
      iteration: number;
      chainKey: string;
      signingPublicKey: string;
    };
    await applyDistributionMessage(payload.chatId, payload.senderUserId, payload.senderDeviceId, dm);
  } catch (err) {
    console.warn('[E2EE] Failed to apply incoming Sender Key distribution:', err);
  }
}

/**
 * Catches up on any distributions this device missed while offline (or
 * never got a real-time push for) — call on socket reconnect. Every row is
 * safe to reapply: applyDistributionMessage no-ops if we already have that
 * exact chain.
 */
export async function fetchAndApplyPendingDistributions(): Promise<void> {
  try {
    const { data } = await api.get<
      { chatId: string; senderUserId: string; senderDeviceId: string; ciphertext: string }[]
    >('/sender-key-distributions');
    for (const row of data) {
      await handleIncomingDistribution(row);
    }
  } catch (err) {
    console.warn('[E2EE] Failed to fetch pending Sender Key distributions:', err);
  }
}

const decryptAttempts = new Map<string, Promise<string>>();

/**
 * Decrypts a group message. On a missing receiving chain (this device
 * hasn't seen a distribution for the sender's CURRENT chain yet), does one
 * on-demand catch-up fetch and retries once before giving up.
 */
export function decryptGroupMessage(
  chatId: string,
  senderUserId: string,
  senderDeviceId: string,
  cipherJson: string,
): Promise<string> {
  const cached = decryptAttempts.get(cipherJson);
  if (cached) return cached;
  const attempt = decryptGroupMessageUncached(chatId, senderUserId, senderDeviceId, cipherJson);
  decryptAttempts.set(cipherJson, attempt);
  return attempt;
}

async function decryptGroupMessageUncached(
  chatId: string,
  senderUserId: string,
  senderDeviceId: string,
  cipherJson: string,
): Promise<string> {
  const message: SenderKeyMessage = JSON.parse(cipherJson);

  let state = await loadReceivingState(chatId, senderUserId, senderDeviceId, message.chainId);
  if (!state) {
    await fetchAndApplyPendingDistributions();
    state = await loadReceivingState(chatId, senderUserId, senderDeviceId, message.chainId);
  }
  if (!state) {
    throw new Error(
      `E2EE: no Sender Key distribution received yet for ${senderUserId}/${senderDeviceId} in chat ${chatId}`,
    );
  }

  const plaintextBytes = senderKeyDecrypt(state, message);
  await saveReceivingState(chatId, senderUserId, senderDeviceId, message.chainId, state);
  return bytesToUtf8(plaintextBytes);
}
