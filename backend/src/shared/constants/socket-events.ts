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

  // ── Calls: Client → Server ─────────────────────────────────────────────────
  CALL_START: 'call:start',
  CALL_JOIN: 'call:join',
  CALL_SIGNAL: 'call:signal',
  CALL_END: 'call:end',
  CALL_REJECT: 'call:reject',

  // ── Calls: Server → Client ─────────────────────────────────────────────────
  CALL_INCOMING: 'call:incoming',
  CALL_REJECTED: 'call:rejected',
  CALL_ENDED: 'call:ended',
  CALL_USER_JOINED: 'call:user-joined',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
