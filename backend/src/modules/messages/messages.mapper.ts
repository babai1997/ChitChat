import { MessageType, MessageStatus } from '@prisma/client';

type RawMessage = {
  id: string;
  chatId: string;
  senderId: string;
  content: string | null;
  type: MessageType;
  status: MessageStatus;
  isDeleted?: boolean;
  isEdited?: boolean;
  isEncrypted?: boolean;
  senderDeviceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  sender: {
    id: string;
    phone: string | null;
    email: string | null;
    profile: { displayName: string | null; avatarUrl: string | null } | null;
  };
  replyTo?: {
    id: string;
    content: string | null;
    type: MessageType;
    isDeleted?: boolean;
    isEncrypted?: boolean;
    sender: { id: string; profile: { displayName: string | null } | null };
  } | null;
  attachments?: Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSize: bigint;
    url: string;
  }>;
  ciphers?: Array<{
    ciphertext: string;
    device: { deviceId: string };
  }>;
};

export class MessagesMapper {
  /**
   * @param requesterDeviceId Which of the requester's devices is asking —
   * required to resolve the right MessageCipher row for an encrypted DIRECT
   * message. Omit for plaintext-only call sites (e.g. createSystemMessage,
   * which never produces encrypted rows) or group messages (ignored there).
   * @param isGroupChat Group Sender Key ciphertext is IDENTICAL for every
   * recipient (see packages/e2ee/src/senderKeys.ts) and lives directly on
   * `content` rather than a per-device MessageCipher row — so unlike direct
   * chats, resolving `cipher` here doesn't depend on who's asking.
   */
  static toDto(
    message: RawMessage,
    requesterDeviceId?: string,
    isGroupChat?: boolean,
  ) {
    const cipherForRequester = requesterDeviceId
      ? message.ciphers?.find((c) => c.device.deviceId === requesterDeviceId)
      : undefined;

    const cipher = message.isEncrypted
      ? isGroupChat
        ? (message.content ?? null)
        : (cipherForRequester?.ciphertext ?? null)
      : undefined;

    return {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      // Encrypted messages never expose plaintext content — only the caller's
      // own device's ciphertext, if we have one for it. The server itself
      // never had the plaintext to begin with (see messages.service.ts's
      // create()).
      content: message.isEncrypted ? null : message.content,
      isEncrypted: message.isEncrypted ?? false,
      cipher,
      // Every recipient device needs this — it's which of the SENDER's
      // devices to look up a Double Ratchet session for, not something
      // scoped to which device is asking (unlike `cipher` above).
      senderDeviceId: message.isEncrypted
        ? (message.senderDeviceId ?? undefined)
        : undefined,
      type: message.type,
      status: message.status,
      isDeleted: message.isDeleted ?? false,
      isEdited: message.isEdited ?? false,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: {
        id: message.sender.id,
        displayName:
          message.sender.profile?.displayName ||
          message.sender.phone ||
          message.sender.email ||
          'Unknown',
        avatarUrl: message.sender.profile?.avatarUrl ?? null,
      },
      replyTo: message.replyTo
        ? {
            id: message.replyTo.id,
            // An encrypted quoted message has no server-visible plaintext to
            // show — the client resolves the snippet from its own decrypted
            // message cache by id instead (see message.handlers.ts on both
            // clients).
            content: message.replyTo.isEncrypted
              ? null
              : message.replyTo.content,
            // Safe to expose even for encrypted messages — it's the same
            // "what kind of message is this" metadata already visible on
            // every other message; lets the client show "Photo"/"Video" etc.
            // instead of a bare "Media" when it can't resolve real content
            // from its local decrypted cache (see resolveReplyPreview below).
            type: message.replyTo.type,
            isDeleted: message.replyTo.isDeleted ?? false,
            senderName:
              message.replyTo.sender.profile?.displayName || 'Unknown',
          }
        : null,
      attachments: (message.attachments ?? []).map((a) => ({
        id: a.id,
        filename: a.fileName,
        mimeType: a.fileType,
        size: Number(a.fileSize),
        url: a.url,
      })),
    };
  }
}
