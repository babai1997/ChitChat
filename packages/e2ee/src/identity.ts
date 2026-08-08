import { ed25519, x25519 } from '@noble/curves/ed25519';
import { bytesToBase64, base64ToBytes } from './base64';

// ── Key pair helpers ─────────────────────────────────────────────────────────
//
// Two independent key pairs per identity, matching the two things Signal's
// single Curve25519 identity key does via a birational map — we keep them
// separate instead, which is simpler to implement correctly from scratch and
// is not required to be wire-compatible with Signal:
//   - an Ed25519 pair used ONLY to sign the rotating signed prekey
//   - an X25519 pair used for the identity's own Diffie-Hellman contribution
//     to X3DH (DH1 in x3dh.ts)

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface SignedPreKey {
  keyId: number;
  keyPair: KeyPair; // x25519
  signature: Uint8Array; // ed25519 signature over keyPair.publicKey, by the identity signing key
}

export interface OneTimePreKey {
  keyId: number;
  keyPair: KeyPair; // x25519
}

export interface IdentityKeys {
  signingKeyPair: KeyPair; // ed25519 — signs signed prekeys
  dhKeyPair: KeyPair; // x25519 — X3DH DH1 contribution
  registrationId: number;
  signedPreKey: SignedPreKey;
  oneTimePreKeys: OneTimePreKey[];
}

/** The subset of identity data that's safe to upload to the server / share with peers. */
export interface PublicIdentityBundle {
  identityKey: string; // base64 ed25519 public key (signing)
  identityDhKey: string; // base64 x25519 public key (DH)
  registrationId: number;
  signedPreKeyId: number;
  signedPreKeyPub: string; // base64
  signedPreKeySig: string; // base64
  oneTimePreKeys: { keyId: number; publicKey: string }[];
}

function randomRegistrationId(): number {
  // 14-bit registration id, same range Signal uses — just needs to be
  // non-secret and distinguish devices, not cryptographically load-bearing.
  const bytes = crypto.getRandomValues(new Uint8Array(2));
  return ((bytes[0] << 8) | bytes[1]) & 0x3fff;
}

function nextKeyId(): number {
  // 31-bit positive int id-space for prekeys; collision odds are irrelevant
  // since ids are scoped per-device and the server enforces (deviceId, keyId)
  // uniqueness.
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return bytes[0] & 0x7fffffff;
}

export function generateSignedPreKey(signingKeyPair: KeyPair, keyId = nextKeyId()): SignedPreKey {
  const keyPair = x25519.keygen();
  const signature = ed25519.sign(keyPair.publicKey, signingKeyPair.secretKey);
  return { keyId, keyPair, signature };
}

export function generateOneTimePreKeys(count: number, startId = nextKeyId()): OneTimePreKey[] {
  const keys: OneTimePreKey[] = [];
  for (let i = 0; i < count; i++) {
    keys.push({ keyId: startId + i, keyPair: x25519.keygen() });
  }
  return keys;
}

/** Generates a brand-new device identity — call once per device, on first login. */
export function generateIdentity(oneTimePreKeyCount = 100): IdentityKeys {
  const signingKeyPair = ed25519.keygen();
  const dhKeyPair = x25519.keygen();
  const signedPreKey = generateSignedPreKey(signingKeyPair);
  const oneTimePreKeys = generateOneTimePreKeys(oneTimePreKeyCount);
  return {
    signingKeyPair,
    dhKeyPair,
    registrationId: randomRegistrationId(),
    signedPreKey,
    oneTimePreKeys,
  };
}

export function toPublicBundle(identity: IdentityKeys): PublicIdentityBundle {
  return {
    identityKey: bytesToBase64(identity.signingKeyPair.publicKey),
    identityDhKey: bytesToBase64(identity.dhKeyPair.publicKey),
    registrationId: identity.registrationId,
    signedPreKeyId: identity.signedPreKey.keyId,
    signedPreKeyPub: bytesToBase64(identity.signedPreKey.keyPair.publicKey),
    signedPreKeySig: bytesToBase64(identity.signedPreKey.signature),
    oneTimePreKeys: identity.oneTimePreKeys.map((k) => ({
      keyId: k.keyId,
      publicKey: bytesToBase64(k.keyPair.publicKey),
    })),
  };
}

/** Verifies a peer's signed prekey was actually signed by their claimed identity key. */
export function verifySignedPreKey(bundle: {
  identityKey: string;
  signedPreKeyPub: string;
  signedPreKeySig: string;
}): boolean {
  return ed25519.verify(
    base64ToBytes(bundle.signedPreKeySig),
    base64ToBytes(bundle.signedPreKeyPub),
    base64ToBytes(bundle.identityKey),
  );
}

// ── Serialization (secure-storage persistence) ──────────────────────────────

export interface SerializedIdentity {
  signingKeyPair: { publicKey: string; secretKey: string };
  dhKeyPair: { publicKey: string; secretKey: string };
  registrationId: number;
  signedPreKey: { keyId: number; publicKey: string; secretKey: string; signature: string };
  oneTimePreKeys: { keyId: number; publicKey: string; secretKey: string }[];
}

export function serializeIdentity(identity: IdentityKeys): SerializedIdentity {
  return {
    signingKeyPair: {
      publicKey: bytesToBase64(identity.signingKeyPair.publicKey),
      secretKey: bytesToBase64(identity.signingKeyPair.secretKey),
    },
    dhKeyPair: {
      publicKey: bytesToBase64(identity.dhKeyPair.publicKey),
      secretKey: bytesToBase64(identity.dhKeyPair.secretKey),
    },
    registrationId: identity.registrationId,
    signedPreKey: {
      keyId: identity.signedPreKey.keyId,
      publicKey: bytesToBase64(identity.signedPreKey.keyPair.publicKey),
      secretKey: bytesToBase64(identity.signedPreKey.keyPair.secretKey),
      signature: bytesToBase64(identity.signedPreKey.signature),
    },
    oneTimePreKeys: identity.oneTimePreKeys.map((k) => ({
      keyId: k.keyId,
      publicKey: bytesToBase64(k.keyPair.publicKey),
      secretKey: bytesToBase64(k.keyPair.secretKey),
    })),
  };
}

export function deserializeIdentity(data: SerializedIdentity): IdentityKeys {
  return {
    signingKeyPair: {
      publicKey: base64ToBytes(data.signingKeyPair.publicKey),
      secretKey: base64ToBytes(data.signingKeyPair.secretKey),
    },
    dhKeyPair: {
      publicKey: base64ToBytes(data.dhKeyPair.publicKey),
      secretKey: base64ToBytes(data.dhKeyPair.secretKey),
    },
    registrationId: data.registrationId,
    signedPreKey: {
      keyId: data.signedPreKey.keyId,
      keyPair: {
        publicKey: base64ToBytes(data.signedPreKey.publicKey),
        secretKey: base64ToBytes(data.signedPreKey.secretKey),
      },
      signature: base64ToBytes(data.signedPreKey.signature),
    },
    oneTimePreKeys: data.oneTimePreKeys.map((k) => ({
      keyId: k.keyId,
      keyPair: { publicKey: base64ToBytes(k.publicKey), secretKey: base64ToBytes(k.secretKey) },
    })),
  };
}
