import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { bytesToBase64, base64ToBytes } from './base64';

// Phase 3 (attachments) — a per-attachment random content key + nonce,
// AEAD-encrypting the raw file bytes BEFORE upload, so Cloudinary only ever
// stores an opaque blob it can't interpret. Deliberately independent of the
// Double Ratchet / Sender Key chains: the key/nonce here travel INSIDE the
// already-encrypted message envelope (see e2eeAttachments.ts), not derived
// from a chat session, so an attachment's confidentiality doesn't depend on
// keeping a ratchet chain in sync — a photo sent once should decrypt for as
// long as the message itself does, independent of chain advancement.

export interface EncryptedAttachment {
  ciphertext: Uint8Array;
  key: string; // base64, 32 bytes
  nonce: string; // base64, 24 bytes (XChaCha20's extended nonce)
}

/** Encrypts raw file bytes with a freshly-generated random key — call once per attachment, never reused. */
export function encryptAttachmentBytes(plaintext: Uint8Array): EncryptedAttachment {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);
  return { ciphertext, key: bytesToBase64(key), nonce: bytesToBase64(nonce) };
}

/** Decrypts an attachment's ciphertext using the key/nonce carried in the message's encrypted envelope. */
export function decryptAttachmentBytes(
  ciphertext: Uint8Array,
  key: string,
  nonce: string,
): Uint8Array {
  return xchacha20poly1305(base64ToBytes(key), base64ToBytes(nonce)).decrypt(ciphertext);
}
