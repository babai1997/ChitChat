import { scryptAsync } from '@noble/hashes/scrypt';
import { utf8ToBytes } from '@noble/hashes/utils';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { bytesToBase64, base64ToBytes } from './base64';

// Phase 4b (passphrase-encrypted chat backup, see E2EE_PLAN.md) — the
// fallback for when no other device is online to sync from (Phase 4a's
// scope). Uses scrypt rather than the plan's original Argon2id: Argon2
// implementations are WASM/native, and this whole package is deliberately
// pure-TS so mobile stays inside Expo Go (no custom dev client). scrypt is
// the same "memory-hard KDF" family, pure JS, and already available via
// @noble/hashes (an existing dependency).
//
// These parameters are a deliberate ~0.5-1.5s cost on typical hardware —
// callers MUST show a loading state, not treat this as instant.
const SCRYPT_OPTS = { N: 2 ** 16, r: 8, p: 1, dkLen: 32 };

export interface EncryptedBackup {
  salt: string; // base64 — not secret, just needs to match at restore time
  nonce: string; // base64, 24 bytes (XChaCha20's extended nonce)
  ciphertext: string; // base64
}

export function generateBackupSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function deriveBackupKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  return scryptAsync(utf8ToBytes(passphrase), salt, SCRYPT_OPTS);
}

/** Encrypts `plaintext` with a freshly-generated random salt — call once per backup creation/update. */
export async function encryptBackup(passphrase: string, plaintext: Uint8Array): Promise<EncryptedBackup> {
  const salt = generateBackupSalt();
  const key = await deriveBackupKey(passphrase, salt);
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);
  return { salt: bytesToBase64(salt), nonce: bytesToBase64(nonce), ciphertext: bytesToBase64(ciphertext) };
}

/**
 * Decrypts a backup fetched from the server. Throws on a wrong passphrase
 * (AEAD tag mismatch) — callers must catch this and show "Incorrect
 * passphrase," not let it surface as an unhandled crash.
 */
export async function decryptBackup(
  passphrase: string,
  backup: EncryptedBackup,
): Promise<Uint8Array> {
  const key = await deriveBackupKey(passphrase, base64ToBytes(backup.salt));
  return xchacha20poly1305(key, base64ToBytes(backup.nonce)).decrypt(base64ToBytes(backup.ciphertext));
}
