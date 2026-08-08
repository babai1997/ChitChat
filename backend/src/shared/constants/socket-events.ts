/**
 * Single source of truth for all WebSocket event names.
 * Any change here must be mirrored in frontend/src/shared/constants/socket-events.ts
 */
export const SOCKET_EVENTS = {
  // ── Messages: Client → Server ──────────────────────────────────────────────
  MESSAGE_SEND: 'message:send',
  MESSAGE_READ: 'message:read',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_EDIT: 'message:edit',

  // ── Messages: Server → Client ──────────────────────────────────────────────
  MESSAGE_NEW: 'message:new',
  MESSAGE_SENT: 'message:sent',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ_ACK: 'message:read',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_EDITED: 'message:edited',

  // ── Typing ─────────────────────────────────────────────────────────────────
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // ── Presence ───────────────────────────────────────────────────────────────
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  USERS_ONLINE: 'users:online',

  // ── Chat rooms ─────────────────────────────────────────────────────────────
  CHAT_JOIN: 'chat:join',
  CHAT_LEAVE: 'chat:leave',
  CHAT_NEW: 'chat:new',
  /** Broadcast to a group's remaining members: someone new joined — existing
   *  sender-key owners should distribute their CURRENT chain to them. */
  CHAT_MEMBER_ADDED: 'chat:member-added',
  /** Broadcast to a group's remaining members: someone left/was removed —
   *  every sender-key owner among them must rekey (fresh chain, redistributed
   *  to the new member set) so the removed member can't decrypt anything new. */
  CHAT_MEMBER_REMOVED: 'chat:member-removed',
  /** Broadcast to a group's members: the name/avatar changed — without this,
   *  only the member who made the change ever learns about it in their own
   *  client; everyone else is stuck with stale data until a full refetch. */
  CHAT_UPDATED: 'chat:updated',
  /** Broadcast to a group's members: someone was promoted to admin or
   *  demoted back to member — without this, only the admin who made the
   *  change sees it in their own client. */
  CHAT_MEMBER_ROLE_UPDATED: 'chat:member-role-updated',

  // ── Profile: Server → Client ────────────────────────────────────────────────
  /** Pushed to every user who shares a chat with the updater: their
   *  displayName/avatarUrl changed — every OTHER user's client has this
   *  person's profile only as a snapshot embedded in chat member data, with
   *  no other way to learn it changed short of a full refetch. */
  PROFILE_UPDATED: 'profile:updated',

  // ── Sender Keys (Phase 2 group E2EE): Client → Server ───────────────────────
  /** Distribute (or redistribute, on rekey) this device's group chain key to other members' devices. */
  SENDER_KEY_DISTRIBUTE: 'sender-key:distribute',

  // ── Sender Keys: Server → Client ────────────────────────────────────────────
  /** Real-time push of a distribution to an online target device (persisted regardless — see GET /sender-key-distributions). */
  SENDER_KEY_NEW: 'sender-key:new',

  // ── Device Link (Phase 4a history sync): Server → Client ───────────────────
  /** Broadcast to every one of the user's connected sockets: a new device just registered and is pending approval. Clients ignore this if it's about their own deviceId. */
  DEVICE_LINK_REQUEST: 'device:link-request',
  /** Broadcast to every one of the user's connected sockets: a pending device was approved. The new device dismisses its "waiting" state; the approving device already pushed history synchronously and doesn't need this for itself. */
  DEVICE_LINK_APPROVED: 'device:link-approved',
  /** Broadcast to every one of the user's connected sockets: a pending device was declined and its Device row deleted. */
  DEVICE_LINK_DECLINED: 'device:link-declined',
  /** Real-time push of one chat's re-encrypted history batch to an online new device (persisted regardless — see GET /devices/link-payloads/pending). */
  DEVICE_HISTORY_CHUNK: 'device:history-chunk',

  // ── Calls: Client → Server ─────────────────────────────────────────────────
  CALL_START: 'call:start',
  CALL_JOIN: 'call:join',
  CALL_SIGNAL: 'call:signal',
  CALL_END: 'call:end',
  CALL_REJECT: 'call:reject',
  /** Caller timed out — no one answered. Server creates a missed-call message. */
  CALL_MISSED: 'call:missed',
  /** Invite a specific member of the chat to join an ongoing call. */
  CALL_ADD_MEMBER: 'call:add-member',
  /** Broadcast own camera on/off state to everyone in the chat room. */
  CALL_VIDEO_STATE: 'call:video-state',
  /** Broadcast own mic muted/unmuted state to everyone in the chat room. */
  CALL_AUDIO_STATE: 'call:audio-state',

  // ── Calls: Server → Client ─────────────────────────────────────────────────
  CALL_INCOMING: 'call:incoming',
  /** Sent back to the caller after CALL_START to tell them how many recipients are ringing. */
  CALL_RINGING: 'call:ringing',
  /** Broadcast to chat room when a call is active — lets non-participants see the "Join" banner. */
  CALL_ONGOING: 'call:ongoing',
  /** Broadcast to chat room when the last participant leaves — removes the banner. */
  CALL_FINISHED: 'call:finished',
  CALL_REJECTED: 'call:rejected',
  CALL_ENDED: 'call:ended',
  CALL_USER_JOINED: 'call:user-joined',

  // ── Screen Share: Client → Server ──────────────────────────────────────────
  CALL_SCREEN_SHARE_START: 'call:screen-share-start',
  CALL_SCREEN_SHARE_STOP: 'call:screen-share-stop',

  // ── Screen Share: Server → Client ──────────────────────────────────────────
  /** Broadcast to chat room: a participant started sharing their screen. */
  CALL_SCREEN_SHARING: 'call:screen-sharing',
  /** Broadcast to chat room: screen sharing has stopped. */
  CALL_SCREEN_STOPPED: 'call:screen-stopped',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
