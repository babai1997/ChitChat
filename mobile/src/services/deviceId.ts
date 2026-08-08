import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// Shared stable per-install id — identifies this device/install both to the
// backend's PushToken table (callPush.ts) and to its E2EE Device table
// (e2ee/identity.ts). One physical install = one deviceId used everywhere,
// so a device only ever has a single E2EE session key and a single push
// token registration to keep straight.
const DEVICE_ID_KEY = 'chitchat_device_id';
const LEGACY_DEVICE_ID_KEY = 'call_push_device_id'; // pre-E2EE key — migrated in, not replaced, so existing installs keep their PushToken rows

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const legacy = await AsyncStorage.getItem(LEGACY_DEVICE_ID_KEY);
  const deviceId = legacy || Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
