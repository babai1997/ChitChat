# Incoming-Call Notifications Plan (WhatsApp-style)

Goal: a user gets called while the app is backgrounded **or fully killed** and sees a
ringing, full-screen incoming-call UI anyway — same as WhatsApp/Messenger/Telegram —
instead of needing to already have the app open.

---

## Implementation Status

**Phase 1 (backend) and Phase 2 (Android) are code-complete.** iOS (CallKit/PushKit,
Phase 3) has not been started — this pass was scoped to Android + backend per plan.

Done:
- `PushToken` Prisma model + migration applied.
- `backend/src/modules/push/` — `PushService` (Firebase Admin / FCM), `/push/register`
  + `/push/unregister` endpoints.
- `call.handler.ts` — `callId` threaded through `CALL_INCOMING`/push payloads, call
  push sent on start/add-member, cancel push sent on join/reject/end, server-side 45s
  ring timeout (shares logic with the existing client-driven `CALL_MISSED` path via a
  new `finalizeMissedCall` method).
- Mobile: `@react-native-firebase/messaging` + `@notifee/react-native` installed and
  config-plugin-wired into `app.json`; new Android permissions
  (`POST_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT`, `WAKE_LOCK`, `VIBRATE`,
  `FOREGROUND_SERVICE_PHONE_CALL`); custom `index.js` entry registering the FCM
  background handler + notifee background event handler; `src/services/callPush.ts`
  (token register/unregister, wired into `SocketProvider.tsx`'s auth effect and
  `authStore.ts`'s `logout()`); `src/services/incomingCallNotification.ts` (channel
  setup, display/cancel, pending-call storage, Answer/Decline handling); cold-start +
  foreground reconciliation wired into `CallContext.tsx`.

**Blocked on:** a real Firebase project + `google-services.json` — see
*Firebase Project Setup* below. Without it, `PushService` logs a warning and no-ops
(existing socket-based calling is unaffected), and the mobile app **cannot be
prebuilt/run on Android** at all yet — `app.json` now points
`android.googleServicesFile` at `./google-services.json`, which doesn't exist until
you complete the steps below.

**Known scope cuts** (see inline code comments for exact locations):
- Tapping **Decline** on the notification dismisses it locally only — the caller
  isn't told immediately; they'll see "no answer" once the ~45s ring timeout elapses.
  Full parity would need a lightweight HTTP reject endpoint callable from a headless
  background context.
- Android 14+ (API 34) may require an explicit `foregroundServiceType` declaration on
  notifee's service in `AndroidManifest.xml` for the ringing foreground service to be
  allowed to start from the background. This wasn't addressed here (would need a
  custom local Expo config plugin) since it's unverifiable without a real build/device
  — if calls don't ring on a specific device/OS version, this is the first place to look.
- iOS is untouched — audio/video calls still work over the live socket exactly as
  before, they just won't wake a backgrounded/killed iOS app (Phase 3 in this doc).

---

## Firebase Project Setup (you'll need to do this — I can't create it for you)

1. Go to the [Firebase Console](https://console.firebase.google.com/), create a new
   project (or reuse one if this app already has a Google Cloud project — check
   whatever backs `@react-native-google-signin/google-signin`'s OAuth client first).
2. Inside the project: **Project settings → General → Your apps → Add app → Android**.
   - Android package name: `com.sudipta.chitchatapp` (must match `app.json`'s
     `android.package` exactly).
   - Download the generated **`google-services.json`**, place it at
     `mobile/google-services.json` (already gitignored — this is per-environment, not
     committed).
3. **Project settings → Service accounts → Generate new private key** — downloads a
   JSON file. This is the backend's credential, *not* the same file as step 2.
   - Paste its full contents as a single-line string into the backend's `.env` as
     `FIREBASE_SERVICE_ACCOUNT_JSON=...` (see `.env.example` for the exact variable
     name/placement).
4. Rebuild the native Android project so the new config plugins + `google-services.json`
   take effect: `cd mobile && npx expo prebuild --clean -p android`, then
   `npm run android` (needs a device or emulator — VoIP/FCM data pushes don't reliably
   test in some emulator images without Google Play services, prefer a real device or
   a Play-Store-enabled emulator image).
5. Restart the backend so it picks up `FIREBASE_SERVICE_ACCOUNT_JSON` — you should see
   `Firebase Admin initialized for call push notifications` in the logs instead of the
   "not set" warning.
6. **End-to-end test**: log in on a real device, background or force-kill the app,
   have another account call you — you should see a full-screen incoming-call
   notification with Answer/Decline actions and a looping ringtone.

---

## Current State (confirmed by codebase audit)

- **Incoming calls are 100% dependent on a live Socket.io connection.** `CALL_START` →
  backend resolves recipients → `socket-registry.service.ts`'s `emitToUser()` looks up
  the recipient's socket id and emits `CALL_INCOMING`. If there is no registered socket
  (app killed, backgrounded long enough to be suspended, or just disconnected), it
  **silently no-ops** — no queue, no retry, no persistence of the missed call attempt
  beyond whatever the caller's client logs client-side.
- There is **no push notification infrastructure at all** — not for calls, not for
  chat messages. No device-token table in Prisma, no `expo-server-sdk`/`firebase-admin`
  on the backend, no APNs/FCM sending code anywhere.
- `expo-notifications` (`~0.32.17`) is already a dependency in `mobile/package.json`
  but is **completely unused** (zero references in the app code).
- `mobile/src/contexts/SocketProvider.tsx` connects/disconnects purely based on auth
  state — there's no `AppState` handling, so the socket does nothing special on
  backgrounding beyond whatever Socket.io's own reconnect logic does (which requires
  the JS runtime to still be alive).
- The project is **Expo managed workflow using Continuous Native Generation** (CNG):
  `mobile/android/` and `mobile/ios/` exist locally but are gitignored and regenerated
  via `expo prebuild` / `npm run android` / `npm run ios`. This matters because it
  confirms **custom native modules with Expo config plugins are already in play**
  (this is not a plain Expo-Go-only project) — so libraries requiring native code
  (CallKit, PushKit, notifee, Firebase Messaging) are usable, same as how
  `react-native-webrtc` already is.
- ⚠️ `mobile/AGENTS.md` says to consult Expo **v56** docs, but the installed SDK is
  `~54.0.36`. Confirm which is authoritative before relying on version-specific API
  behavior (`expo-notifications` background handling APIs have changed across SDKs).

---

## Why this can't be "just" a bigger `expo-notifications` push

A real incoming-call experience (ringing over the lock screen, Answer/Decline actions,
working when the app is *killed*, not just backgrounded) hits a hard platform split:

| | Android | iOS |
|---|---|---|
| Wake a killed app | High-priority FCM **data** message | **PushKit VoIP push only** — regular APNs pushes cannot reliably wake/relaunch a suspended app to show custom UI |
| Show ringing UI over lock screen | Full-screen-intent notification (needs a dedicated library — `expo-notifications` doesn't expose this) | **CallKit is mandatory** — Apple requires any app using VoIP pushes to report the call to CallKit inside the didReceive callback, or the app gets throttled/rejected |
| Keep ringing while screen off | Android foreground service | Handled by CallKit natively |
| Answer/Decline before opening app | Notification action buttons | CallKit native accept/decline buttons |

**Conclusion:** this needs real native modules, not a bigger notification payload.
iOS in particular has no "simple" path — CallKit + PushKit is the *only* way to match
WhatsApp's behavior there; skipping it means iOS incoming calls degrade to "a regular
notification the user has to tap to open the app," which is a materially worse UX and
is what we're trying to avoid.

---

## Target Architecture

```
Caller                    Backend                        Callee's device(s)
  │                          │                                  │
  ├─ CALL_START ────────────►│                                  │
  │                          ├─ socket connected? ──────────────► CALL_INCOMING (existing path)
  │                          │                                  │  (in-app UI, foreground/still-alive JS)
  │                          │                                  │
  │                          ├─ ALSO, always: ──────────────────►
  │                          │   Android → FCM data push        │ → background handler → notifee
  │                          │             (high priority)      │   full-screen incoming-call notification
  │                          │                                  │   + ringtone + Answer/Decline actions
  │                          │   iOS     → PushKit VoIP push ───►│ → didReceiveIncomingPush (native)
  │                          │             (direct APNs, voip   │   → CallKit reportNewIncomingCall
  │                          │              topic, own cert)    │   → native ringing UI + lock-screen answer
  │                          │                                  │
  ├─ (caller hangs up /      │                                  │
  │   45s ring timeout)      │                                  │
  ├─ CALL_MISSED/CALL_END ──►├─ cancel push ────────────────────►│ cancel notification / CallKit endCall
```

Both delivery paths (socket + push) fire in parallel. The existing in-app socket flow
is untouched — push is a *fallback/wake-up* mechanism layered on top, converged by a
shared `callId` so a device that gets both doesn't show two incoming-call UIs.

---

## Data Model Changes

New Prisma model (`backend/prisma/schema.prisma`):

```prisma
model PushToken {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviceId  String   // stable per-install id generated client-side
  platform  String   // "android" | "ios"
  tokenType String   // "fcm" | "apnsVoip"
  token     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, deviceId, tokenType])
}
```

A user can have multiple devices/tokens (phone + tablet); a call push goes to all of
them, and answering on one cancels the notification on the others (see Phase 4).

---

## Phase 1 — Backend: Device Tokens + Push Sending

**Estimated time: 1–1.5 days**

### New module: `backend/src/modules/push/`
- `push.module.ts`, `push.controller.ts`, `push.service.ts`
- `POST /push/register` — body `{ deviceId, platform, tokenType, token }`, upserts a
  `PushToken` row for the authenticated user.
- `POST /push/unregister` — removes a token (call on logout).

### `PushService` — two independent senders
- **Android (FCM)**: use `firebase-admin` (Admin SDK) with a service-account key,
  `messaging().send({ token, data: {...}, android: { priority: 'high' } })`. Data-only
  payload (no `notification` block) so the client's background handler — not the OS
  default tray notification — decides how to render it.
  - *Alternative considered:* `expo-server-sdk` (simpler, no Firebase project
    management) — but it can't do the direct-APNs VoIP push iOS needs anyway, so once
    we're already running a Firebase project for FCM, using `firebase-admin`
    consistently is less overhead than mixing Expo's push relay + direct APNs.
- **iOS (VoIP)**: `node-apn` (or `@parse/node-apn`) with a dedicated `.p8` auth key,
  sending to the app's `<bundleId>.voip` topic with the `apns-push-type: voip` header.
  This is a **separate APNs credential** from any regular push credential — must be
  provisioned in the Apple Developer portal (Certificates → Keys, "Apple Push
  Notifications service (APNs)" key, VoIP Services capability enabled on the App ID).

### Call handler integration (`backend/src/modules/gateway/handlers/call.handler.ts`)
- In `handleCallStart` (and `handleCallAddMember`), after `emitToUser(... CALL_INCOMING)`,
  also call `pushService.sendCallPush(recipientId, { callId, chatId, callerId,
  callerName, callerAvatar, type })` unconditionally (not just when the socket lookup
  missed — a backgrounded-but-not-killed app benefits from the wake-up too).
- Introduce a `callId` (uuid, generated at `CALL_START`) threaded through
  `CALL_INCOMING`/`CALL_SIGNAL`/`CALL_ENDED`/the push payload, so all delivery paths
  (socket + push, across multiple callee devices) refer to the same logical call.
- **Server-side ring timeout** (doesn't exist today — currently only the caller's
  client times out after 45s and *may* emit `CALL_MISSED` if it's still online): add a
  45s server timer per `callId`; on expiry, if unanswered, emit `CALL_MISSED` to the
  caller and a **cancel push** to all callee devices (see below), so a notification
  doesn't ring forever if the callee's phone was offline when the caller gave up.
- **Cancel push**: send when (a) the call is answered by any device (cancel on the
  others — multi-device), (b) the caller hangs up before anyone answers, (c) the ring
  timeout fires. Android: another data push telling the client to cancel the
  notification/foreground service by `callId`. iOS: another VoIP push (VoIP pushes are
  the only reliable way to tell a backgrounded/killed app anything) carrying an "end"
  flag, handled natively by calling CallKit's `reportCall(endedAt:reason:)`.

---

## Phase 2 — Mobile: Android (FCM + notifee)

**Estimated time: 2–3 days**

### New dependencies
- `@react-native-firebase/app`, `@react-native-firebase/messaging` — background data
  message delivery. (`expo-notifications`'s own background-handling on Android is
  less battle-tested for "must wake a killed app reliably"; RNFirebase's
  `setBackgroundMessageHandler` registered in `index.js` is the standard, proven path
  every call-app on Android uses.)
- `@notifee/react-native` — full-screen-intent notification with custom Accept/Decline
  action buttons, a dedicated high-importance notification channel, and a foreground
  service to keep a ringtone looping while the screen is off. (`expo-notifications`
  doesn't expose full-screen intents.)
- Both ship Expo config plugins — add to `mobile/app.json`'s `plugins` array, then
  `expo prebuild --clean` to regenerate `android/`.

### New Android permissions (`mobile/app.json`)
`POST_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT`, `WAKE_LOCK`, `VIBRATE` (alongside the
existing `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_MEDIA_PROJECTION` from screen share —
add a second foreground-service type, `FOREGROUND_SERVICE_PHONE_CALL` or
`FOREGROUND_SERVICE_MEDIA_PLAYBACK` depending on how notifee categorizes it).

### Flow
1. `index.js`: `messaging().setBackgroundMessageHandler(async (msg) => { ... })` —
   fires even with the app fully killed (Android relaunches the JS engine headlessly
   for this).
2. Handler parses `{ callId, chatId, callerId, callerName, callerAvatar, type }` (or an
   `{ action: 'cancel', callId }` cancel message) and calls into a small
   `notifee`-driving module (not the full app — this runs in a minimal headless
   context): `notifee.displayNotification({ ... android: { asForegroundService: true,
   fullScreenAction: {...}, actions: [Answer, Decline], sound: 'ringtone', ... } })`.
3. Tapping **Answer** or the notification body: deep-links into the app
   (`myapp://call/incoming?callId=...`), which — once the RN app is running — should
   land in the *existing* `CallContext`/`ActiveCallScreen` flow by calling
   `answerCall()` with the reconstructed `incomingCall` data (may need to store the
   pending call payload in `AsyncStorage` so it survives the cold start, then have the
   app's root check "was I opened by an answer/decline tap" on boot).
4. Tapping **Decline**: handled fully in the background handler if possible (emit
   `CALL_REJECT` via a short-lived socket connection opened just for this, or a plain
   HTTP `POST /calls/:callId/reject` — simpler and more reliable from a headless
   context than spinning up Socket.io) without needing to open the app at all.
5. Cancel message received while notification is showing → `notifee.cancelNotification`
   + stop the foreground service/ringtone.

### Reconciling with the existing socket flow
- `CallContext.tsx`'s existing `handleIncoming` (socket-driven) and this new
  push-driven path both need to agree on the same `callId`. On app foreground/cold
  start, check `AsyncStorage`/deep-link params for a pending `callId` first; if the
  socket *also* delivers `CALL_INCOMING` for the same `callId`, treat it as a
  refresh/no-op rather than a second incoming-call screen.

---

## Phase 3 — Mobile: iOS (PushKit + CallKit)

**Estimated time: 3–4 days** (the hardest phase — native-code-heavy, needs a paid Apple
Developer account for the VoIP APNs key and a physical device to test; VoIP push does
not work in the simulator)

### New dependencies
- `react-native-voip-push-notification` — PushKit VoIP token registration + receiving
  the `didReceiveIncomingPushWithPayload` native event.
- `react-native-callkeep` — bridges into `CXProvider`/`CXCallController` (CallKit) so
  answering/declining shows the native full-screen ringing UI, works from the lock
  screen, and integrates with the iOS system call UI (Bluetooth/CarPlay/Watch handoff
  come for free).
- Both need config plugins wired into `mobile/app.json`; `expo prebuild --clean` to
  regenerate `ios/`.

### `app.json` / Info.plist additions
- `UIBackgroundModes`: `voip`, `audio`
- Push Notifications capability + VoIP Services capability on the App ID (Apple
  Developer portal) — **separate from the app's regular push certificate**.

### Flow
1. App registers for a VoIP push token via `RNVoipPushNotification` on launch; sends it
   to `POST /push/register` with `tokenType: 'apnsVoip'`.
2. Backend call-push path (Phase 1) sends a VoIP push for iOS recipients.
3. **Native requirement**: inside `didReceiveIncomingPushWithPayload` (native iOS code,
   wired via the library), you MUST call `CXProvider.reportNewIncomingCall` *before*
   returning, synchronously — this is Apple's hard rule, not optional, or the OS will
   penalize/kill the app's ability to receive future VoIP pushes. This happens natively
   even if the JS engine isn't running yet.
4. CallKit shows the native incoming-call screen. User answers/declines via the native
   UI → `react-native-callkeep` emits JS events (`answerCall`/`endCall`) once the JS
   context is available — same reconciliation approach as Android: reconstruct the
   pending call from the payload and call the existing `answerCall()`/`rejectCall()`.
5. Cancel: caller hangs up → backend sends a second VoIP push with an "end" payload →
   native handler calls `CXProvider.reportCall(_:endedAt:reason:)` to dismiss the
   CallKit UI even if JS never fully wakes up.

---

## Phase 4 — Client Integration & Multi-Device

**Estimated time: 1 day**

- Thread `callId` through `CallContext.tsx` end-to-end (currently there isn't one —
  calls are identified only by `chatId` + participant socket ids).
- On login/app start: register for push (request Android 13+ notification permission,
  get FCM token / VoIP token) and `POST /push/register`; on logout, `POST
  /push/unregister`.
- Handle **token refresh** (FCM tokens rotate; VoIP tokens rarely but can) — re-register
  whenever the OS fires a refresh callback.
- Handle the **cold-start-from-notification** case app-wide: check for a pending
  call payload before the normal navigation/auth bootstrap decides what screen to show.
- Multi-device: when a device answers, it should notify the backend (already happens
  via `CALL_JOIN`) which should trigger the cancel-push path to every *other*
  registered device for that user for the same `callId`.

---

## Phase 5 — Testing Matrix

| Scenario | Platform | Expected |
|---|---|---|
| App foreground | Both | Existing socket-based incoming-call screen (unchanged) |
| App backgrounded, process alive | Both | Push arrives; no duplicate UI once socket also fires |
| App killed | Android | FCM data push → full-screen notifee notification + ringtone, Answer/Decline work |
| App killed | iOS | VoIP push → CallKit native ringing UI, works from lock screen |
| Caller hangs up before answered | Both | Notification/CallKit UI dismissed via cancel push |
| Ring timeout (45s, nobody answers) | Both | Server-side timeout fires; caller sees "no answer"; callee's notification is cancelled |
| Answered on a different device (multi-device) | Both | Other devices' notifications cancel |
| No network / airplane mode | Both | Push can't be delivered — falls back to today's missed-call semantics (documented limitation, not solvable) |
| Group call add-member mid-call | Both | New member gets the same push flow as a fresh call start |

---

## New Dependencies Summary

**Backend**: `firebase-admin`, `node-apn` (or `@parse/node-apn`), `uuid` (for `callId`
if not already available).

**Mobile**: `@react-native-firebase/app`, `@react-native-firebase/messaging`,
`@notifee/react-native`, `react-native-voip-push-notification`, `react-native-callkeep`.
(`expo-notifications` stays installed but likely still ends up unused for the actual
call-wake path — it's better suited to plain chat-message push notifications, a
separate future feature.)

**New credentials to provision** (outside the codebase): Firebase project + service
account key (Android), APNs VoIP auth key + VoIP Services capability on the App ID
(iOS). None of this works from the iOS Simulator — needs physical devices for Phase 3
testing.

---

## Implementation Order

| Step | Task | Time |
|---|---|---|
| 1 | Prisma `PushToken` model + `/push/register`/`/push/unregister` endpoints | 0.5 day |
| 2 | Backend `PushService` (FCM + APNs VoIP) + call.handler.ts integration + `callId` threading + server-side ring timeout + cancel push | 1 day |
| 3 | Android: RNFirebase + notifee + full-screen incoming-call notification + foreground service/ringtone + Answer/Decline | 2–3 days |
| 4 | iOS: PushKit token + CallKit via react-native-callkeep + native reportNewIncomingCall + Answer/Decline | 3–4 days |
| 5 | Client integration: callId plumbing, token registration/refresh, cold-start reconciliation, multi-device cancel | 1 day |
| 6 | End-to-end testing on physical devices (both platforms, killed/backgrounded/foreground) | 1–2 days |

**Total: ~9–12 days**, with iOS CallKit as the long pole (native-code-heavy,
device-only testing, Apple credential provisioning as a prerequisite).

---

## Open Questions / Risks

- **Apple Developer account access** — do we have (or need to obtain) the VoIP
  Services APNs key? This is a hard blocker for Phase 3 and should be confirmed first.
- **Firebase project** — does one already exist for this app (e.g. from
  `@react-native-google-signin/google-signin`, which implies a Firebase/Google Cloud
  project may already exist), or does one need to be created from scratch?
- **True "answer without opening the full app UI"** (WhatsApp connects audio the
  instant you tap Answer, before the UI is even visible) requires the WebRTC join to
  happen from a background/headless context, not just a deep-link-then-normal-boot.
  This plan's MVP scope (Phase 2–3) gets the ringing/answer *affordance* right but
  treats the actual `answerCall()` WebRTC join as happening on normal app
  foreground/boot after the tap — matching WhatsApp's *ringing* UX exactly, with a
  brief extra beat before audio connects compared to WhatsApp's instant-connect. Full
  parity there is a further follow-up if it matters enough to justify the added
  complexity (headless WebRTC connection setup).
- **Cost/complexity vs. value** — this is the single biggest feature in the codebase
  to date by native-code surface area. Worth sequencing Android first (cheaper, no
  paid-account blocker) and shipping that alone before committing to the iOS phase.
