import { Session, utf8ToBytes } from '@chitchat/e2ee';
import toast from 'react-hot-toast';
import { chatApi, devicesApi } from '../api';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import type { Message } from '../types';
import { getOrCreateIdentity } from './e2ee';
import {
  decryptFromSender,
  decryptMessagesInPlace,
  fetchBundlesForUser,
  loadSession,
  saveSession,
} from './e2eeSessions';
import { setCachedPlaintext } from './decryptedMessageCache';
import { idbGet, idbSet } from './idbKeyval';
import { getOrCreateDeviceId } from './deviceId';
import { useDeviceLinkStore } from '../stores/useDeviceLinkStore';

// Phase 4a (device-linking history sync, see E2EE_PLAN.md) — a brand-new
// device has no MessageCipher/plaintext for any pre-existing message (no
// retroactive decryption is possible, by design). This closes that gap:
// an already-approved device of the SAME user re-encrypts a bounded slice
// of history it already holds (from its own local plaintext cache) and
// pairwise-encrypts it directly to the new device, reusing the exact same
// generic Session primitive Phase 1 uses for pairwise sessions between
// different users — a session between two devices of the SAME user is not
// a special case, just another (userId, deviceId) pair.

const HISTORY_SYNCED_FLAG_KEY = 'historySyncedAt';
const MAX_CHATS_TO_SYNC = 30;
const MAX_MESSAGES_PER_CHAT = 50;

// Backs both the decrypt-placeholder wording (e2eeSessions.ts, via a lazy
// import — this module imports FROM e2eeSessions.ts, so a static import
// back would be circular) and the proactive UnapprovedDeviceBanner. Single
// source of truth is useDeviceLinkStore; optimistic default (true) until
// the first checkDeviceLinkStatus() resolves, so an already-approved
// device (the common case) never shows anything different from today.
export function getDeviceApprovalStatus(): boolean {
  return useDeviceLinkStore.getState().isThisDeviceApproved ?? true;
}

function setDeviceApprovalStatus(approved: boolean): void {
  useDeviceLinkStore.getState().setIsThisDeviceApproved(approved);
}

export interface HistorySyncEntry {
  chatId: string;
  messageId: string;
  senderId: string;
  type: string;
  content: string | null;
  createdAt: string;
}

/**
 * Fetches+decrypts the last MAX_MESSAGES_PER_CHAT messages across the
 * MAX_CHATS_TO_SYNC most-recently-active chats — this device's own
 * already-decrypted view of its recent history, in the flat wire shape
 * both the device-link push (pushHistoryToDevice) and the passphrase
 * backup (backupSync.ts's createOrUpdateBackup) encrypt and ship. Shared
 * here so both features fetch+decrypt exactly once, not twice.
 */
export async function collectHistorySnapshot(): Promise<HistorySyncEntry[]> {
  const chats = [...useChatStore.getState().chats]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_CHATS_TO_SYNC);

  const allEntries: HistorySyncEntry[] = [];
  for (const chat of chats) {
    try {
      const { messages } = await chatApi.getMessages(chat.id, undefined, MAX_MESSAGES_PER_CHAT);
      if (messages.length === 0) continue;

      await decryptMessagesInPlace(messages, chat.type === 'group' || chat.type === 'meeting');

      const entries: HistorySyncEntry[] = messages
        .filter((m) => m.content !== null)
        .map((m) => ({
          chatId: chat.id,
          messageId: m.id,
          senderId: m.senderId,
          type: m.type,
          content: m.content,
          createdAt: m.createdAt,
        }));
      allEntries.push(...entries);
    } catch (err) {
      console.warn(`[DeviceLink] Failed to collect history for chat ${chat.id}:`, err);
    }
  }
  return allEntries;
}

/**
 * Applies a decrypted batch of history entries (from either a device-link
 * push or a backup restore) into the local plaintext cache + chatStore.
 * Entries may span multiple chats (a backup restore always does) — grouped
 * per chat since mergeHistoryMessages operates one chat at a time.
 */
export async function applyDecryptedEntries(entries: HistorySyncEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const byChatId = new Map<string, Message[]>();
  for (const entry of entries) {
    if (entry.content !== null) {
      await setCachedPlaintext(entry.messageId, entry.content);
    }
    const message: Message = {
      id: entry.messageId,
      chatId: entry.chatId,
      senderId: entry.senderId,
      content: entry.content,
      type: entry.type as Message['type'],
      status: 'sent',
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
      sender: { id: entry.senderId, displayName: null, avatarUrl: null },
      replyTo: null,
      attachments: [],
    };
    const list = byChatId.get(entry.chatId);
    if (list) list.push(message);
    else byChatId.set(entry.chatId, [message]);
  }

  const store = useChatStore.getState();
  for (const [chatId, messages] of byChatId) {
    store.mergeHistoryMessages(chatId, messages);
  }
}

async function encryptForDevice(
  myUserId: string,
  targetDeviceId: string,
  plaintext: string,
): Promise<string> {
  const identity = await getOrCreateIdentity();
  const bundles = await fetchBundlesForUser(myUserId);
  const bundle = bundles.find((b) => b.deviceId === targetDeviceId);
  if (!bundle) {
    throw new Error(`Target device ${targetDeviceId} has no key bundle`);
  }

  let session = await loadSession(myUserId, targetDeviceId);
  if (!session) {
    session = Session.createOutbound(identity, bundle);
  }

  const envelope = session.encrypt(utf8ToBytes(plaintext));
  await saveSession(myUserId, targetDeviceId, session);
  return JSON.stringify(envelope);
}

/**
 * Runs on the APPROVING device, right after its own approve() call
 * succeeds — never depends on receiving any event back, since it's the
 * device that just did the approving.
 */
export async function pushHistoryToDevice(newDeviceId: string): Promise<void> {
  const myUserId = useAuthStore.getState().user?.id;
  if (!myUserId) return;

  const entries = await collectHistorySnapshot();
  const byChatId = new Map<string, HistorySyncEntry[]>();
  for (const entry of entries) {
    const list = byChatId.get(entry.chatId);
    if (list) list.push(entry);
    else byChatId.set(entry.chatId, [entry]);
  }

  let syncedCount = 0;
  for (const [chatId, chatEntries] of byChatId) {
    try {
      const ciphertext = await encryptForDevice(myUserId, newDeviceId, JSON.stringify(chatEntries));
      await devicesApi.pushLinkPayload(newDeviceId, chatId, ciphertext);
      syncedCount++;
    } catch (err) {
      console.warn(`[DeviceLink] Failed to push history for chat ${chatId}:`, err);
    }
  }

  if (syncedCount > 0) {
    toast.success(`Synced history for your ${syncedCount} most recent chat${syncedCount === 1 ? '' : 's'}`);
  }
}

export async function approveDeviceLink(newDeviceId: string): Promise<void> {
  await devicesApi.approveDevice(newDeviceId);
  await pushHistoryToDevice(newDeviceId);
}

export async function declineDeviceLink(newDeviceId: string): Promise<void> {
  await devicesApi.declineDevice(newDeviceId);
}

async function applyIncomingPayload(ciphertext: string, approvingDeviceId: string): Promise<void> {
  const myUserId = useAuthStore.getState().user?.id;
  if (!myUserId) return;

  const plaintext = await decryptFromSender(myUserId, approvingDeviceId, ciphertext);
  const entries: HistorySyncEntry[] = JSON.parse(plaintext);
  await applyDecryptedEntries(entries);
}

/** DEVICE_HISTORY_CHUNK socket handler. */
export async function handleIncomingHistoryChunk(payload: {
  chatId: string;
  ciphertext: string;
  approvingDeviceId: string;
}): Promise<void> {
  try {
    await applyIncomingPayload(payload.ciphertext, payload.approvingDeviceId);
  } catch (err) {
    console.error('[DeviceLink] Failed to apply incoming history chunk:', err);
  }
}

/** Pull-based catch-up — call on approval and defensively on every app start. */
export async function fetchPendingHistoryPayloads(): Promise<void> {
  try {
    setDeviceApprovalStatus(true);
    const payloads = await devicesApi.getPendingLinkPayloads();
    for (const payload of payloads) {
      await applyIncomingPayload(payload.ciphertext, payload.approvingDeviceId);
    }
    await idbSet(HISTORY_SYNCED_FLAG_KEY, new Date().toISOString());
  } catch (err) {
    console.warn('[DeviceLink] Failed to fetch pending history payloads:', err);
  }
}

/**
 * Fallback for a missed live device:link-approved push — called after every
 * registerE2eeDevice() (i.e. every app start/reconnect). No-op once this
 * device has already synced once.
 */
export async function checkDeviceLinkStatus(): Promise<void> {
  try {
    const alreadySynced = await idbGet<string>(HISTORY_SYNCED_FLAG_KEY);
    if (alreadySynced) return;

    const myDeviceId = getOrCreateDeviceId();
    const devices = await devicesApi.getMyDevices();
    const mine = devices.find((d) => d.deviceId === myDeviceId);
    setDeviceApprovalStatus(mine?.approved ?? true);
    if (mine?.approved) {
      await fetchPendingHistoryPayloads();
    }
  } catch (err) {
    console.warn('[DeviceLink] Failed to check device link status:', err);
  }
}
