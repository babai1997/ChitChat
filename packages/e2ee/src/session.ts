import { x25519 } from '@noble/curves/ed25519';
import type { IdentityKeys, PublicIdentityBundle } from './identity';
import { initiateSession, receiveSession, type InitialMessageHeader } from './x3dh';
import {
  initSessionAsSender,
  initSessionAsReceiver,
  ratchetEncrypt,
  ratchetDecrypt,
  serializeRatchetState,
  deserializeRatchetState,
  type RatchetSessionState,
  type SerializedRatchetState,
  type EncryptedMessage,
} from './doubleRatchet';
import { bytesToBase64, base64ToBytes } from './base64';

// Session ties X3DH (one-time handshake) to the Double Ratchet (per-message
// keys) into the single object a caller actually wants: something you hand a
// plaintext string to and get wire-ready ciphertext back, or vice versa. This
// is the main entry point `frontend`/`mobile` should use — they should never
// need to touch x3dh.ts or doubleRatchet.ts directly.

export interface OutboundEnvelope {
  isPrekeyMessage: true;
  x3dhHeader: InitialMessageHeader;
  message: EncryptedMessage;
}

export interface OngoingEnvelope {
  isPrekeyMessage: false;
  message: EncryptedMessage;
}

export type Envelope = OutboundEnvelope | OngoingEnvelope;

export class Session {
  private ratchet: RatchetSessionState;
  // Alice must keep attaching the X3DH header to every outbound message until
  // she's heard back from Bob at least once — she has no way to know whether
  // an earlier message (and its header) actually arrived. Once we've
  // decrypted any inbound message, the handshake is confirmed complete and
  // the header can stop being sent.
  private pendingX3dhHeader: InitialMessageHeader | null;

  private constructor(ratchet: RatchetSessionState, pendingX3dhHeader: InitialMessageHeader | null) {
    this.ratchet = ratchet;
    this.pendingX3dhHeader = pendingX3dhHeader;
  }

  /** Alice's side: start a brand-new session toward a peer device, from their published bundle. */
  static createOutbound(myIdentity: IdentityKeys, theirBundle: PublicIdentityBundle): Session {
    const { sharedSecret, header } = initiateSession(myIdentity, theirBundle);
    const theirRatchetPublicKey = base64ToBytes(theirBundle.signedPreKeyPub);
    const ratchet = initSessionAsSender(sharedSecret, theirRatchetPublicKey);
    return new Session(ratchet, header);
  }

  /** Bob's side: derive a session from Alice's X3DH header, found in her first envelope. */
  static createInbound(myIdentity: IdentityKeys, x3dhHeader: InitialMessageHeader): Session {
    const sharedSecret = receiveSession(myIdentity, x3dhHeader);
    const ratchet = initSessionAsReceiver(sharedSecret, myIdentity.signedPreKey.keyPair);
    return new Session(ratchet, null);
  }

  static fromSerialized(data: SerializedSession): Session {
    return new Session(deserializeRatchetState(data.ratchet), data.pendingX3dhHeader);
  }

  toSerialized(): SerializedSession {
    return { ratchet: serializeRatchetState(this.ratchet), pendingX3dhHeader: this.pendingX3dhHeader };
  }

  encrypt(plaintext: Uint8Array, associatedData?: Uint8Array): Envelope {
    const message = ratchetEncrypt(this.ratchet, plaintext, associatedData);
    if (this.pendingX3dhHeader) {
      return { isPrekeyMessage: true, x3dhHeader: this.pendingX3dhHeader, message };
    }
    return { isPrekeyMessage: false, message };
  }

  decrypt(envelope: Envelope, associatedData?: Uint8Array): Uint8Array {
    const plaintext = ratchetDecrypt(this.ratchet, envelope.message, associatedData);
    this.pendingX3dhHeader = null;
    return plaintext;
  }
}

export interface SerializedSession {
  ratchet: SerializedRatchetState;
  pendingX3dhHeader: InitialMessageHeader | null;
}

export function generateRatchetKeyPair() {
  return x25519.keygen();
}

export { bytesToBase64, base64ToBytes };
