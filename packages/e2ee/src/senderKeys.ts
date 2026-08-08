import { ed25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { bytesToBase64, base64ToBytes } from './base64';

// Sender Keys (https://signal.org/docs/specifications/xeddsa/ + Signal's
// group-messaging design) — one symmetric chain per (chat, sending device),
// distributed once to every current member's every device via a
// SenderKeyDistributionMessage, instead of Phase 1's pairwise Double Ratchet
// session per recipient device. A group of N members then costs ONE
// encryption per message, not N, since the ciphertext is identical for
// every recipient.
//
// Two real differences from doubleRatchet.ts's per-pair sessions:
//  - No DH ratchet. There's no "reply" to derive a fresh chain from — this
//    is a one-directional broadcast chain. Forward secrecy against a leaked
//    CURRENT chain key is bounded by rekeying on membership change
//    (chats.service.ts's removeMember/leaveGroup), not by this file.
//  - Authenticity needs an explicit signature. In Double Ratchet, only two
//    parties ever hold a chain key, so AEAD success alone proves the message
//    came from the other party. Here every recipient holds the SAME chain
//    key, so anyone in the group could forge a validly-encrypted message —
//    an Ed25519 signature, verified against a signing public key distributed
//    alongside the chain key, is what actually proves authorship.

const CHAIN_INFO = new TextEncoder().encode('ChitChat-SenderKey-Chain-v1');
const MSG_KEY_SEED = new Uint8Array([0x01]);
const CHAIN_KEY_SEED = new Uint8Array([0x02]);
const MAX_SKIP = 1000; // bounded skipped-message-key store — caps memory/storage, not correctness

export interface SigningKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/** The chain OWNER's state — the only side that ever holds `signingKeyPair.secretKey`. */
export interface SenderKeyState {
  chainId: string; // random per-epoch id — bumped on every rekey (see generateSenderKeyState)
  chainKey: Uint8Array;
  iteration: number;
  signingKeyPair: SigningKeyPair;
}

/** What gets distributed to every recipient device — never contains a secret key. */
export interface SenderKeyDistributionMessage {
  chainId: string;
  iteration: number;
  chainKey: string; // base64
  signingPublicKey: string; // base64
}

export interface SenderKeyMessage {
  chainId: string;
  iteration: number;
  nonce: string; // base64
  ciphertext: string; // base64
  signature: string; // base64 — Ed25519 sig over (chainId, iteration, nonce, ciphertext) by the chain owner
}

/** A recipient's view of one sender's chain — no secret signing key, just the public key to verify against. */
export interface ReceivingChainState {
  chainKey: Uint8Array;
  iteration: number;
  signingPublicKey: Uint8Array;
  skippedMessageKeys: Map<number, Uint8Array>;
}

function randomChainId(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

function kdfChainKey(chainKey: Uint8Array): { chainKey: Uint8Array; messageKey: Uint8Array } {
  return {
    messageKey: hmac(sha256, chainKey, MSG_KEY_SEED),
    chainKey: hmac(sha256, chainKey, CHAIN_KEY_SEED),
  };
}

function deriveNonceAndKey(messageKey: Uint8Array): { key: Uint8Array; nonce: Uint8Array } {
  // messageKey (32B) -> 32B AEAD key + 24B XChaCha20 nonce, same construction as doubleRatchet.ts.
  const okm = hkdf(sha256, messageKey, undefined, CHAIN_INFO, 56);
  return { key: okm.slice(0, 32), nonce: okm.slice(32, 56) };
}

function signatureInput(chainId: string, iteration: number, nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const header = new TextEncoder().encode(`${chainId}:${iteration}:`);
  const out = new Uint8Array(header.length + nonce.length + ciphertext.length);
  out.set(header, 0);
  out.set(nonce, header.length);
  out.set(ciphertext, header.length + nonce.length);
  return out;
}

/** Generates a brand-new sending chain — call once per (chat, own device), and again on every rekey. */
export function generateSenderKeyState(): SenderKeyState {
  return {
    chainId: randomChainId(),
    chainKey: crypto.getRandomValues(new Uint8Array(32)),
    iteration: 0,
    signingKeyPair: ed25519.keygen(),
  };
}

/** What the chain owner sends (pairwise, via a Phase-1 Double Ratchet session) to every recipient device. */
export function createDistributionMessage(state: SenderKeyState): SenderKeyDistributionMessage {
  return {
    chainId: state.chainId,
    iteration: state.iteration,
    chainKey: bytesToBase64(state.chainKey),
    signingPublicKey: bytesToBase64(state.signingKeyPair.publicKey),
  };
}

/** Encrypts on the owning device's sending chain, advancing it (mutates `state`). */
export function senderKeyEncrypt(state: SenderKeyState, plaintext: Uint8Array): SenderKeyMessage {
  const { chainKey, messageKey } = kdfChainKey(state.chainKey);
  const iteration = state.iteration;
  state.chainKey = chainKey;
  state.iteration = iteration + 1;

  const { key, nonce } = deriveNonceAndKey(messageKey);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);
  const signature = ed25519.sign(
    signatureInput(state.chainId, iteration, nonce, ciphertext),
    state.signingKeyPair.secretKey,
  );

  return {
    chainId: state.chainId,
    iteration,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
    signature: bytesToBase64(signature),
  };
}

/** A recipient seeds its view of a sender's chain from the distributed message. */
export function initReceivingChain(dm: SenderKeyDistributionMessage): ReceivingChainState {
  return {
    chainKey: base64ToBytes(dm.chainKey),
    iteration: dm.iteration,
    signingPublicKey: base64ToBytes(dm.signingPublicKey),
    skippedMessageKeys: new Map(),
  };
}

function skipReceivingKeys(state: ReceivingChainState, until: number): void {
  if (state.iteration + MAX_SKIP < until) {
    throw new Error('SenderKey: too many skipped messages — refusing to buffer unbounded key material');
  }
  let chainKey = state.chainKey;
  let iteration = state.iteration;
  while (iteration < until) {
    const derived = kdfChainKey(chainKey);
    state.skippedMessageKeys.set(iteration, derived.messageKey);
    chainKey = derived.chainKey;
    iteration += 1;
  }
  state.chainKey = chainKey;
  state.iteration = iteration;
}

/**
 * Decrypts + verifies on a recipient's receiving chain, advancing it (mutates
 * `state`) only once both the signature AND the AEAD check succeed. Caller is
 * responsible for picking the right `state` by `msg.chainId` (a device may
 * hold more than one chain per sender across a rekey) — see e2eeSessions.ts.
 */
export function senderKeyDecrypt(state: ReceivingChainState, msg: SenderKeyMessage): Uint8Array {
  const nonce = base64ToBytes(msg.nonce);
  const ciphertext = base64ToBytes(msg.ciphertext);

  const signatureValid = ed25519.verify(
    base64ToBytes(msg.signature),
    signatureInput(msg.chainId, msg.iteration, nonce, ciphertext),
    state.signingPublicKey,
  );
  if (!signatureValid) {
    throw new Error('SenderKey: signature verification failed — message was not sent by this chain\'s owner');
  }

  // Draft-clone-then-commit, same rationale as doubleRatchet.ts's
  // ratchetDecrypt: a failed AEAD check below must never leave the chain
  // partially advanced (a replayed/tampered message would otherwise
  // permanently break decryption of every future legitimate message).
  const draft: ReceivingChainState = { ...state, skippedMessageKeys: new Map(state.skippedMessageKeys) };

  let messageKey = draft.skippedMessageKeys.get(msg.iteration);
  if (messageKey) {
    draft.skippedMessageKeys.delete(msg.iteration);
  } else {
    if (msg.iteration < draft.iteration) {
      throw new Error('SenderKey: iteration already consumed and not in the skipped-key cache (replay?)');
    }
    skipReceivingKeys(draft, msg.iteration);
    const derived = kdfChainKey(draft.chainKey);
    messageKey = derived.messageKey;
    draft.chainKey = derived.chainKey;
    draft.iteration = msg.iteration + 1;
  }

  const { key, nonce: expectedNonce } = deriveNonceAndKey(messageKey);
  if (bytesToBase64(expectedNonce) !== bytesToBase64(nonce)) {
    throw new Error('SenderKey: nonce mismatch — message key derivation is out of sync');
  }
  const plaintext = xchacha20poly1305(key, nonce).decrypt(ciphertext);

  state.chainKey = draft.chainKey;
  state.iteration = draft.iteration;
  state.skippedMessageKeys = draft.skippedMessageKeys;
  return plaintext;
}

// ── Serialization (secure-storage persistence between app launches) ────────

export interface SerializedSenderKeyState {
  chainId: string;
  chainKey: string;
  iteration: number;
  signingKeyPair: { publicKey: string; secretKey: string };
}

export function serializeSenderKeyState(state: SenderKeyState): SerializedSenderKeyState {
  return {
    chainId: state.chainId,
    chainKey: bytesToBase64(state.chainKey),
    iteration: state.iteration,
    signingKeyPair: {
      publicKey: bytesToBase64(state.signingKeyPair.publicKey),
      secretKey: bytesToBase64(state.signingKeyPair.secretKey),
    },
  };
}

export function deserializeSenderKeyState(data: SerializedSenderKeyState): SenderKeyState {
  return {
    chainId: data.chainId,
    chainKey: base64ToBytes(data.chainKey),
    iteration: data.iteration,
    signingKeyPair: {
      publicKey: base64ToBytes(data.signingKeyPair.publicKey),
      secretKey: base64ToBytes(data.signingKeyPair.secretKey),
    },
  };
}

export interface SerializedReceivingChainState {
  chainKey: string;
  iteration: number;
  signingPublicKey: string;
  skippedMessageKeys: [number, string][];
}

export function serializeReceivingChainState(state: ReceivingChainState): SerializedReceivingChainState {
  return {
    chainKey: bytesToBase64(state.chainKey),
    iteration: state.iteration,
    signingPublicKey: bytesToBase64(state.signingPublicKey),
    skippedMessageKeys: Array.from(state.skippedMessageKeys.entries()).map(([k, v]) => [k, bytesToBase64(v)]),
  };
}

export function deserializeReceivingChainState(data: SerializedReceivingChainState): ReceivingChainState {
  return {
    chainKey: base64ToBytes(data.chainKey),
    iteration: data.iteration,
    signingPublicKey: base64ToBytes(data.signingPublicKey),
    skippedMessageKeys: new Map(data.skippedMessageKeys.map(([k, v]) => [k, base64ToBytes(v)])),
  };
}
