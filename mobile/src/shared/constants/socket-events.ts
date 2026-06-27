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
  /** Notify peers that this user muted/unmuted their mic. Server relays to the room. */
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
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
