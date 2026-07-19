import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  EventType,
} from '@notifee/react-native';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_STORAGE_KEY = 'chitchat-auth';

export interface IncomingCallPushData {
  callId: string;
  chatId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  type: 'audio' | 'video';
}

/**
 * 'ring' — app was opened by tapping the notification body; show the normal
 *          in-app incoming-call screen so the user can answer/decline there.
 * 'answer' — user tapped the notification's Answer action; skip straight to
 *          answering once the app boots.
 */
export type PendingCallAction = 'ring' | 'answer';

export interface PendingCall extends IncomingCallPushData {
  action: PendingCallAction;
}

const CHANNEL_ID = 'incoming-calls';
const PENDING_CALL_KEY = 'pending_call_from_push';

// ── Android notification channel ─────────────────────────────────────────────

let channelReady: Promise<void> | null = null;

export function ensureCallNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelReady) {
    channelReady = notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Incoming calls',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
      vibration: true,
    }).then(() => undefined);
  }
  return channelReady;
}

// ── Display / cancel ──────────────────────────────────────────────────────────

export async function displayIncomingCallNotification(
  data: IncomingCallPushData,
): Promise<void> {
  await ensureCallNotificationChannel();

  await notifee.displayNotification({
    id: data.callId,
    title: data.callerName,
    body: data.type === 'video' ? 'Incoming video call' : 'Incoming voice call',
    android: {
      channelId: CHANNEL_ID,
      category: AndroidCategory.CALL,
      importance: AndroidImportance.HIGH,
      ongoing: true,
      autoCancel: false,
      loopSound: true,
      timestamp: Date.now(),
      showTimestamp: true,
      fullScreenAction: {
        id: 'default',
        launchActivity: 'default',
      },
      pressAction: {
        id: 'default',
        launchActivity: 'default',
      },
      actions: [
        {
          title: 'Decline',
          pressAction: { id: 'decline' },
        },
        {
          title: 'Answer',
          pressAction: { id: 'answer', launchActivity: 'default' },
        },
      ],
    },
  });
}

export async function cancelIncomingCallNotification(callId: string): Promise<void> {
  try { await notifee.cancelNotification(callId); } catch {}
  try { await notifee.stopForegroundService(); } catch {}
}

// ── Pending-call storage (cold-start reconciliation) ─────────────────────────

export async function savePendingCall(call: PendingCall): Promise<void> {
  await AsyncStorage.setItem(PENDING_CALL_KEY, JSON.stringify(call));
}

export async function getPendingCall(): Promise<PendingCall | null> {
  const raw = await AsyncStorage.getItem(PENDING_CALL_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingCall;
  } catch {
    return null;
  }
}

export async function clearPendingCall(callId?: string): Promise<void> {
  if (callId) {
    const current = await getPendingCall();
    if (current && current.callId !== callId) return; // a newer call has since arrived — don't clobber it
  }
  await AsyncStorage.removeItem(PENDING_CALL_KEY);
}

// ── Reject via HTTP (headless-safe) ──────────────────────────────────────────
// Declining from the notification may run with no live socket connection at
// all (backgrounded/killed app) — a plain HTTP call is the only reliable way
// to tell the caller immediately, instead of them waiting out the ~45s server
// ring timeout. Reads the persisted access token directly from AsyncStorage
// rather than going through the Zustand auth store/api client, since those
// rely on React being mounted and the persist middleware having hydrated —
// neither is guaranteed in a cold headless background invocation.
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

export async function rejectCallViaHttp(chatId: string, callerId: string): Promise<void> {
  if (!API_URL) return;
  try {
    const token = await getPersistedAccessToken();
    if (!token) return;

    await fetch(`${API_URL}/calls/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ chatId, callerId }),
    });
  } catch (err) {
    console.warn('[CallPush] Failed to notify caller of decline:', err);
  }
}

// ── FCM data message handling (shared by foreground + background handlers) ──

type CallPushMessage =
  | ({ kind: 'call' } & IncomingCallPushData)
  | { kind: 'call_cancel'; callId: string };

function parseCallPushMessage(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage,
): CallPushMessage | null {
  const data = remoteMessage.data;
  if (!data || typeof data.kind !== 'string') return null;

  if (data.kind === 'call') {
    const { callId, chatId, callerId, callerName, callerAvatar, type } = data;
    if (!callId || !chatId || !callerId || !callerName || !type) return null;
    return {
      kind: 'call',
      callId: String(callId),
      chatId: String(chatId),
      callerId: String(callerId),
      callerName: String(callerName),
      callerAvatar: callerAvatar ? String(callerAvatar) : undefined,
      type: type === 'video' ? 'video' : 'audio',
    };
  }

  if (data.kind === 'call_cancel' && data.callId) {
    return { kind: 'call_cancel', callId: String(data.callId) };
  }

  return null;
}

/**
 * Handles a data-only FCM message received while the app is backgrounded or
 * fully killed — registered as the background handler in index.js. Also
 * usable from the foreground listener, though in practice the foreground
 * case is a no-op there since the live socket connection already shows the
 * in-app incoming-call screen (see CallContext.tsx's handleIncoming).
 */
export async function handleCallPushMessage(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage,
): Promise<void> {
  const message = parseCallPushMessage(remoteMessage);
  if (!message) return;

  if (message.kind === 'call') {
    const { kind: _kind, ...data } = message;
    await savePendingCall({ ...data, action: 'ring' });
    await displayIncomingCallNotification(data);
  } else {
    await clearPendingCall(message.callId);
    await cancelIncomingCallNotification(message.callId);
  }
}

/**
 * Handles Answer/Decline taps and the notification being dismissed — wired
 * to notifee.onBackgroundEvent in index.js.
 */
export async function handleNotifeeCallEvent({
  type,
  detail,
}: {
  type: EventType;
  detail: { notification?: { id?: string }; pressAction?: { id: string } };
}): Promise<void> {
  const callId = detail.notification?.id;
  if (!callId) return;

  if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'decline') {
    const pending = await getPendingCall();
    if (pending && pending.callId === callId) {
      await rejectCallViaHttp(pending.chatId, pending.callerId);
    }
    await clearPendingCall(callId);
    await cancelIncomingCallNotification(callId);
    return;
  }

  if (
    type === EventType.PRESS ||
    (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'answer')
  ) {
    const pending = await getPendingCall();
    if (pending && pending.callId === callId) {
      await savePendingCall({
        ...pending,
        action: detail.pressAction?.id === 'answer' ? 'answer' : 'ring',
      });
    }
    await cancelIncomingCallNotification(callId);
  }
}
