import AsyncStorage from '@react-native-async-storage/async-storage';

// Persists the last few unread messages per chat so the Android notification
// can show them stacked (WhatsApp-style) even across separate headless
// background invocations, where in-memory state doesn't survive between
// one FCM message and the next.

export interface StoredNotificationMessage {
  messageId: string;
  senderName: string;
  content: string;
  timestamp: number;
}

const STORAGE_PREFIX = 'chitchat-notif-messages-';
const MAX_STORED_PER_CHAT = 8;

function keyFor(chatId: string): string {
  return `${STORAGE_PREFIX}${chatId}`;
}

export async function getMessagesForChat(
  chatId: string,
): Promise<StoredNotificationMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(chatId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Appends a message and returns the full (capped) list for that chat. */
export async function addMessageForChat(
  chatId: string,
  entry: StoredNotificationMessage,
): Promise<StoredNotificationMessage[]> {
  const existing = await getMessagesForChat(chatId);
  // Dedup by messageId in case the same push is delivered twice.
  const deduped = existing.filter((m) => m.messageId !== entry.messageId);
  const updated = [...deduped, entry].slice(-MAX_STORED_PER_CHAT);
  try {
    await AsyncStorage.setItem(keyFor(chatId), JSON.stringify(updated));
  } catch {
    // Non-fatal — worst case the notification just shows fewer lines.
  }
  return updated;
}

export async function clearMessagesForChat(chatId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(chatId));
  } catch {
    // Ignore — nothing meaningful to recover from here.
  }
}
