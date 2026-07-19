import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import messaging from '@react-native-firebase/messaging';
import { api } from '../api/client';

const DEVICE_ID_KEY = 'call_push_device_id';

/** Stable per-install id — identifies this device/install to the backend's PushToken table. */
async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const deviceId = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  // Android 13+ requires runtime permission for notifications.
  if (Platform.Version >= 33) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}

/**
 * Registers this device for call wake-up push notifications — call once the
 * user is authenticated (see SocketProvider.tsx's auth-gated effect for the
 * equivalent socket-connect pattern). Safe to call repeatedly; the backend
 * upserts by (userId, deviceId, tokenType).
 */
export async function registerCallPushToken(): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) {
      console.warn('[CallPush] Notification permission denied — incoming calls will not wake the app when backgrounded/killed.');
      return;
    }

    const deviceId = await getOrCreateDeviceId();
    const token = await messaging().getToken();

    await api.post('/push/register', {
      deviceId,
      platform: 'android',
      tokenType: 'fcm',
      token,
    });
  } catch (err) {
    console.warn('[CallPush] Failed to register push token:', err);
  }
}

/** Call on logout so this device stops receiving call pushes for the signed-out user. */
export async function unregisterCallPushToken(): Promise<void> {
  try {
    const deviceId = await getOrCreateDeviceId();
    await api.post('/push/unregister', { deviceId });
  } catch (err) {
    console.warn('[CallPush] Failed to unregister push token:', err);
  }
}

/**
 * FCM rotates tokens occasionally — re-register whenever that happens.
 * Call once from app startup; returns an unsubscribe function.
 */
export function subscribeToCallPushTokenRefresh(): () => void {
  return messaging().onTokenRefresh(() => {
    void registerCallPushToken();
  });
}
