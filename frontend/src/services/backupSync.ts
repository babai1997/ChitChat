import { encryptBackup, decryptBackup, utf8ToBytes, bytesToUtf8 } from '@chitchat/e2ee';
import { backupApi, type EncryptedBackupRecord } from '../api';
import { collectHistorySnapshot, applyDecryptedEntries, type HistorySyncEntry } from './deviceLinkSync';

// Phase 4b (passphrase-encrypted chat backup, see E2EE_PLAN.md) — the
// fallback for when no other device is online to sync from (Phase 4a's
// scope). Reuses collectHistorySnapshot/applyDecryptedEntries from
// deviceLinkSync.ts (the exact same bounded history snapshot, decrypted
// the exact same way) — only the encryption source differs: a passphrase
// -derived key instead of a pairwise Session with another device.

/** Creates or overwrites this account's backup. Returns the entry count for the success toast. */
export async function createOrUpdateBackup(passphrase: string): Promise<number> {
  const entries = await collectHistorySnapshot();
  const plaintext = utf8ToBytes(JSON.stringify(entries));
  const { salt, nonce, ciphertext } = await encryptBackup(passphrase, plaintext);
  await backupApi.upsert(salt, nonce, ciphertext);
  return entries.length;
}

/**
 * Decrypts and applies this account's backup. Throws 'No backup found' if
 * none exists, or lets the AEAD decrypt failure surface as-is on a wrong
 * passphrase — callers must catch both and show a clean error, not crash.
 */
export async function restoreBackup(passphrase: string): Promise<number> {
  const record: EncryptedBackupRecord | null = await backupApi.get();
  if (!record) throw new Error('No backup found');

  const plaintextBytes = await decryptBackup(passphrase, record);
  const entries: HistorySyncEntry[] = JSON.parse(bytesToUtf8(plaintextBytes));
  await applyDecryptedEntries(entries);
  return entries.length;
}

export async function deleteBackup(): Promise<void> {
  await backupApi.delete();
}

export async function hasBackup(): Promise<{ exists: boolean; updatedAt?: string }> {
  const record = await backupApi.get();
  return record ? { exists: true, updatedAt: record.updatedAt } : { exists: false };
}
