import { describe, it, expect, beforeAll } from 'vitest';
import { generateIdentity, toPublicBundle } from '../identity';
import { Session, type Envelope } from '../session';
import type { InitialMessageHeader } from '../x3dh';
import {
  generateSenderKeyState,
  createDistributionMessage,
  senderKeyEncrypt,
  initReceivingChain,
  senderKeyDecrypt,
  serializeSenderKeyState,
  deserializeSenderKeyState,
  serializeReceivingChainState,
  deserializeReceivingChainState,
  type SenderKeyState,
  type ReceivingChainState,
} from '../senderKeys';
import { encryptAttachmentBytes, decryptAttachmentBytes } from '../attachments';
import { generateBackupSalt, deriveBackupKey, encryptBackup, decryptBackup } from '../backup';

// Not literal Signal-protocol test vectors (this is a from-scratch X3DH +
// Double Ratchet + Sender Keys implementation on @noble primitives, not a
// byte-exact reimplementation of libsignal's wire format, so upstream vectors
// don't apply directly) — instead, this exercises every correctness and
// security property the protocol is supposed to guarantee: round trips,
// out-of-order delivery, tampering/forgery rejection, rekey lockout, and
// serialization. Promoted from the old ad-hoc `__selftest.ts` script (run
// manually via `npx tsx`) into a real suite that runs on every change.

const enc = new TextEncoder();
const dec = new TextDecoder();

describe('X3DH + Double Ratchet session (1:1)', () => {
  let aliceSession: Session;
  let bobSession: Session;

  beforeAll(() => {
    const alice = generateIdentity(5);
    const bob = generateIdentity(5);
    const bobBundlePublic = toPublicBundle(bob);

    aliceSession = Session.createOutbound(alice, bobBundlePublic);
    const envelope1 = aliceSession.encrypt(enc.encode('hello bob'));
    expect(envelope1.isPrekeyMessage).toBe(true);

    const header1 = (envelope1 as { x3dhHeader: InitialMessageHeader }).x3dhHeader;
    bobSession = Session.createInbound(bob, header1);
    expect(dec.decode(bobSession.decrypt(envelope1))).toBe('hello bob');
  });

  it("bob's reply carries no X3DH header once he's heard from alice", () => {
    const envelope2 = bobSession.encrypt(enc.encode('hi alice'));
    expect(envelope2.isPrekeyMessage).toBe(false);
    expect(dec.decode(aliceSession.decrypt(envelope2))).toBe('hi alice');
  });

  it('alice stops attaching an X3DH header after hearing back', () => {
    expect(aliceSession.encrypt(enc.encode('x')).isPrekeyMessage).toBe(false);
  });

  it('chain keys keep advancing correctly across several round trips', () => {
    for (let i = 0; i < 5; i++) {
      const e = aliceSession.encrypt(enc.encode(`msg-a-${i}`));
      expect(dec.decode(bobSession.decrypt(e))).toBe(`msg-a-${i}`);
    }
    for (let i = 0; i < 5; i++) {
      const e = bobSession.encrypt(enc.encode(`msg-b-${i}`));
      expect(dec.decode(aliceSession.decrypt(e))).toBe(`msg-b-${i}`);
    }
  });

  it('decrypts out-of-order messages within a chain via the skipped-key cache', () => {
    const eA = aliceSession.encrypt(enc.encode('first'));
    const eB = aliceSession.encrypt(enc.encode('second'));
    const eC = aliceSession.encrypt(enc.encode('third'));
    expect(dec.decode(bobSession.decrypt(eC))).toBe('third');
    expect(dec.decode(bobSession.decrypt(eA))).toBe('first');
    expect(dec.decode(bobSession.decrypt(eB))).toBe('second');
  });

  it('rejects tampered ciphertext instead of returning corrupted plaintext', () => {
    const eTamper = aliceSession.encrypt(enc.encode('do not tamper'));
    const tampered: Envelope = JSON.parse(JSON.stringify(eTamper));
    tampered.message.ciphertext = tampered.message.ciphertext.slice(0, -2) + 'AA';
    expect(() => bobSession.decrypt(tampered)).toThrow();
  });

  it('rejects a replayed message without corrupting the ratchet for subsequent legitimate messages', () => {
    const eReplay = aliceSession.encrypt(enc.encode('replay me'));
    dec.decode(bobSession.decrypt(eReplay)); // first, legitimate decrypt
    expect(() => bobSession.decrypt(eReplay)).toThrow(); // same envelope again

    const eAfterReplay = aliceSession.encrypt(enc.encode('still works after replay attempt'));
    expect(dec.decode(bobSession.decrypt(eAfterReplay))).toBe('still works after replay attempt');
  });

  it('survives a serialize/deserialize round trip', () => {
    const serialized = aliceSession.toSerialized();
    const restored = Session.fromSerialized(JSON.parse(JSON.stringify(serialized)));
    const eAfterRestore = restored.encrypt(enc.encode('after restore'));
    expect(dec.decode(bobSession.decrypt(eAfterRestore))).toBe('after restore');
  });
});

describe('Sender Keys (group encryption)', () => {
  let owner: SenderKeyState;
  let recipient1: ReceivingChainState;
  let recipient2: ReceivingChainState;
  let firstMessageChainId: string;

  beforeAll(() => {
    owner = generateSenderKeyState();
    const dm = createDistributionMessage(owner);
    recipient1 = initReceivingChain(dm);
    recipient2 = initReceivingChain(dm);
  });

  it('one encryption is decryptable by every recipient (broadcast, not pairwise)', () => {
    const gMsg0 = senderKeyEncrypt(owner, enc.encode('hello group'));
    firstMessageChainId = gMsg0.chainId;
    expect(dec.decode(senderKeyDecrypt(recipient1, gMsg0))).toBe('hello group');
    expect(dec.decode(senderKeyDecrypt(recipient2, gMsg0))).toBe('hello group');
  });

  it('the chain keeps advancing correctly across several messages', () => {
    for (let i = 0; i < 5; i++) {
      const m = senderKeyEncrypt(owner, enc.encode(`group-msg-${i}`));
      expect(dec.decode(senderKeyDecrypt(recipient1, m))).toBe(`group-msg-${i}`);
    }
  });

  it('decrypts out-of-order messages within a chain via the skipped-key cache', () => {
    const gA = senderKeyEncrypt(owner, enc.encode('g-first'));
    const gB = senderKeyEncrypt(owner, enc.encode('g-second'));
    const gC = senderKeyEncrypt(owner, enc.encode('g-third'));
    expect(dec.decode(senderKeyDecrypt(recipient1, gC))).toBe('g-third');
    expect(dec.decode(senderKeyDecrypt(recipient1, gA))).toBe('g-first');
    expect(dec.decode(senderKeyDecrypt(recipient1, gB))).toBe('g-second');
  });

  it('rejects a message signed by a different key, even placed on the real chain (authorship != AEAD success)', () => {
    // Every group member holds the same chain key, so AEAD success alone
    // can't prove authorship — only the signature, verified against the
    // DISTRIBUTED signing public key, can. This is the property Double
    // Ratchet doesn't need (each session has exactly one possible sender).
    const impostor = generateSenderKeyState();
    const forged = senderKeyEncrypt(impostor, enc.encode('not really from the owner'));
    const forgedOnRealChain = { ...forged, chainId: firstMessageChainId, iteration: recipient1.iteration };
    expect(() => senderKeyDecrypt(recipient1, forgedOnRealChain)).toThrow();

    // And recipient1's chain must be untouched by the rejected forgery.
    const gAfterForgery = senderKeyEncrypt(owner, enc.encode('still fine after a forgery attempt'));
    expect(dec.decode(senderKeyDecrypt(recipient1, gAfterForgery))).toBe('still fine after a forgery attempt');
  });

  it('rekey: a removed member on the old chain cannot decrypt messages on a fresh chain', () => {
    const rekeyedOwner = generateSenderKeyState();
    expect(rekeyedOwner.chainId).not.toBe(owner.chainId);

    const rekeyedDm = createDistributionMessage(rekeyedOwner);
    const recipientWithNewKey = initReceivingChain(rekeyedDm);
    const gNew = senderKeyEncrypt(rekeyedOwner, enc.encode('post-rekey message'));

    expect(dec.decode(senderKeyDecrypt(recipientWithNewKey, gNew))).toBe('post-rekey message');
    // recipient1 never received the new distribution — still locked on the old chain.
    expect(() => senderKeyDecrypt(recipient1, gNew)).toThrow();
  });

  it('sending and receiving state both survive a serialize/deserialize round trip', () => {
    const ownerSerialized = serializeSenderKeyState(owner);
    const ownerRestored = deserializeSenderKeyState(JSON.parse(JSON.stringify(ownerSerialized)));
    const recipientSerialized = serializeReceivingChainState(recipient1);
    const recipientRestored = deserializeReceivingChainState(JSON.parse(JSON.stringify(recipientSerialized)));

    const gAfterRestore = senderKeyEncrypt(ownerRestored, enc.encode('after sender-key restore'));
    expect(dec.decode(senderKeyDecrypt(recipientRestored, gAfterRestore))).toBe('after sender-key restore');
  });
});

describe('Attachment encryption', () => {
  it('round-trips arbitrary binary payloads exactly, including invalid-UTF-8 bytes', () => {
    const fileBytes = new Uint8Array(4096);
    crypto.getRandomValues(fileBytes);
    const encrypted = encryptAttachmentBytes(fileBytes);
    const decrypted = decryptAttachmentBytes(encrypted.ciphertext, encrypted.key, encrypted.nonce);
    expect(decrypted).toEqual(fileBytes);
  });

  it('throws on the wrong key instead of returning corrupted data', () => {
    const fileBytes = new Uint8Array(256);
    crypto.getRandomValues(fileBytes);
    const encrypted = encryptAttachmentBytes(fileBytes);
    const other = encryptAttachmentBytes(fileBytes);
    expect(() => decryptAttachmentBytes(encrypted.ciphertext, other.key, encrypted.nonce)).toThrow();
  });

  it('never reuses a key across encryptions of the same bytes', () => {
    const fileBytes = new Uint8Array(64).fill(7);
    const a = encryptAttachmentBytes(fileBytes);
    const b = encryptAttachmentBytes(fileBytes);
    expect(a.key).not.toEqual(b.key);
  });
});

// scrypt is deliberately slow (~0.5-1.5s per call, see backup.ts) — kept to
// the minimum number of derivations needed to prove correctness.
describe('Passphrase-encrypted backup (Phase 4b)', () => {
  it('round-trips plaintext through the correct passphrase', async () => {
    const plaintext = enc.encode(JSON.stringify({ hello: 'backup' }));
    const backup = await encryptBackup('correct-horse-battery-staple', plaintext);
    const restored = await decryptBackup('correct-horse-battery-staple', backup);
    expect(dec.decode(restored)).toBe(dec.decode(plaintext));
  }, 15_000);

  it('fails cleanly on a wrong passphrase instead of returning garbage', async () => {
    const plaintext = enc.encode('sensitive history');
    const backup = await encryptBackup('right-passphrase', plaintext);
    await expect(decryptBackup('wrong-passphrase', backup)).rejects.toThrow();
  }, 15_000);

  it('derives different keys from the same passphrase with different salts', async () => {
    const saltA = generateBackupSalt();
    const saltB = generateBackupSalt();
    const keyA = await deriveBackupKey('same-passphrase', saltA);
    const keyB = await deriveBackupKey('same-passphrase', saltB);
    expect(keyA).not.toEqual(keyB);
  }, 15_000);
});
