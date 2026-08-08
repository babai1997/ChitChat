import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import type { KeyPair } from './identity';
import { bytesToBase64, base64ToBytes } from './base64';

// Double Ratchet (https://signal.org/docs/specifications/doubleratchet/) —
// gives each message its OWN encryption key, derived by ratcheting two
// chains forward:
//   - a symmetric-key ratchet (HMAC chain) that advances on every message,
//     so compromising one message key never reveals any other
//   - a Diffie-Hellman ratchet that advances a fresh DH exchange every time
//     the conversation's "turn" changes (a reply arrives), which is what
//     gives forward secrecy even if a party's current chain key leaks
//
// This is deliberately a from-scratch implementation against the public
// spec (see E2EE_PLAN.md), not a port of libsignal — correctness here rests
// on this file and its tests, not on reusing a battle-tested library.

const ROOT_INFO = new TextEncoder().encode('ChitChat-DR-Root-v1');
const CHAIN_INFO = new TextEncoder().encode('ChitChat-DR-Chain-v1');
const MSG_KEY_SEED = new Uint8Array([0x01]);
const CHAIN_KEY_SEED = new Uint8Array([0x02]);
const MAX_SKIP = 1000; // bounded skipped-message-key store — caps memory/storage, not correctness

export interface MessageHeader {
  ratchetPublicKey: string; // base64 — sender's current DH ratchet public key
  previousChainLength: number; // N: how many messages were sent on the previous sending chain
  messageNumber: number; // n: index within the current sending chain
}

export interface EncryptedMessage {
  header: MessageHeader;
  ciphertext: string; // base64
  nonce: string; // base64
}

interface ChainState {
  key: Uint8Array | null;
  messageNumber: number;
}

export interface RatchetSessionState {
  rootKey: Uint8Array;
  dhSelf: KeyPair | null; // our current ratchet key pair
  dhRemote: Uint8Array | null; // their current ratchet public key
  sendingChain: ChainState;
  receivingChain: ChainState;
  previousSendingChainLength: number;
  // skipped message keys, keyed by `${base64(ratchetPublicKey)}:${messageNumber}`,
  // for messages that arrive out of order relative to a DH ratchet step.
  skippedMessageKeys: Map<string, Uint8Array>;
}

function dh(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(secretKey, publicKey);
}

function kdfRootKey(rootKey: Uint8Array, dhOutput: Uint8Array): { rootKey: Uint8Array; chainKey: Uint8Array } {
  const output = hkdf(sha256, dhOutput, rootKey, ROOT_INFO, 64);
  return { rootKey: output.slice(0, 32), chainKey: output.slice(32, 64) };
}

function kdfChainKey(chainKey: Uint8Array): { chainKey: Uint8Array; messageKey: Uint8Array } {
  // Signal's spec uses HMAC with fixed single-byte inputs to derive both the
  // next chain key and the current message key from the same chain key.
  return {
    messageKey: hmac(sha256, chainKey, MSG_KEY_SEED),
    chainKey: hmac(sha256, chainKey, CHAIN_KEY_SEED),
  };
}

function deriveNonceAndKey(messageKey: Uint8Array): { key: Uint8Array; nonce: Uint8Array } {
  // messageKey (32B) -> 32B AEAD key + 24B XChaCha20 nonce via HKDF-expand.
  const okm = hkdf(sha256, messageKey, undefined, CHAIN_INFO, 56);
  return { key: okm.slice(0, 32), nonce: okm.slice(32, 56) };
}

function skipKey(ratchetPublicKey: Uint8Array, messageNumber: number): string {
  return `${bytesToBase64(ratchetPublicKey)}:${messageNumber}`;
}

/** Alice's side, right after X3DH: she initiates the ratchet toward Bob's signed prekey. */
export function initSessionAsSender(sharedSecret: Uint8Array, theirRatchetPublicKey: Uint8Array): RatchetSessionState {
  const dhSelf = x25519.keygen();
  const dhOutput = dh(dhSelf.secretKey, theirRatchetPublicKey);
  const { rootKey, chainKey } = kdfRootKey(sharedSecret, dhOutput);
  return {
    rootKey,
    dhSelf,
    dhRemote: theirRatchetPublicKey,
    sendingChain: { key: chainKey, messageNumber: 0 },
    receivingChain: { key: null, messageNumber: 0 },
    previousSendingChainLength: 0,
    skippedMessageKeys: new Map(),
  };
}

/** Bob's side: he doesn't ratchet forward until Alice's first message arrives. */
export function initSessionAsReceiver(sharedSecret: Uint8Array, ourRatchetKeyPair: KeyPair): RatchetSessionState {
  return {
    rootKey: sharedSecret,
    dhSelf: ourRatchetKeyPair,
    dhRemote: null,
    sendingChain: { key: null, messageNumber: 0 },
    receivingChain: { key: null, messageNumber: 0 },
    previousSendingChainLength: 0,
    skippedMessageKeys: new Map(),
  };
}

function dhRatchetStep(state: RatchetSessionState, theirNewRatchetPublicKey: Uint8Array): void {
  state.previousSendingChainLength = state.sendingChain.messageNumber;
  state.dhRemote = theirNewRatchetPublicKey;

  // Receiving side of the new chain: DH(ourOldKey, theirNewKey)
  const recvDh = dh(state.dhSelf!.secretKey, theirNewRatchetPublicKey);
  const recvKdf = kdfRootKey(state.rootKey, recvDh);
  state.rootKey = recvKdf.rootKey;
  state.receivingChain = { key: recvKdf.chainKey, messageNumber: 0 };

  // Generate our own fresh ratchet key pair, then derive the sending chain
  // from DH(ourNewKey, theirNewKey) — this is the step that gives forward
  // secrecy: our old ratchet private key is discarded and never reused.
  state.dhSelf = x25519.keygen();
  const sendDh = dh(state.dhSelf.secretKey, theirNewRatchetPublicKey);
  const sendKdf = kdfRootKey(state.rootKey, sendDh);
  state.rootKey = sendKdf.rootKey;
  state.sendingChain = { key: sendKdf.chainKey, messageNumber: 0 };
}

export function ratchetEncrypt(
  state: RatchetSessionState,
  plaintext: Uint8Array,
  associatedData?: Uint8Array,
): EncryptedMessage {
  if (!state.sendingChain.key) {
    throw new Error('DoubleRatchet: no sending chain — call initSessionAsSender first, or wait for the peer\'s first message');
  }
  const { chainKey, messageKey } = kdfChainKey(state.sendingChain.key);
  const messageNumber = state.sendingChain.messageNumber;
  state.sendingChain = { key: chainKey, messageNumber: messageNumber + 1 };

  const header: MessageHeader = {
    ratchetPublicKey: bytesToBase64(state.dhSelf!.publicKey),
    previousChainLength: state.previousSendingChainLength,
    messageNumber,
  };

  const { key, nonce } = deriveNonceAndKey(messageKey);
  const ciphertext = xchacha20poly1305(key, nonce, associatedData).encrypt(plaintext);

  return { header, ciphertext: bytesToBase64(ciphertext), nonce: bytesToBase64(nonce) };
}

function trySkippedMessageKey(
  state: RatchetSessionState,
  header: MessageHeader,
): Uint8Array | null {
  const cacheKey = skipKey(base64ToBytes(header.ratchetPublicKey), header.messageNumber);
  const messageKey = state.skippedMessageKeys.get(cacheKey);
  if (messageKey) state.skippedMessageKeys.delete(cacheKey);
  return messageKey ?? null;
}

function skipReceivingMessageKeys(state: RatchetSessionState, until: number): void {
  if (!state.receivingChain.key) return;
  if (state.receivingChain.messageNumber + MAX_SKIP < until) {
    throw new Error('DoubleRatchet: too many skipped messages — refusing to buffer unbounded key material');
  }
  let chainKey = state.receivingChain.key;
  let messageNumber = state.receivingChain.messageNumber;
  while (messageNumber < until) {
    const derived = kdfChainKey(chainKey);
    const cacheKey = skipKey(state.dhRemote!, messageNumber);
    state.skippedMessageKeys.set(cacheKey, derived.messageKey);
    chainKey = derived.chainKey;
    messageNumber += 1;
  }
  state.receivingChain = { key: chainKey, messageNumber };
}

export function ratchetDecrypt(
  state: RatchetSessionState,
  message: EncryptedMessage,
  associatedData?: Uint8Array,
): Uint8Array {
  // Everything below runs against a draft clone of the mutable session
  // state, committed back onto `state` only after the AEAD authentication
  // check (inside decryptWithMessageKey) actually succeeds. This matters
  // because a replayed or already-consumed message — an old ciphertext
  // decrypted a second time, or a tampered one — legitimately fails that
  // check, and mutating the ratchet chain BEFORE knowing that would corrupt
  // it for every future legitimate message, turning one bad/duplicate
  // message into a permanent denial-of-service for the whole conversation.
  const draft: RatchetSessionState = {
    ...state,
    skippedMessageKeys: new Map(state.skippedMessageKeys),
  };

  const skipped = trySkippedMessageKey(draft, message.header);
  if (skipped) {
    const plaintext = decryptWithMessageKey(skipped, message, associatedData);
    state.skippedMessageKeys = draft.skippedMessageKeys; // commit: consumed skipped key removed
    return plaintext;
  }

  const theirRatchetPublicKey = base64ToBytes(message.header.ratchetPublicKey);
  const isNewRatchetStep =
    !draft.dhRemote || bytesToBase64(draft.dhRemote) !== message.header.ratchetPublicKey;

  if (isNewRatchetStep) {
    // Buffer any messages still in flight on the OLD receiving chain before
    // switching — they'd otherwise become permanently undecryptable.
    if (draft.dhRemote) {
      skipReceivingMessageKeys(draft, message.header.previousChainLength);
    }
    dhRatchetStep(draft, theirRatchetPublicKey);
  }

  skipReceivingMessageKeys(draft, message.header.messageNumber);

  const { chainKey, messageKey } = kdfChainKey(draft.receivingChain.key!);
  draft.receivingChain = { key: chainKey, messageNumber: message.header.messageNumber + 1 };

  const plaintext = decryptWithMessageKey(messageKey, message, associatedData);

  // Only now, with decryption confirmed successful, commit the draft.
  state.rootKey = draft.rootKey;
  state.dhSelf = draft.dhSelf;
  state.dhRemote = draft.dhRemote;
  state.sendingChain = draft.sendingChain;
  state.receivingChain = draft.receivingChain;
  state.previousSendingChainLength = draft.previousSendingChainLength;
  state.skippedMessageKeys = draft.skippedMessageKeys;

  return plaintext;
}

function decryptWithMessageKey(
  messageKey: Uint8Array,
  message: EncryptedMessage,
  associatedData?: Uint8Array,
): Uint8Array {
  const { key, nonce } = deriveNonceAndKey(messageKey);
  const providedNonce = base64ToBytes(message.nonce);
  if (bytesToBase64(nonce) !== bytesToBase64(providedNonce)) {
    throw new Error('DoubleRatchet: nonce mismatch — message key derivation is out of sync');
  }
  return xchacha20poly1305(key, nonce, associatedData).decrypt(base64ToBytes(message.ciphertext));
}

// ── Serialization (secure-storage persistence between app launches) ────────

export interface SerializedRatchetState {
  rootKey: string;
  dhSelf: { publicKey: string; secretKey: string } | null;
  dhRemote: string | null;
  sendingChain: { key: string | null; messageNumber: number };
  receivingChain: { key: string | null; messageNumber: number };
  previousSendingChainLength: number;
  skippedMessageKeys: [string, string][];
}

export function serializeRatchetState(state: RatchetSessionState): SerializedRatchetState {
  return {
    rootKey: bytesToBase64(state.rootKey),
    dhSelf: state.dhSelf
      ? { publicKey: bytesToBase64(state.dhSelf.publicKey), secretKey: bytesToBase64(state.dhSelf.secretKey) }
      : null,
    dhRemote: state.dhRemote ? bytesToBase64(state.dhRemote) : null,
    sendingChain: {
      key: state.sendingChain.key ? bytesToBase64(state.sendingChain.key) : null,
      messageNumber: state.sendingChain.messageNumber,
    },
    receivingChain: {
      key: state.receivingChain.key ? bytesToBase64(state.receivingChain.key) : null,
      messageNumber: state.receivingChain.messageNumber,
    },
    previousSendingChainLength: state.previousSendingChainLength,
    skippedMessageKeys: Array.from(state.skippedMessageKeys.entries()).map(([k, v]) => [k, bytesToBase64(v)]),
  };
}

export function deserializeRatchetState(data: SerializedRatchetState): RatchetSessionState {
  return {
    rootKey: base64ToBytes(data.rootKey),
    dhSelf: data.dhSelf
      ? { publicKey: base64ToBytes(data.dhSelf.publicKey), secretKey: base64ToBytes(data.dhSelf.secretKey) }
      : null,
    dhRemote: data.dhRemote ? base64ToBytes(data.dhRemote) : null,
    sendingChain: {
      key: data.sendingChain.key ? base64ToBytes(data.sendingChain.key) : null,
      messageNumber: data.sendingChain.messageNumber,
    },
    receivingChain: {
      key: data.receivingChain.key ? base64ToBytes(data.receivingChain.key) : null,
      messageNumber: data.receivingChain.messageNumber,
    },
    previousSendingChainLength: data.previousSendingChainLength,
    skippedMessageKeys: new Map(data.skippedMessageKeys.map(([k, v]) => [k, base64ToBytes(v)])),
  };
}
