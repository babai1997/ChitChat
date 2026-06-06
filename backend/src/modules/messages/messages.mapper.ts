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
    sender: { id: string; profile: { displayName: string | null } | null };
  } | null;
  attachments: Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSize: bigint;
    url: string;
  }>;
};

export class MessagesMapper {
  static toDto(message: RawMessage) {
    return {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      content: message.content,
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
            content: message.replyTo.content,
            senderName: message.replyTo.sender.profile?.displayName || 'Unknown',
          }
        : null,
      attachments: message.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        fileType: a.fileType,
        fileSize: Number(a.fileSize),
        url: a.url,
      })),
    };
  }
}
