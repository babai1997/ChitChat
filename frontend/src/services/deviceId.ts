// Stable per-browser-profile id — identifies this "device" to the backend's
// Device table. Not secret (unlike the identity keys in e2ee.ts), so plain
// localStorage is fine here — it's just an opaque label, never key material.
const DEVICE_ID_KEY = 'chitchat-device-id';

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const deviceId = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
