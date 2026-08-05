import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  AndroidStyle,
} from '@notifee/react-native';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { addMessageForChat, clearMessagesForChat } from './messageNotificationStore';

const CHANNEL_ID = 'chat-messages';
const CATEGORY_ID = 'message';
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_STORAGE_KEY = 'chitchat-auth';

// ── Notification channel (Android) ──────────────────────────────────────────

let channelReady: Promise<void> | null = null;

export function ensureMessageNotificationChannel(): Promise<void> {
  if (!channelReady) {
    channelReady = notifee
      .createChannel({
        id: CHANNEL_ID,
        name: 'Messages',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PRIVATE,
        sound: 'default',
        vibration: true,
      })
      .then(() => undefined);
  }
  return channelReady;
}

// ── Notification category (iOS) ─────────────────────────────────────────────

let categoriesReady: Promise<void> | null = null;

/**
 * Registers the "message" category with a Reply quick-action, so iOS shows a
 * text-input action on message notifications. Must run once at app startup
 * (before any notification using this category is displayed) — call from
 * index.js alongside the channel/handler setup. No-op on Android.
 */
export function registerMessageNotificationCategories(): Promise<void> {
  if (Platform.OS !== 'ios') return Promise.resolve();
  if (!categoriesReady) {
    categoriesReady = notifee
      .setNotificationCategories([
        {
          id: CATEGORY_ID,
          actions: [
            {
              id: 'reply',
              title: 'Reply',
              input: { placeholderText: 'Type a message' },
            },
          ],
        },
      ])
      .then(() => undefined);
  }
  return categoriesReady;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface MessagePushData {
  messageId: string;
  chatId: string;
  chatName: string;
  senderId: string;
  senderName: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'file';
  content: string;
}

// ── Display ──────────────────────────────────────────────────────────────────

/**
 * Shows/updates a notification for an incoming chat message, stacking all
 * unread messages from that chat like WhatsApp does:
 *
 * - Android: a single evolving notification (fixed id per chat) using
 *   MessagingStyle, listing every unread message from that chat as its own
 *   line. Accumulated messages are persisted (see messageNotificationStore)
 *   since a background FCM invocation doesn't share memory with the next one.
 * - iOS: each message gets its own notification, grouped by `threadId` —
 *   Notification Center does the stacking natively, so there's no manual
 *   accumulation needed there.
 *
 * Both platforms get a "Reply" quick action.
 */
export async function displayMessageNotification(
  data: MessagePushData,
): Promise<void> {
  if (Platform.OS === 'android') {
    await ensureMessageNotificationChannel();

    const history = await addMessageForChat(data.chatId, {
      messageId: data.messageId,
      senderName: data.senderName,
      content: data.content,
      timestamp: Date.now(),
    });

    await notifee.displayNotification({
      id: `chat-${data.chatId}`,
      title: data.chatName,
      body: data.content,
      data: { kind: 'message', chatId: data.chatId },
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.MESSAGE,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PRIVATE,
        pressAction: { id: 'default', launchActivity: 'default' },
        showTimestamp: true,
        timestamp: Date.now(),
        groupSummary: false,
        style: {
          type: AndroidStyle.MESSAGING,
          person: { name: 'You' },
          group: history.length > 1,
          messages: history.map((m) => ({
            text: m.content,
            timestamp: m.timestamp,
            person: { name: m.senderName },
          })),
        },
        actions: [
          {
            title: 'Reply',
            pressAction: { id: 'reply' },
            input: { placeholder: 'Type a message' },
          },
        ],
      },
    });
    return;
  }

  // iOS — one notification per message; threadId groups them in Notification
  // Center, categoryId enables the Reply quick action registered above.
  await notifee.displayNotification({
    id: `chat-${data.chatId}-${data.messageId}`,
    title: data.senderName,
    body: data.content,
    data: { kind: 'message', chatId: data.chatId },
    ios: {
      categoryId: CATEGORY_ID,
      threadId: data.chatId,
    },
  });
}

/**
 * Clears every displayed notification for a chat (and its stored message
 * history) — call when the user opens that chat, or after they reply from
 * a notification action.
 */
export async function clearChatNotifications(chatId: string): Promise<void> {
  await clearMessagesForChat(chatId);
  try {
    if (Platform.OS === 'android') {
      await notifee.cancelNotification(`chat-${chatId}`);
    } else {
      const displayed = await notifee.getDisplayedNotifications();
      const idsToCancel = displayed
        .filter((d) => d.notification.data?.chatId === chatId)
        .map((d) => d.id)
        .filter((id): id is string => !!id);
      if (idsToCancel.length > 0) {
        await notifee.cancelDisplayedNotifications(idsToCancel);
      }
    }
  } catch {
    // Best-effort — a stale notification lingering is harmless.
  }
}

// ── Quick reply (background) ────────────────────────────────────────────────

// Reads the persisted access token directly from AsyncStorage rather than
// going through the Zustand auth store/api client, since those rely on React
// being mounted and the persist middleware having hydrated — neither is
// guaranteed in a cold headless background invocation (same reasoning as
// incomingCallNotification.ts's rejectCallViaHttp).
async function getPersistedAccessToken(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Sends a reply typed directly into a notification's Reply action, via a
 * plain HTTP call — there's no live socket connection to rely on when the
 * app is backgrounded/killed. Clears that chat's notifications on success,
 * matching WhatsApp's behavior of dismissing the notification once replied to.
 */
export async function sendQuickReply(
  chatId: string,
  content: string,
): Promise<void> {
  if (!API_URL || !content.trim()) return;
  try {
    const token = await getPersistedAccessToken();
    if (!token) return;

    const response = await fetch(`${API_URL}/chats/${chatId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: content.trim(), type: 'text' }),
    });

    if (response.ok) {
      await clearChatNotifications(chatId);
    }
  } catch (err) {
    console.warn('[MessagePush] Quick reply failed:', err);
  }
}

// ── FCM background handler ───────────────────────────────────────────────────

function parseMessagePush(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage,
): MessagePushData | null {
  const d = remoteMessage.data;
  if (!d || d.kind !== 'message') return null;
  if (!d.chatId || !d.senderName || !d.content) return null;
  return {
    messageId: String(d.messageId ?? ''),
    chatId: String(d.chatId),
    chatName: String(d.chatName ?? d.senderName),
    senderId: String(d.senderId ?? ''),
    senderName: String(d.senderName),
    messageType: (d.messageType as MessagePushData['messageType']) ?? 'text',
    content: String(d.content),
  };
}

/**
 * Handles a data FCM message while the app is backgrounded or killed.
 * Registered in index.js alongside the call push handler.
 */
export async function handleMessagePushMessage(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage,
): Promise<void> {
  const data = parseMessagePush(remoteMessage);
  if (!data) return;
  await displayMessageNotification(data);
}
