import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
} from '@notifee/react-native';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';

const CHANNEL_ID = 'chat-messages';

// ── Notification channel ─────────────────────────────────────────────────────

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

// ── Types ────────────────────────────────────────────────────────────────────

export interface MessagePushData {
  chatId: string;
  chatName: string;
  senderId: string;
  senderName: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'file';
  content: string;
}

// ── Display ──────────────────────────────────────────────────────────────────

/**
 * Shows a Notifee notification for an incoming chat message.
 * Uses chatId as the notification ID so later messages from the same
 * chat replace the earlier ones in the tray (grouped per conversation).
 */
export async function displayMessageNotification(
  data: MessagePushData,
): Promise<void> {
  await ensureMessageNotificationChannel();

  await notifee.displayNotification({
    id: `chat-${data.chatId}`,
    title: data.senderName,
    body: data.content,
    data: { kind: 'message', chatId: data.chatId },
    android: {
      channelId: CHANNEL_ID,
      category: AndroidCategory.MESSAGE,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PRIVATE,
      pressAction: {
        id: 'default',
        launchActivity: 'default',
      },
      showTimestamp: true,
      timestamp: Date.now(),
    },
  });
}

// ── FCM background handler ───────────────────────────────────────────────────

function parseMessagePush(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage,
): MessagePushData | null {
  const d = remoteMessage.data;
  if (!d || d.kind !== 'message') return null;
  if (!d.chatId || !d.senderName || !d.content) return null;
  return {
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
