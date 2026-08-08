import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  generateIdentity,
  serializeIdentity,
  deserializeIdentity,
  toPublicBundle,
  type IdentityKeys,
  type SerializedIdentity,
} from '@chitchat/e2ee';
import { api } from '../api/client';
import { getOrCreateDeviceId } from './deviceId';

// Persists this device's E2EE private key material in the OS keychain
// (iOS Keychain / Android Keystore via expo-secure-store) — never
// AsyncStorage, which is unencrypted plain-file storage. Private keys must
// never leave the device; only generateIdentity()'s public bundle is ever
// sent to the server (see keys.controller.ts on the backend).
const IDENTITY_STORAGE_KEY = 'chitchat_e2ee_identity';

let cachedIdentity: IdentityKeys | null = null;

async function loadIdentity(): Promise<IdentityKeys | null> {
  if (cachedIdentity) return cachedIdentity;
  const raw = await SecureStore.getItemAsync(IDENTITY_STORAGE_KEY);
  if (!raw) return null;
  cachedIdentity = deserializeIdentity(JSON.parse(raw) as SerializedIdentity);
  return cachedIdentity;
}

async function saveIdentity(identity: IdentityKeys): Promise<void> {
  cachedIdentity = identity;
  await SecureStore.setItemAsync(IDENTITY_STORAGE_KEY, JSON.stringify(serializeIdentity(identity)));
}

/** Returns this device's identity, generating and persisting one on first call. */
export async function getOrCreateIdentity(): Promise<IdentityKeys> {
  const existing = await loadIdentity();
  if (existing) return existing;

  const identity = generateIdentity();
  await saveIdentity(identity);
  return identity;
}

/**
 * Registers (or refreshes) this device's E2EE identity with the backend.
 * Safe to call on every login/app-start — the server upserts by
 * (userId, deviceId). Call once the user is authenticated, alongside
 * registerCallPushToken() (see SocketProvider.tsx).
 */
export async function registerE2eeDevice(): Promise<void> {
  try {
    const identity = await getOrCreateIdentity();
    const deviceId = await getOrCreateDeviceId();
    const bundle = toPublicBundle(identity);

    await api.post('/devices/register', {
      deviceId,
      identityKey: bundle.identityKey,
      identityDhKey: bundle.identityDhKey,
      registrationId: bundle.registrationId,
      signedPreKeyId: bundle.signedPreKeyId,
      signedPreKeyPub: bundle.signedPreKeyPub,
      signedPreKeySig: bundle.signedPreKeySig,
      oneTimePreKeys: bundle.oneTimePreKeys,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });

    // Phase 4a (device-linking history sync) — fallback for when the live
    // device:link-approved push was missed. No-op once already synced.
    const { checkDeviceLinkStatus } = await import('./deviceLinkSync');
    void checkDeviceLinkStatus();
  } catch (err) {
    console.warn('[E2EE] Failed to register device identity:', err);
  }
}
