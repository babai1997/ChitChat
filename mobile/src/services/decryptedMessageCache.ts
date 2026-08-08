import AsyncStorage from '@react-native-async-storage/async-storage';

// Persists decrypted plaintext by message id, separate from — and in
// addition to — the ratchet session state. This is not optional caching: a
// Double Ratchet message key is single-use, so a message that's already been
// decrypted once can never be decrypted again from its cipher. Without this,
// every chat-screen focus (chat/[id].tsx re-fetches history on every focus)
// or app restart would try to re-decrypt already-seen messages and fail with
// "nonce mismatch".
const STORE_KEY_PREFIX = 'chitchat_e2ee_plaintext_';

export async function getCachedPlaintext(messageId: string): Promise<string | null> {
  return AsyncStorage.getItem(STORE_KEY_PREFIX + messageId);
}

export async function setCachedPlaintext(messageId: string, plaintext: string): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY_PREFIX + messageId, plaintext);
}
