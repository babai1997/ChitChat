export {
  generateIdentity,
  generateSignedPreKey,
  generateOneTimePreKeys,
  toPublicBundle,
  verifySignedPreKey,
  serializeIdentity,
  deserializeIdentity,
} from './identity';
export type {
  KeyPair,
  SignedPreKey,
  OneTimePreKey,
  IdentityKeys,
  PublicIdentityBundle,
  SerializedIdentity,
} from './identity';

export type { InitialMessageHeader, OutboundX3dhResult } from './x3dh';

export type {
  MessageHeader,
  EncryptedMessage,
  RatchetSessionState,
  SerializedRatchetState,
} from './doubleRatchet';

export { Session } from './session';
export type { Envelope, OutboundEnvelope, OngoingEnvelope, SerializedSession } from './session';

export {
  generateSenderKeyState,
  createDistributionMessage,
  senderKeyEncrypt,
  initReceivingChain,
  senderKeyDecrypt,
  serializeSenderKeyState,
  deserializeSenderKeyState,
  serializeReceivingChainState,
  deserializeReceivingChainState,
} from './senderKeys';
export type {
  SigningKeyPair,
  SenderKeyState,
  SenderKeyDistributionMessage,
  SenderKeyMessage,
  ReceivingChainState,
  SerializedSenderKeyState,
  SerializedReceivingChainState,
} from './senderKeys';

export { encryptAttachmentBytes, decryptAttachmentBytes } from './attachments';
export type { EncryptedAttachment } from './attachments';

export { generateBackupSalt, deriveBackupKey, encryptBackup, decryptBackup } from './backup';
export type { EncryptedBackup } from './backup';

export { bytesToBase64, base64ToBytes } from './base64';

// Re-exported so clients never need to reach for TextEncoder/TextDecoder
// (inconsistently available across web and Hermes/React Native) just to turn
// message strings into bytes for Session.encrypt/decrypt.
export { utf8ToBytes, bytesToUtf8 } from '@noble/hashes/utils';
