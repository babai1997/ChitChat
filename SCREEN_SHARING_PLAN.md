# Screen Sharing Feature Plan

Real-time screen sharing for audio/video calls on web and mobile, modelled after Microsoft Teams — shared screen takes the main view while participant cameras shrink to a strip.

---

## Architecture

Screen sharing is an additional `MediaStream` added to existing WebRTC peer connections. The backend relay only carries signalling (who started/stopped sharing); the actual screen video flows peer-to-peer via WebRTC.

```
Sharer                    Backend (Socket.io)           Viewers
  │                               │                        │
  ├─ getDisplayMedia() ──────────►│                        │
  ├─ replaceTrack() on all peers  │                        │
  ├─ CALL_SCREEN_SHARE_START ────►│─── broadcast ─────────►│
  │                               │                        ├─ receive new video track
  │                               │                        └─ show screen layout
  │                               │                        │
  ├─ (user stops share)           │                        │
  ├─ restore camera track         │                        │
  └─ CALL_SCREEN_SHARE_STOP ─────►│─── broadcast ─────────►│
                                  │                        └─ restore grid layout
```

**Strategy:** Replace the existing camera video track with the screen track while sharing (Teams-style). One person shares at a time. When sharing stops, restore the camera track.

---

## Phase 1 — Backend: Socket Events

**Estimated time: 30 minutes**

### Files to change (must stay in sync across all three)

- `backend/src/shared/constants/socket-events.ts`
- `frontend/src/shared/constants/socket-events.ts`
- `mobile/src/shared/constants/socket-events.ts`

### New events to add

```ts
// Client → Server
CALL_SCREEN_SHARE_START: 'call:screen-share-start',
CALL_SCREEN_SHARE_STOP:  'call:screen-share-stop',

// Server → Client
CALL_SCREEN_SHARING:     'call:screen-sharing',   // broadcast: someone started
CALL_SCREEN_STOPPED:     'call:screen-stopped',   // broadcast: sharing ended
```

### Gateway handler (`backend/src/modules/gateway/handlers/`)

| Event received | Action |
|----------------|--------|
| `call:screen-share-start` | Broadcast `{ userId, chatId }` as `call:screen-sharing` to the chat room |
| `call:screen-share-stop` | Broadcast `{ userId, chatId }` as `call:screen-stopped` to the chat room |

No database changes needed — screen share state is ephemeral (same as mute state).

---

## Phase 2 — Web Frontend

**Estimated time: 2–3 hours**

### `frontend/src/contexts/CallContext.tsx`

#### New state

```ts
isScreenSharing: boolean          // this user is sharing
screenStream: MediaStream | null  // local screen stream
sharingUserId: string | null      // which participant is currently sharing (null = nobody)
```

#### New functions exposed on context

```ts
startScreenShare: () => Promise<void>
stopScreenShare: () => void
```

#### `startScreenShare()` implementation

```ts
async function startScreenShare() {
  const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  const screenTrack = screen.getVideoTracks()[0];

  // Replace camera track with screen track in every peer connection
  peersRef.current.forEach((peer) => {
    const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
    sender?.replaceTrack(screenTrack);
  });

  setScreenStream(screen);
  setIsScreenSharing(true);
  socket.emit(SOCKET_EVENTS.CALL_SCREEN_SHARE_START, { chatId: activeChatId });

  // Auto-stop when user clicks the browser's "Stop sharing" button
  screenTrack.addEventListener('ended', stopScreenShare);
}
```

#### `stopScreenShare()` implementation

```ts
function stopScreenShare() {
  screenStream?.getTracks().forEach(t => t.stop());

  // Restore camera video track in every peer connection
  const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
  if (cameraTrack) {
    peersRef.current.forEach((peer) => {
      const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
      sender?.replaceTrack(cameraTrack);
    });
  }

  setScreenStream(null);
  setIsScreenSharing(false);
  socket.emit(SOCKET_EVENTS.CALL_SCREEN_SHARE_STOP, { chatId: activeChatId });
}
```

#### New socket listeners

```ts
socket.on(SOCKET_EVENTS.CALL_SCREEN_SHARING, ({ userId }) => setSharingUserId(userId));
socket.on(SOCKET_EVENTS.CALL_SCREEN_STOPPED,  ()           => setSharingUserId(null));
```

### Call UI component

#### Controls bar — add screen share button

```
[ Mute ]  [ Camera ]  [ Share Screen ]  [ End Call ]
```

- Button shows "Stop Sharing" (red) when `isScreenSharing === true`
- Button is disabled with tooltip "Someone is already sharing" when `sharingUserId` is set and is not the current user

#### Layout when sharing is active

```
┌─────────────────────────────────────┐
│                                     │
│         Shared Screen               │  ← remote video stream (screen track)
│         (large, ~80% height)        │    or local preview if self-sharing
│                                     │
├──────┬──────┬──────┬──────┬─────────┤
│ 👤   │ 👤   │ 👤   │ 👤   │  ...    │  ← participant camera tiles (strip)
└──────┴──────┴──────┴──────┴─────────┘
```

- Banner: `"You are sharing your screen"` with red border when `isScreenSharing`
- Banner: `"<Name> is sharing their screen"` for viewers when `sharingUserId` is set

---

## Phase 3 — Mobile

**Estimated time: 3–4 hours**

### Platform support

| Platform | API | Notes |
|----------|-----|-------|
| Android | `mediaDevices.getDisplayMedia()` via react-native-webrtc | Supported. Requires `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PROJECTION` permissions. |
| iOS | ReplayKit Broadcast Extension | Requires a separate native target. Complex in Expo managed workflow. Defer to Phase 4. |

### `mobile/app.json` — add Android permissions

```json
"permissions": [
  "CAMERA",
  "RECORD_AUDIO",
  "READ_EXTERNAL_STORAGE",
  "WRITE_EXTERNAL_STORAGE",
  "MODIFY_AUDIO_SETTINGS",
  "ACCESS_NETWORK_STATE",
  "INTERNET",
  "FOREGROUND_SERVICE",
  "FOREGROUND_SERVICE_MEDIA_PROJECTION"
]
```

> Requires a rebuild (`npm run android`) after this change.

### `mobile/src/contexts/CallContext.tsx`

Same state and logic as web. Replace `navigator.mediaDevices.getDisplayMedia` with:

```ts
import { mediaDevices } from 'react-native-webrtc';

const screen = await mediaDevices.getDisplayMedia({ video: true });
```

Track replacement on `RTCPeerConnection` senders follows the same pattern.

### `mobile/components/call/ActiveCallScreen.tsx`

#### Controls — add screen share button

Use an icon (e.g. `Monitor` from lucide-react-native) alongside the existing Mic/Camera/End buttons.

#### Layout when sharing is active

```
┌────────────────────────────────┐
│  👤  👤  👤   (camera strip)   │  ← horizontal ScrollView at top
├────────────────────────────────┤
│                                │
│       Shared Screen            │  ← RTCView (flex: 1)
│                                │
├────────────────────────────────┤
│  [ Mic ] [ Cam ] [ Share ] [ End ] │
└────────────────────────────────┘
```

---

## Phase 4 — iOS ReplayKit (Advanced)

**Estimated time: 1–2 days**

iOS full screen sharing (captures the entire device, including other apps) requires a **Broadcast Extension** — a separate app target that runs in the background using ReplayKit.

### Steps

1. Create a `BroadcastExtension` target in Xcode (separate from the main app)
2. Set up an App Group so the extension and main app can share data
3. Use `react-native-webrtc`'s `RTCScreenCapturePickerView` to trigger the ReplayKit picker
4. Stream the captured frames into the existing WebRTC peer connection

> This requires ejecting from Expo managed workflow (or using a custom Expo plugin to add the extension target). Plan a dedicated native build session for iOS.

---

## UI/UX Rules

| Scenario | Behaviour |
|----------|-----------|
| You start sharing | Red "Stop Sharing" button appears. Banner: "You are sharing your screen." |
| Someone else is sharing | Your Share button is disabled. Banner: "<Name> is sharing." |
| Sharer ends call | Screen share stops automatically before call teardown. |
| Sharer's browser UI "Stop sharing" clicked | `track.ended` event fires → `stopScreenShare()` called automatically. |
| Multiple participants | Only one person can share at a time. Server enforces this by broadcasting state; client disables button. |

---

## Implementation Order

| Step | Task | Time |
|------|------|------|
| 1 | Backend socket events + gateway handler | 30 min |
| 2 | Web `CallContext` — start/stop functions + socket listeners | 1 h |
| 3 | Web call UI — button + screen layout | 1–2 h |
| 4 | Android mobile — permissions + `CallContext` | 1.5 h |
| 5 | Mobile `ActiveCallScreen` — button + screen layout | 1.5 h |
| 6 | iOS ReplayKit extension | 1–2 days |

---

## Files to Change (Summary)

### Backend
- `backend/src/shared/constants/socket-events.ts`
- `backend/src/modules/gateway/handlers/call.handler.ts` *(or equivalent)*

### Web Frontend
- `frontend/src/shared/constants/socket-events.ts`
- `frontend/src/contexts/CallContext.tsx`
- *(call UI component — active call view)*

### Mobile
- `mobile/src/shared/constants/socket-events.ts`
- `mobile/src/contexts/CallContext.tsx`
- `mobile/components/call/ActiveCallScreen.tsx`
- `mobile/app.json` *(Android permissions)*
