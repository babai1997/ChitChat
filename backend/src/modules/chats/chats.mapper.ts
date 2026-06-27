import { ChatType, ChatMemberRole } from '@prisma/client';

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
    createdAt: Date;
    senderId: string;
    sender?: {
      id: string;
      profile: { displayName: string | null } | null;
    } | null;
  }>;
};

export class ChatsMapper {
  static toDto(chat: RawChat, currentUserId: string, unreadCount: number) {
    const lastMessage = chat.messages?.[0];
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
            content: lastMessage.content,
            type: lastMessage.type,
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
