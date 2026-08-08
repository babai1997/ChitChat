import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import type { IdentityKeys, KeyPair, PublicIdentityBundle } from './identity';
import { verifySignedPreKey } from './identity';
import { bytesToBase64, base64ToBytes } from './base64';

// X3DH ("Extended Triple Diffie-Hellman") — establishes a shared secret
// between two parties who have never talked before, using only public data
// one of them published in advance. This is what makes it possible to send
// the FIRST message to someone who is offline: no round trip is needed.
//
// Following Signal's X3DH spec (https://signal.org/docs/specifications/x3dh/):
//   DH1 = DH(IK_A,  SPK_B)   — our identity vs. their signed prekey
//   DH2 = DH(EK_A,  IK_B)    — our fresh ephemeral vs. their identity
//   DH3 = DH(EK_A,  SPK_B)   — our fresh ephemeral vs. their signed prekey
//   DH4 = DH(EK_A, OPK_B)    — our fresh ephemeral vs. their one-time prekey (if one was available)
//   SK  = KDF(DH1 || DH2 || DH3 || DH4)
// Bob (the responder) recomputes the identical DH1..DH4 from his own private
// keys plus Alice's public keys included in her first message, and lands on
// the same SK — without ever being online at the time Alice sent it.

const INFO = new TextEncoder().encode('ChitChat-X3DH-v1');
const F = new Uint8Array(32).fill(0xff); // "curve25519 discard" padding prefix, per the X3DH spec

function dh(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(secretKey, publicKey);
}

function kdf(dhOutputs: Uint8Array[]): Uint8Array {
  const ikm = new Uint8Array(F.length + dhOutputs.reduce((n, d) => n + d.length, 0));
  ikm.set(F, 0);
  let offset = F.length;
  for (const d of dhOutputs) {
    ikm.set(d, offset);
    offset += d.length;
  }
  const salt = new Uint8Array(32); // zero salt — all entropy comes from the DH outputs themselves
  return hkdf(sha256, ikm, salt, INFO, 32);
}

export interface InitialMessageHeader {
  senderIdentityDhKey: string; // base64 x25519 — Alice's IK_dh public key
  senderEphemeralKey: string; // base64 x25519 — Alice's EK public key, fresh per session
  recipientSignedPreKeyId: number;
  recipientOneTimePreKeyId?: number; // which OTPK Bob should mark used/consumed, if any
}

export interface OutboundX3dhResult {
  sharedSecret: Uint8Array;
  header: InitialMessageHeader;
}

/**
 * Alice's side: given Bob's published bundle (fetched from the server), derive
 * the shared secret and the header Alice must send alongside her first
 * Double-Ratchet message so Bob can derive the same secret.
 */
export function initiateSession(
  myIdentity: IdentityKeys,
  theirBundle: PublicIdentityBundle,
): OutboundX3dhResult {
  if (!verifySignedPreKey(theirBundle)) {
    throw new Error('X3DH: signed prekey signature verification failed — possible MITM or corrupted bundle');
  }

  const theirIdentityDhKey = base64ToBytes(theirBundle.identityDhKey);
  const theirSignedPreKey = base64ToBytes(theirBundle.signedPreKeyPub);
  const ephemeral: KeyPair = x25519.keygen();

  const dh1 = dh(myIdentity.dhKeyPair.secretKey, theirSignedPreKey);
  const dh2 = dh(ephemeral.secretKey, theirIdentityDhKey);
  const dh3 = dh(ephemeral.secretKey, theirSignedPreKey);

  const otpk = theirBundle.oneTimePreKeys[0];
  const dhOutputs = [dh1, dh2, dh3];
  if (otpk) {
    dhOutputs.push(dh(ephemeral.secretKey, base64ToBytes(otpk.publicKey)));
  }

  const sharedSecret = kdf(dhOutputs);

  return {
    sharedSecret,
    header: {
      senderIdentityDhKey: bytesToBase64(myIdentity.dhKeyPair.publicKey),
      senderEphemeralKey: bytesToBase64(ephemeral.publicKey),
      recipientSignedPreKeyId: theirBundle.signedPreKeyId,
      recipientOneTimePreKeyId: otpk?.keyId,
    },
  };
}

/**
 * Bob's side: given Alice's header (received in her first message) and Bob's
 * own private keys for the signed prekey / one-time prekey referenced in it,
 * derive the same shared secret X3DH guarantees Alice already computed.
 */
export function receiveSession(
  myIdentity: IdentityKeys,
  header: InitialMessageHeader,
): Uint8Array {
  const signedPreKey =
    myIdentity.signedPreKey.keyId === header.recipientSignedPreKeyId
      ? myIdentity.signedPreKey.keyPair
      : null;
  if (!signedPreKey) {
    throw new Error('X3DH: referenced signed prekey not found — it may have rotated');
  }

  const theirIdentityDhKey = base64ToBytes(header.senderIdentityDhKey);
  const theirEphemeralKey = base64ToBytes(header.senderEphemeralKey);

  const dh1 = dh(signedPreKey.secretKey, theirIdentityDhKey);
  const dh2 = dh(myIdentity.dhKeyPair.secretKey, theirEphemeralKey);
  const dh3 = dh(signedPreKey.secretKey, theirEphemeralKey);

  const dhOutputs = [dh1, dh2, dh3];
  if (header.recipientOneTimePreKeyId !== undefined) {
    const otpk = myIdentity.oneTimePreKeys.find((k) => k.keyId === header.recipientOneTimePreKeyId);
    if (!otpk) {
      throw new Error('X3DH: referenced one-time prekey not found — already consumed or never existed');
    }
    dhOutputs.push(dh(otpk.keyPair.secretKey, theirEphemeralKey));
  }

  return kdf(dhOutputs);
}
