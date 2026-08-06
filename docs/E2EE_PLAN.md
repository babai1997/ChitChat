# End-to-End Encryption Retrofit — ChitChat

## Context

ChitChat currently stores and transmits every message as plaintext: `Message.content` is a plain Postgres text column, read directly by the REST/WS send paths, the push-notification service, and both clients. This was a deliberate simplification while building out the core chat/call/notification features. Now that the app's behavior matches a real chat product closely enough to invite the comparison, the natural next question is whether it can also match the *security model* of Signal/WhatsApp — where the server relays ciphertext it cannot read, rather than being a trusted party with full access to conversation content.

This plan retrofits E2EE onto the working app **incrementally**, so the app stays shippable after every phase rather than requiring one large rewrite. It reuses the app's existing per-recipient fan-out pattern (`message.handler.ts`'s `allMemberIds.forEach(...)` loop) — which turns out to be exactly the shape E2EE needs, since per-recipient ciphertext requires per-recipient targeting that already exists structurally.

**Decisions locked in for this plan** (confirmed by you):
- Crypto approach: **`@noble/curves` + `@noble/ciphers` + `@noble/hashes`** (pure TS, no native/WASM deps) — we implement X3DH + Double Ratchet + Sender Keys ourselves against Signal's public specs, on top of these audited primitives. This keeps mobile inside **Expo Go** (no custom dev client / ejecting needed), at the cost of owning protocol-composition correctness ourselves rather than using a complete pre-built implementation.
- Scope: all 4 phases detailed below, phased for incremental shipping — Phase 0 and 1 are the concrete near-term work; Phases 2-4 are real designs, not hand-waves, but naturally executed later.

---

## Cryptographic model (applies from Phase 1 onward)

**Protocol**: X3DH (asynchronous session setup, so you can message someone who's offline) + Double Ratchet (per-session forward secrecy) for 1:1 — the same primitive pair Signal uses. Phase 2 adds **Sender Keys** for group fan-out (one shared chain per sender per group, instead of pairwise sessions for every member).

**New identity layer — device, not just user.** JWT today identifies only `userId`. E2EE needs a **device identity**: each logged-in client instance (a phone, a browser profile) has its own long-term identity keypair (private key never leaves the device), a rotating signed prekey, and a pool of one-time prekeys. `PushToken.deviceId` is a loose precedent (a device already has *an* id, for push purposes) but isn't reusable as-is — it's scoped to push registration and has no crypto attached.

**What the server can always see**: userId↔deviceId mapping, public keys, prekey counts, ciphertext blobs, and all existing metadata (chatId, senderId, timestamp, type, delivery status). **What it can never see**: any private key, plaintext message content, plaintext attachment bytes.

---

## Phase 0 — Foundations (ships dark, zero user-visible change)

Goal: device identity + key-exchange plumbing works and is tested, while every message still flows exactly as today. Safe to stop here indefinitely.

**New Prisma models** (`backend/prisma/schema.prisma`, purely additive):
```prisma
model Device {
  id               String   @id @default(uuid())
  userId           String   @map("user_id")
  deviceId         String   @map("device_id")       // client-generated, persisted in secure storage
  identityKey      String   @map("identity_key")      // base64 public key
  registrationId   Int      @map("registration_id")
  signedPreKeyId   Int      @map("signed_prekey_id")
  signedPreKeyPub  String   @map("signed_prekey_pub")
  signedPreKeySig  String   @map("signed_prekey_sig")
  revoked          Boolean  @default(false)
  createdAt        DateTime @default(now()) @map("created_at")
  lastActiveAt     DateTime @default(now()) @map("last_active_at")

  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  oneTimePreKeys OneTimePreKey[]

  @@unique([userId, deviceId])
  @@map("devices")
}

model OneTimePreKey {
  id        String  @id @default(uuid())
  deviceId  String  @map("device_id")   // FK to Device.id
  keyId     Int     @map("key_id")
  publicKey String  @map("public_key")
  used      Boolean @default(false)

  device Device @relation(fields: [deviceId], references: [id], onDelete: Cascade)

  @@unique([deviceId, keyId])
  @@map("one_time_prekeys")
}
```
Also add to `Message`: `isEncrypted Boolean @default(false)`, `encVersion Int?` — defaulted so every existing row is unaffected.

**New backend module — `backend/src/modules/keys/`**:
- `POST /devices/register` — upload `{deviceId, identityKey, registrationId, signedPreKey, signedPreKeySig, oneTimePreKeys[]}` on first login per device.
- `GET /devices/:userId/bundle` — X3DH bundle fetch: for every active device of that user, return identity key + signed prekey + one consumed one-time prekey. Called by a sender starting a session with someone new.
- `POST /devices/prekeys/replenish` — top up one-time prekey pool.
- `GET /devices/mine`, `DELETE /devices/:deviceId` — device list + revoke (also the seed for a future "linked devices" UI).

**New shared package — `packages/e2ee/`** (one implementation, used by both `frontend` and `mobile`, tested once):
- `identity.ts`, `x3dh.ts`, `doubleRatchet.ts` (Sender Keys added in Phase 2), built on `@noble/curves`/`@noble/ciphers`/`@noble/hashes`.
- Session state cache (IndexedDB on web, secure storage/SQLite on mobile) — private keys never leave the device.

**Frontend/mobile**: on first login per device, generate keys locally, persist private material in platform secure storage (never `localStorage`/`AsyncStorage` plaintext), call `POST /devices/register`. No UI change.

**Exit criteria**: unit tests for `packages/e2ee` against known Signal test vectors; an integration test where two devices X3DH-handshake and exchange a string using only the new endpoints, with zero involvement from `messages.service.ts`.

**Critical files**: `backend/prisma/schema.prisma`, `backend/src/modules/keys/*` (new), `packages/e2ee/*` (new), `frontend/package.json`, `mobile/package.json`.

---

## Phase 1 — 1:1 chat E2EE (groups deferred on purpose)

Goal: `type: 'direct'` chats are fully E2EE for new messages. Groups and attachments stay plaintext this phase — this is the minimal topology (no membership changes, no re-keying, no sender-key distribution) to validate the whole pipeline once before adding group complexity.

**Prerequisite, done first in isolation**: socket auth must carry `deviceId`, not just `userId` — this ripples into `SocketRegistryService` (today keyed `userId → Set<socketId>`; becomes `userId → Map<deviceId, socketId>`, gaining an `emitToDevice(userId, deviceId, event, payload)` alongside today's `emitToUser`) and every place that currently assumes `socket.user.id` alone is sufficient identity. Land and test this on its own before touching ciphertext plumbing — it's the riskiest "one more required field everywhere" change in the whole plan.

**New table** — per-device ciphertext, since one logical message now produces one ciphertext *per target device* (recipient's devices + sender's own other devices, for multi-device sync):
```prisma
model MessageCipher {
  id                String   @id @default(uuid())
  messageId         String   @map("message_id")
  recipientDeviceId String   @map("recipient_device_id")  // FK to Device.id
  ciphertext        String
  createdAt         DateTime @default(now()) @map("created_at")

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  device  Device  @relation(fields: [recipientDeviceId], references: [id], onDelete: Cascade)

  @@unique([messageId, recipientDeviceId])
  @@map("message_ciphers")
}
```

**Backend changes**:
- `messages.service.ts` `create()`: `CreateMessageData` gains `ciphers?: {deviceId, ciphertext}[]`, `isEncrypted?: boolean`. When encrypted: store `content: null`, `isEncrypted: true`, bulk-insert `MessageCipher` rows in the same `$transaction`. The `replyToId` cross-chat check is unaffected (never read `content`).
- `messages.mapper.ts` `MessagesMapper.toDto` becomes **recipient-device-aware**: `toDto(message, requesterDeviceId)` looks up the one matching `MessageCipher` row and returns `{content: null, cipher, isEncrypted: true}` for encrypted rows. Every caller (`getMessages`, `create`, `editMessage`, `deleteMessage`) now needs to know which device is asking — this is the concrete payoff of the socket-auth prerequisite above.
- **Reply-quote regression to fix deliberately**: the `replyTo.content` flattening added this session becomes conditionally dead — for an encrypted `replyTo` target, return `{id, isDeleted, senderName}` with no content at all. The client resolves the quoted text from its own local decrypted-message cache by id (which it already has, since every received message gets decrypted on receipt before render).
- `message.handler.ts` `handleSend()`: `SendMessageDto` gains `ciphers`. The `allMemberIds.forEach` loop now, per member, looks up that member's active devices and calls `emitToDevice` with only the ciphertext addressed to that specific device. `getContentPreview()` (used for push text) becomes dead for encrypted messages — see push section below.
- `push.service.ts` `sendMessagePush`: drops `content`/preview text for encrypted chats — payload becomes `{kind:'message', messageId, chatId, senderId, senderName, isEncrypted:true}`. `chatName` stays (it's not secret, already visible to all members).

**Frontend/mobile wiring** (the key design point: **encryption is fully absorbed at the socket-handler boundary — `MessageBubble.tsx` needs zero changes**):
- `SocketProvider.tsx` (`sendMessage`, both platforms): before emitting, resolve target devices (recipient's + sender's own other devices), lazily X3DH-handshake any missing sessions, ratchet-encrypt per device, emit `ciphers` instead of `content`. Becomes async; the existing tempId optimistic-UI flow is unaffected since it's keyed by `tempId`, not content.
- `message.handlers.ts` (`handleNewMessage`, both platforms): before `store.addMessage(...)`, decrypt the requester-device-specific `cipher` field into plaintext, and store **plaintext** in the in-memory message object — so everything downstream (`MessageBubble.tsx`, reply quoting, chat list previews) keeps reading `message.content` exactly as it does today.
- **Mobile push-notification fix** (`messagePushNotification.ts`): with no plaintext in the FCM payload, its `MessagingStyle` stacking can't show real text anymore. Ship with a **generic grouped notification** this phase — "New message from {senderName}" / "3 new messages" — no body preview. (A nicer fast-follow — background on-device decrypt-then-notify — is possible but is real background-execution engineering, explicitly not required for Phase 1.)

**Critical files**: `backend/src/modules/messages/messages.service.ts`, `messages.mapper.ts`, `backend/src/modules/gateway/handlers/message.handler.ts`, `backend/src/modules/gateway/services/socket-registry.service.ts`, `backend/src/modules/push/push.service.ts`, `frontend/src/contexts/SocketProvider.tsx` + mobile equivalent, `frontend/src/shared/socket/handlers/message.handlers.ts` + mobile equivalent, `mobile/src/services/messagePushNotification.ts`, `packages/e2ee/*`.

---

## Phase 2 — Group chat E2EE (Sender Keys)

Goal: extend to `type: 'group'` using Sender Keys — one shared chain per (chat, sender-device) distributed to current members once, instead of Phase 1's pairwise-per-device fan-out (which would be O(N²) and doesn't handle membership changes cleanly).

**Protocol**: each device generates a Sender Key per group it's in, distributes it to every other current member's every device as a `SenderKeyDistributionMessage` — itself sent as an ordinary Phase-1 pairwise-encrypted message, so distribution reuses Phase 1's transport rather than needing new infrastructure. Subsequent group messages are encrypted **once** and fanned out as identical ciphertext to everyone — a real efficiency win over repeating Phase 1's per-device branching for every member.

**Re-keying is the correctness-critical part**: a Sender Key must rotate whenever membership shrinks, or a removed member who cached the old key can still decrypt future messages.
- `chats.service.ts` `removeMember()` / `leaveGroup()`: after removal, emit an event remaining members' clients respond to by generating and redistributing a *fresh* Sender Key to the remaining members only.
- `chats.service.ts` `addMember()`: new members get **no access to history by default** (matches Signal/WhatsApp's default) — the inviter's client distributes the *current* sender key going forward, not a retroactive one. There's a brief window between server-side add and the new member's client receiving the distribution message; the new member's first decryptable message is the one sent after distribution completes, not immediately at add-time.
- `chats.service.ts` `createGroup()`: sender key generation/distribution is lazy — triggered by the *first message send*, not group creation, so an empty group costs nothing.

**Backend/storage simplification vs Phase 1**: since Sender Key ciphertext is identical for every member, group message ciphertext goes back onto `Message.content` directly (not `MessageCipher`, which stays reserved for 1:1 and for the sender-key-distribution messages themselves) — cheaper and simpler than per-device rows. Read path branches on `chat.type`: `direct` → `MessageCipher`, `group` → `Message.content`. `message.handler.ts`'s group fan-out loop simplifies back toward its original shape (same ciphertext to every target), still using `emitToDevice` for per-device delivery targeting.

**Critical files**: `backend/src/modules/chats/chats.service.ts` (`addMember`, `removeMember`, `leaveGroup`, `createGroup`), `backend/src/modules/messages/messages.service.ts` (branch by `chat.type`), `packages/e2ee/senderKeys.ts` (new), `frontend/src/components/chat/ChatView.tsx` (send-path branch only — no rendering change).

---

## Phase 3 — Attachments

Goal: photos/files/audio encrypted client-side before Cloudinary upload; Cloudinary only ever stores opaque blobs it can't interpret.

**Scheme**: per attachment, generate a random AES-256-GCM content key + nonce client-side, encrypt the file bytes, upload ciphertext via the existing `CloudinaryService.uploadFile` unchanged (`resource_type: 'auto'`, confirmed no server-side transforms/thumbnails are relied on anywhere today, so opaque blobs are safe). The content key travels **inside** the already-encrypted message envelope, never in the clear — message "content" becomes `{type:'image', attachmentUrl, attachmentKey, attachmentNonce, mimeType, size}` instead of a caption string, and that whole object is what gets ratchet/sender-key encrypted.

**Residual leak to flag, not hide**: `Attachment.fileName`/`fileType`/`fileSize` are currently plain columns — a filename alone can leak content (`passport_scan.jpg`). Recommend moving real filename/mimetype inside the encrypted envelope and storing only opaque placeholders server-side, or explicitly accepting this as a documented residual metadata leak for this phase.

**Critical files**: `backend/src/modules/cloudinary/cloudinary.service.ts` (verify-only, no change expected), `backend/prisma/schema.prisma` (Attachment metadata decision), `frontend/src/components/chat/ChatView.tsx` (attachment send path), `packages/e2ee/attachments.ts` (new).

---

## Phase 4 — Multi-device recovery / backup

Goal: losing a device or adding a new one shouldn't be a dead end, without ever giving the server a plaintext backup.

**Approach**: client-side-encrypted backup blob (session state, optionally message history) encrypted with a key derived from a user passphrase/PIN via a memory-hard KDF (Argon2id), uploaded as an opaque blob the server stores but can't read. Recovery requires re-supplying the passphrase on the new device. Phase 0's `Device` table already gives the "list/revoke devices" UI this pairs with.

**Explicitly lowest priority**: a working E2EE app that says "new device = fresh start, no old history" (Signal's own historical default) is a completely acceptable, shippable state on its own. Backup is a UX nicety layered on top, not a correctness requirement of E2EE itself — don't let it block shipping Phases 1-3.

**Critical files**: `backend/prisma/schema.prisma` (new `Backup` table), `backend/src/modules/backup/*` (new), `packages/e2ee/backup.ts` (new).

---

## Migrating existing plaintext history

There's no way to retroactively encrypt old messages against keys that didn't exist when they were sent — manufacturing ciphertext for them now would defeat forward secrecy's entire premise, and no real E2EE retrofit (Signal, WhatsApp, Telegram Secret Chats) has ever done this.

**Recommended approach — cutover, no rewrite**: historical rows stay exactly as-is (`isEncrypted: false`, `content` populated); only messages created after the Phase 1 cutover are encrypted. Mixed history in one thread renders correctly for free: the decrypt seam in `message.handlers.ts` checks `isEncrypted` per message and uses `content` directly for old rows — no UI change needed. Migration mechanics are trivial: the new columns/tables are all additive with safe defaults, zero backfill, zero downtime, and reversible by not writing to the new columns (an app-code rollback, not a schema rollback).

**Explicitly not recommended**: retroactively re-encrypting-then-deleting old plaintext (a real option if there's a specific compliance driver) is slow, requires every user to come back online before a deletion deadline, and risks real data loss. If ever required, scope it as its own separate, explicitly-approved phase — don't fold it into this plan.

---

## Cross-cutting notes

- `markAsRead`/delivery status logic is untouched by any of this — status transitions operate on message rows by id, never on `content`.
- `deleteMessage`'s "delete for everyone" path already sets `content: null` — trivially compatible; just also clean up `MessageCipher` rows for that message.
- `editMessage` on an encrypted message needs the same per-device `ciphers` map as a fresh send, and the `message.edited` event needs the same per-requester-device cipher resolution as `getMessages`.
- System messages (missed-call logs) stay permanently unencrypted — they're server-synthesized text, not user content, and encrypting them would require the server to hold ratchet sessions, defeating the model.

---

## Verification per phase

- **Phase 0**: unit tests for `packages/e2ee` against published Signal protocol test vectors; integration test proving two devices can X3DH + Double-Ratchet exchange a string via the new endpoints alone, no involvement from the messages pipeline.
- **Phase 1**: end-to-end test sending a 1:1 message between two real logged-in sessions (web↔mobile and mobile↔mobile), confirming: server-side `Message.content` is null and `MessageCipher` rows are opaque (spot-check via direct DB query that it's not readable plaintext), both the recipient's and sender's *other* device correctly decrypt and render, reply-quote resolves from local cache correctly, and the push notification shows the generic (no-preview) text.
- **Phase 2**: create a group, send a message, remove a member, confirm the removed member's cached key can no longer decrypt a message sent after removal (this is the one test that actually matters for Phase 2's correctness).
- **Phase 3**: confirm an uploaded attachment is unreadable directly from its Cloudinary URL without the wrapped key, and that the receiving client still renders it correctly once decrypted.
- **Phase 4**: wipe a device's local storage, restore from backup with the correct passphrase, confirm history/identity restore; confirm a wrong passphrase fails cleanly with no partial leak.
