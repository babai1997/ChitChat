/**
 * Single source of truth for all WebSocket event names.
 * Mirror of backend/src/shared/constants/socket-events.ts
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
  /** A group member joined — sender-key owners should distribute their CURRENT chain to them. */
  CHAT_MEMBER_ADDED: 'chat:member-added',
  /** A group member left/was removed — sender-key owners must rekey and redistribute to the new member set. */
  CHAT_MEMBER_REMOVED: 'chat:member-removed',
  /** The group's name/avatar changed. */
  CHAT_UPDATED: 'chat:updated',
  /** Someone was promoted to admin or demoted back to member. */
  CHAT_MEMBER_ROLE_UPDATED: 'chat:member-role-updated',

  // ── Profile: Server → Client ────────────────────────────────────────────────
  /** A contact you share a chat with changed their displayName/avatarUrl. */
  PROFILE_UPDATED: 'profile:updated',

  // ── Sender Keys (Phase 2 group E2EE): Client → Server ───────────────────────
  /** Distribute (or redistribute, on rekey) this device's group chain key to other members' devices. */
  SENDER_KEY_DISTRIBUTE: 'sender-key:distribute',

  // ── Sender Keys: Server → Client ────────────────────────────────────────────
  /** Real-time push of a distribution to an online target device. */
  SENDER_KEY_NEW: 'sender-key:new',

  // ── Device Link (Phase 4a history sync): Server → Client ───────────────────
  /** A new device just registered and is pending approval — ignore if it's about your own deviceId. */
  DEVICE_LINK_REQUEST: 'device:link-request',
  /** A pending device was approved. */
  DEVICE_LINK_APPROVED: 'device:link-approved',
  /** A pending device was declined and deleted. */
  DEVICE_LINK_DECLINED: 'device:link-declined',
  /** Real-time push of one chat's re-encrypted history batch to a newly-approved device. */
  DEVICE_HISTORY_CHUNK: 'device:history-chunk',

  // ── Calls: Client → Server ─────────────────────────────────────────────────
  CALL_START: 'call:start',
  CALL_JOIN: 'call:join',
  CALL_SIGNAL: 'call:signal',
  CALL_END: 'call:end',
  CALL_REJECT: 'call:reject',
  /** Notify peers that this user toggled their camera on/off. Server relays to the room. */
  CALL_VIDEO_STATE: 'call:video-state',
  /** Notify peers that this user muted/unmuted their mic. Server relays to the room. */
  CALL_AUDIO_STATE: 'call:audio-state',
  /** Caller timed out — no one answered. Server creates a missed-call message. */
  CALL_MISSED: 'call:missed',
  /** Invite a specific member of the chat to join an ongoing call. */
  CALL_ADD_MEMBER: 'call:add-member',

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
