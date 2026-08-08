import {
  generateIdentity,
  serializeIdentity,
  deserializeIdentity,
  toPublicBundle,
  type IdentityKeys,
  type SerializedIdentity,
} from '@chitchat/e2ee';
import { api } from '../api/client';
import { idbGet, idbSet } from './idbKeyval';
import { getOrCreateDeviceId } from './deviceId';

// Persists this browser profile's E2EE private key material in IndexedDB —
// never localStorage, and never sent anywhere. Only generateIdentity()'s
// public bundle (see toPublicBundle) ever leaves the device, via
// POST /devices/register.
const IDENTITY_STORAGE_KEY = 'identity';

let cachedIdentity: IdentityKeys | null = null;

async function loadIdentity(): Promise<IdentityKeys | null> {
  if (cachedIdentity) return cachedIdentity;
  const stored = await idbGet<SerializedIdentity>(IDENTITY_STORAGE_KEY);
  if (!stored) return null;
  cachedIdentity = deserializeIdentity(stored);
  return cachedIdentity;
}

async function saveIdentity(identity: IdentityKeys): Promise<void> {
  cachedIdentity = identity;
  await idbSet(IDENTITY_STORAGE_KEY, serializeIdentity(identity));
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
 * Safe to call on every login/socket-connect — the server upserts by
 * (userId, deviceId).
 */
export async function registerE2eeDevice(): Promise<void> {
  try {
    const identity = await getOrCreateIdentity();
    const deviceId = getOrCreateDeviceId();
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
      platform: 'web',
    });

    // Phase 4a (device-linking history sync) — fallback for when the live
    // device:link-approved push was missed (e.g. this device was closed
    // at the moment it got approved). No-op once already synced.
    const { checkDeviceLinkStatus } = await import('./deviceLinkSync');
    void checkDeviceLinkStatus();
  } catch (err) {
    console.warn('[E2EE] Failed to register device identity:', err);
  }
}
