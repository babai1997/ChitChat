import { ChatType, ChatMemberRole, MessageStatus } from '@prisma/client';

type RawChatMember = {
  id: string;
  userId: string;
  role: ChatMemberRole;
  joinedAt: Date;
  lastReadAt: Date | null;
  user: {
    id: string;
    phone: string | null;
    email: string | null;
    profile: {
      displayName: string | null;
      avatarUrl: string | null;
      about: string;
      isOnline: boolean;
    } | null;
  };
};

type RawChat = {
  id: string;
  type: ChatType;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: RawChatMember[];
  messages?: Array<{
    id: string;
    content: string | null;
    type: string;
    status: MessageStatus;
    createdAt: Date;
    senderId: string;
    isEncrypted?: boolean;
    senderDeviceId?: string | null;
    sender?: {
      id: string;
      profile: { displayName: string | null } | null;
    } | null;
    ciphers?: Array<{
      ciphertext: string;
      device: { deviceId: string };
    }>;
  }>;
};

export class ChatsMapper {
  /**
   * @param requesterDeviceId Which of the caller's devices is asking —
   * required to resolve the right MessageCipher row when the chat's last
   * message is encrypted (see messages.mapper.ts's toDto, which this
   * mirrors — this preview is a separate query/DTO and was previously never
   * made encryption-aware at all, always exposing the raw null content
   * column regardless of who was asking).
   */
  static toDto(
    chat: RawChat,
    currentUserId: string,
    unreadCount: number,
    requesterDeviceId?: string,
  ) {
    const lastMessage = chat.messages?.[0];
    const isGroupChat = chat.type === ChatType.group || chat.type === ChatType.meeting;
    // Group Sender Key ciphertext is identical for every recipient and
    // lives directly on `content` (see messages.mapper.ts's toDto, which
    // this mirrors) — only DIRECT chats need to resolve a per-device
    // MessageCipher row by requesterDeviceId.
    const cipherForRequester =
      lastMessage && requesterDeviceId && !isGroupChat
        ? lastMessage.ciphers?.find(
            (c) => c.device.deviceId === requesterDeviceId,
          )
        : undefined;
    const otherMembers = chat.members.filter((m) => m.userId !== currentUserId);

    let displayName = chat.name;
    let avatarUrl = chat.avatarUrl;

    if (chat.type === ChatType.direct && otherMembers.length > 0) {
      const other = otherMembers[0];
      displayName =
        other.user.profile?.displayName ||
        other.user.phone ||
        other.user.email ||
        'Unknown';
      avatarUrl = other.user.profile?.avatarUrl ?? null;
    }

    return {
      id: chat.id,
      type: chat.type,
      name: displayName,
      avatarUrl,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      unreadCount,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.isEncrypted ? null : lastMessage.content,
            isEncrypted: lastMessage.isEncrypted ?? false,
            cipher: lastMessage.isEncrypted
              ? isGroupChat
                ? (lastMessage.content ?? null)
                : (cipherForRequester?.ciphertext ?? null)
              : undefined,
            senderDeviceId: lastMessage.isEncrypted
              ? (lastMessage.senderDeviceId ?? undefined)
              : undefined,
            type: lastMessage.type,
            status: lastMessage.status,
            createdAt: lastMessage.createdAt,
            senderId: lastMessage.senderId,
            senderName: lastMessage.sender?.profile?.displayName || 'Unknown',
          }
        : null,
      members: chat.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: {
          id: m.user.id,
          phone: m.user.phone,
          email: m.user.email,
          profile: m.user.profile
            ? {
                displayName: m.user.profile.displayName,
                avatarUrl: m.user.profile.avatarUrl,
                about: m.user.profile.about,
                isOnline: m.user.profile.isOnline,
              }
            : null,
        },
      })),
    };
  }
}
