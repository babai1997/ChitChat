import { idbGet, idbSet } from './idbKeyval';

// Persists decrypted plaintext by message id, separate from — and in
// addition to — the ratchet session state. This is not optional caching: a
// Double Ratchet message key is single-use, so a message that's already been
// decrypted once can never be decrypted again from its cipher. Without this,
// every page reload (chatStore is plain in-memory, no persist middleware)
// would re-fetch history and try to re-decrypt every message, and every one
// of them beyond the very first load would fail with "nonce mismatch".
const STORE_KEY_PREFIX = 'plaintext:';

export async function getCachedPlaintext(messageId: string): Promise<string | null> {
  return idbGet<string>(STORE_KEY_PREFIX + messageId);
}

export async function setCachedPlaintext(messageId: string, plaintext: string): Promise<void> {
  await idbSet(STORE_KEY_PREFIX + messageId, plaintext);
}
