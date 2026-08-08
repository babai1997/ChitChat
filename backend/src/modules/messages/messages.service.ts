import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageType, MessageStatus, Prisma } from '@prisma/client';
import { CreateMessageDto, MessageQueryDto } from './dto';
import { MessagesMapper } from './messages.mapper';

interface CreateMessageData {
  chatId: string;
  senderId: string;
  // Required for plaintext messages; omitted when isEncrypted is true, where
  // the real content only ever exists as per-device ciphertext in `ciphers`.
  content?: string;
  type?: MessageType;
  replyToId?: string;
  attachments?: {
    filename: string;
    url: string;
    mimetype: string;
    size: number;
  }[];
  isEncrypted?: boolean;
  // Which of the SENDER's devices encrypted this — persisted so a later
  // REST history fetch (or a reconnect) still knows which Double Ratchet
  // session a recipient should use, not just the live socket payload
  // (direct chats), or which Sender Key chain to decrypt against (group
  // chats — see groupCiphertext below).
  senderDeviceId?: string;
  // DIRECT chats only — one Double Ratchet ciphertext per recipient (+ the
  // sender's own other) device. Keyed by (userId, deviceId) — deviceId
  // strings are client-generated and only unique per user (see Device's
  // @@unique([userId, deviceId])), so userId is required to resolve the
  // right Device row, not optional metadata. Resolved to internal Device
  // rows inside create().
  ciphers?: { userId: string; deviceId: string; ciphertext: string }[];
  // GROUP chats only — a Sender Key chain produces IDENTICAL ciphertext for
  // every recipient (see packages/e2ee/src/senderKeys.ts), so there's no
  // per-device fan-out to resolve here: this goes straight onto `content`
  // instead of a MessageCipher row per target. Mutually exclusive with
  // `ciphers` — enforced in create() by branching on the chat's type.
  groupCiphertext?: string;
}

const MESSAGE_INCLUDE = {
  sender: { include: { profile: true } },
  replyTo: { include: { sender: { include: { profile: true } } } },
  attachments: true,
  ciphers: { include: { device: true } },
} satisfies Prisma.MessageInclude;

/**
 * Prisma issues a SEPARATE round trip per to-many relation in an `include`
 * (attachments, ciphers) rather than folding them into one JOIN — against a
 * remote database (Neon), that's the dominant cost of sending a message, not
 * the crypto or the message row itself. `create()` knows in advance whether
 * THIS message has a reply/attachments/ciphers, unlike the paginated history
 * read in getMessages (which can't know ahead of time and keeps the full
 * MESSAGE_INCLUDE) — so only ask for what this specific send actually has.
 */
function buildCreateInclude(data: {
  replyToId?: string;
  attachments?: unknown[];
  ciphers?: unknown[];
}): Prisma.MessageInclude {
  return {
    sender: { include: { profile: true } },
    ...(data.replyToId && {
      replyTo: { include: { sender: { include: { profile: true } } } },
    }),
    ...(data.attachments?.length && { attachments: true }),
    ...(data.ciphers?.length && { ciphers: { include: { device: true } } }),
  };
}

// buildCreateInclude's shape varies per call, so — unlike MESSAGE_INCLUDE,
// which is always requested in full for getMessages — replyTo/attachments/
// ciphers are genuinely optional here, not guaranteed present. This type
// (rather than casting to the full always-present MESSAGE_INCLUDE payload)
// keeps that honest so the compiler catches a missing `?? []`/`?.` instead
// of a runtime crash on an un-included relation.
type CreatedMessage = Omit<
  Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>,
  'replyTo' | 'attachments' | 'ciphers'
> & {
  replyTo?: Prisma.MessageGetPayload<{
    include: typeof MESSAGE_INCLUDE;
  }>['replyTo'];
  attachments?: Prisma.MessageGetPayload<{
    include: typeof MESSAGE_INCLUDE;
  }>['attachments'];
  ciphers?: Prisma.MessageGetPayload<{
    include: typeof MESSAGE_INCLUDE;
  }>['ciphers'];
};

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ============================================
  // Get Messages
  // ============================================

  async getMessages(
    chatId: string,
    userId: string,
    query: MessageQueryDto,
    requesterDeviceId?: string,
  ) {
    // Verify user is a member of the chat. Piggybacks the chat's type on
    // the same round trip (via the relation) — needed below to resolve
    // group Sender Key ciphertext (identical for everyone, on `content`)
    // vs. direct per-device MessageCipher rows.
    const membership = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
      include: { chat: { select: { type: true } } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this chat');
    }
    // 'meeting' chats use the exact same Sender-Key group E2EE as 'group'
    // — they're just a group chat self-joined via a link instead of an
    // admin invite (see MeetingsService) — so they share this branch.
    const isGroupChat = membership.chat.type === 'group' || membership.chat.type === 'meeting';

    const limit = query.limit || 50;
    const direction = query.direction || 'before';

    let cursor: Prisma.MessageWhereInput = {};

    if (query.cursor) {
      // Find the cursor message to get its createdAt
      const cursorMessage = await this.prisma.message.findUnique({
        where: { id: query.cursor },
      });

      if (cursorMessage) {
        cursor = {
          createdAt:
            direction === 'before'
              ? { lt: cursorMessage.createdAt }
              : { gt: cursorMessage.createdAt },
        };
      }
    }

    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        ...cursor,
      },
      orderBy: { createdAt: direction === 'before' ? 'desc' : 'asc' },
      take: limit + 1, // Fetch one extra to check if there are more
      include: MESSAGE_INCLUDE,
    });

    const hasMore = messages.length > limit;
    const messageList = hasMore ? messages.slice(0, limit) : messages;

    // Reverse if fetching before (we query desc but display asc)
    if (direction === 'before') {
      messageList.reverse();
    }

    const formattedMessages = messageList.map((m) =>
      MessagesMapper.toDto(m, requesterDeviceId, isGroupChat),
    );

    const nextCursor =
      hasMore && messageList.length > 0
        ? direction === 'before'
          ? messageList[0].id
          : messageList[messageList.length - 1].id
        : null;

    const prevCursor =
      messageList.length > 0
        ? direction === 'before'
          ? messageList[messageList.length - 1].id
          : messageList[0].id
        : null;

    return {
      messages: formattedMessages,
      nextCursor,
      prevCursor,
      hasMore,
    };
  }

  /**
   * Powers the "All Media"/"Docs" tabs (see ChatGalleryModal on both
   * clients) — every message of the given type(s) across the WHOLE chat
   * history, not just what's currently loaded in the open chat. Same
   * membership/isGroupChat/cipher-resolution shape as getMessages, just
   * filtered by `type` instead of paginating everything. `type` is safe to
   * filter on even for encrypted messages — it's metadata the server always
   * sees, never the message content (see messages.mapper.ts). There's no
   * server-side equivalent for the "Links" tab: a URL only exists inside
   * decrypted plaintext, which the server never has — that tab is scanned
   * client-side over messages it's already decrypted locally.
   */
  async getGallery(
    chatId: string,
    userId: string,
    types: MessageType[],
    cursor: string | undefined,
    limit: number,
    requesterDeviceId?: string,
  ) {
    const membership = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
      include: { chat: { select: { type: true } } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this chat');
    }
    const isGroupChat = membership.chat.type === 'group' || membership.chat.type === 'meeting';

    let cursorClause: Prisma.MessageWhereInput = {};
    if (cursor) {
      const cursorMessage = await this.prisma.message.findUnique({ where: { id: cursor } });
      if (cursorMessage) {
        cursorClause = { createdAt: { lt: cursorMessage.createdAt } };
      }
    }

    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        type: { in: types },
        isDeleted: false,
        ...cursorClause,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: MESSAGE_INCLUDE,
    });

    const hasMore = messages.length > limit;
    const messageList = hasMore ? messages.slice(0, limit) : messages;

    return {
      messages: messageList.map((m) => MessagesMapper.toDto(m, requesterDeviceId, isGroupChat)),
      nextCursor: hasMore ? messageList[messageList.length - 1].id : null,
      hasMore,
    };
  }

  // ============================================
  // Create Message
  // ============================================

  async create(
    data: CreateMessageData,
    options: { emitEvent?: boolean } = { emitEvent: true },
  ) {
    if (!data.isEncrypted && !data.content) {
      throw new BadRequestException(
        'content is required for non-encrypted messages',
      );
    }

    // These four checks are independent of each other — run them
    // concurrently instead of as sequential round trips. This database is
    // remote (Neon) with real network latency per query, so every avoidable
    // sequential round trip directly adds to how long "send" feels.
    const [membership, replyTarget, resolvedCiphers, chat] = await Promise.all([
      this.prisma.chatMember.findUnique({
        where: {
          chatId_userId: { chatId: data.chatId, userId: data.senderId },
        },
      }),
      data.replyToId
        ? this.prisma.message.findUnique({
            where: { id: data.replyToId },
            select: { chatId: true },
          })
        : Promise.resolve(null),
      data.ciphers?.length
        ? this.resolveCipherDevices(data.ciphers)
        : Promise.resolve([]),
      this.prisma.chat.findUnique({
        where: { id: data.chatId },
        select: { type: true },
      }),
    ]);

    if (!membership) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    const isGroupChat = chat?.type === 'group' || chat?.type === 'meeting';
    if (data.isEncrypted) {
      // Direct chats fan out one Double Ratchet ciphertext per device;
      // group chats carry one shared Sender Key ciphertext straight on
      // `content` (see groupCiphertext's jsdoc above) — the two are
      // mutually exclusive and gated by the chat's actual type, not
      // whichever field happened to be populated, so a client can't shove
      // a group message through the (weaker, per-device-blind) group path
      // for what's really a direct chat, or vice versa.
      if (isGroupChat && !data.groupCiphertext) {
        throw new BadRequestException(
          'isEncrypted group messages must include groupCiphertext',
        );
      }
      if (!isGroupChat && !data.ciphers?.length) {
        throw new BadRequestException(
          'isEncrypted direct messages must include at least one recipient-device cipher',
        );
      }
    }

    // A reply must point at a message that actually exists in this same chat —
    // otherwise a stale/foreign replyToId would either silently fail the FK
    // constraint or, worse, quote a message from a chat the sender isn't in.
    if (
      data.replyToId &&
      (!replyTarget || replyTarget.chatId !== data.chatId)
    ) {
      throw new BadRequestException(
        'Cannot reply to a message outside this chat',
      );
    }

    // Create message with attachments
    const message = (await this.prisma.message.create({
      data: {
        chatId: data.chatId,
        senderId: data.senderId,
        // Direct: null — the real content only exists per-device in
        // `ciphers` below. Group: the shared Sender Key ciphertext itself,
        // since it's identical for every recipient (no per-device split).
        content: data.isEncrypted
          ? isGroupChat
            ? data.groupCiphertext
            : null
          : data.content,
        isEncrypted: !!data.isEncrypted,
        senderDeviceId: data.isEncrypted ? data.senderDeviceId : undefined,
        type: data.type || MessageType.text,
        status: MessageStatus.sent,
        replyToId: data.replyToId,
        attachments: data.attachments?.length
          ? {
              create: data.attachments.map((file) => ({
                fileName: file.filename,
                url: file.url,
                fileType: file.mimetype,
                fileSize: file.size,
              })),
            }
          : undefined,
        ciphers: resolvedCiphers.length
          ? {
              create: resolvedCiphers.map((c) => ({
                recipientDeviceId: c.deviceId,
                ciphertext: c.ciphertext,
              })),
            }
          : undefined,
      },
      include: buildCreateInclude({
        replyToId: data.replyToId,
        attachments: data.attachments,
        ciphers: resolvedCiphers,
      }),
      // Prisma's return-type inference needs the include's literal shape at
      // the call site to narrow precisely — since buildCreateInclude's shape
      // varies per call, TS can't do that here. At runtime this returns
      // exactly the relations requested; MessagesMapper.toDto already treats
      // replyTo/attachments/ciphers as optional/defaulted for exactly this
      // reason (a message with no reply genuinely doesn't have one).
    })) as unknown as CreatedMessage;

    // Bump the chat's updatedAt (sort order in the chat list) — fire-and-forget
    // rather than awaited. It's not correctness-critical for the sender to
    // wait on (a few hundred ms of staleness in list ordering is invisible),
    // and awaiting it here would add one more full round trip to a remote
    // database directly onto perceived send latency for no real benefit.
    this.prisma.chat
      .update({ where: { id: data.chatId }, data: { updatedAt: new Date() } })
      .catch((err) => {
        console.error('Failed to bump chat.updatedAt after message send:', err);
      });

    // Any member who had "deleted" this chat (WhatsApp-style, delete-for-me)
    // gets it un-hidden by new activity, same as WhatsApp — also fire-and-forget,
    // same reasoning as the updatedAt bump above.
    this.prisma.chatMember
      .updateMany({
        where: { chatId: data.chatId, deletedAt: { not: null } },
        data: { deletedAt: null },
      })
      .catch((err) => {
        console.error('Failed to clear deletedAt after message send:', err);
      });

    const formattedMessage = MessagesMapper.toDto(
      message,
      undefined,
      isGroupChat,
    );

    // Emit event for real-time updates (unless skipped by WebSocket gateway).
    // Encrypted messages skip this: a single room broadcast can't carry
    // different ciphertext per recipient device, so the WebSocket path
    // (message.handler.ts) handles their delivery itself via per-device fan-out.
    if (options.emitEvent !== false && !data.isEncrypted) {
      this.eventEmitter.emit('message.created', formattedMessage);
    }

    return {
      dto: formattedMessage,
      // Per-device ciphertext, for callers (message.handler.ts) that need to
      // fan a single encrypted send out to each recipient device individually
      // rather than broadcast one shared payload.
      ciphers: (message.ciphers ?? []).map((c) => ({
        userId: c.device.userId,
        deviceId: c.device.deviceId,
        ciphertext: c.ciphertext,
      })),
    };
  }

  /**
   * Resolves (userId, deviceId) pairs to internal Device rows for the
   * MessageCipher FK. Deliberately scoped by BOTH — deviceId strings are
   * client-generated and only unique per user (Device.@@unique([userId,
   * deviceId])), not globally, so looking up by deviceId alone can resolve
   * to the wrong user's device if two accounts' client-facing ids ever
   * collide (e.g. two accounts tested in browser tabs sharing localStorage).
   * Also defensively dedupes by resolved internal id — a client bug sending
   * the same target twice would otherwise violate MessageCipher's
   * (messageId, recipientDeviceId) unique constraint instead of just
   * harmlessly writing one cipher for that device.
   */
  private async resolveCipherDevices(
    ciphers: { userId: string; deviceId: string; ciphertext: string }[],
  ): Promise<{ deviceId: string; ciphertext: string }[]> {
    const devices = await this.prisma.device.findMany({
      where: {
        revoked: false,
        OR: ciphers.map((c) => ({ userId: c.userId, deviceId: c.deviceId })),
      },
      select: { id: true, userId: true, deviceId: true },
    });
    const byCompoundKey = new Map(
      devices.map((d) => [`${d.userId}:${d.deviceId}`, d.id]),
    );

    const seenInternalIds = new Set<string>();
    const resolved: { deviceId: string; ciphertext: string }[] = [];
    for (const c of ciphers) {
      const internalId = byCompoundKey.get(`${c.userId}:${c.deviceId}`);
      if (!internalId || seenInternalIds.has(internalId)) continue;
      seenInternalIds.add(internalId);
      resolved.push({ deviceId: internalId, ciphertext: c.ciphertext });
    }
    return resolved;
  }

  /**
   * Creates a system-generated message (e.g. "Missed audio call").
   * Skips the membership check — the caller already validated membership.
   * Does NOT emit a message.created event — the caller (CallHandler) broadcasts
   * the message via the gateway directly to avoid double-emit.
   */
  async createSystemMessage(
    chatId: string,
    senderId: string,
    content: string,
    type: MessageType,
  ) {
    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId,
        content,
        type,
        status: MessageStatus.sent,
      },
      include: {
        sender: { include: { profile: true } },
        replyTo: false,
        attachments: true,
      },
    });

    // Update chat's updatedAt so it sorts to top
    await this.prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    return MessagesMapper.toDto(message);
  }

  // ============================================
  // Message Status
  // ============================================

  async updateStatus(messageId: string, status: MessageStatus) {
    const message = await this.prisma.message.update({
      where: { id: messageId },
      data: { status },
    });

    return message;
  }

  async markAsDelivered(messageIds: string[]) {
    await this.prisma.message.updateMany({
      where: {
        id: { in: messageIds },
        status: MessageStatus.sent,
      },
      data: { status: MessageStatus.delivered },
    });
  }

  async markAllAsDeliveredForChats(chatIds: string[], userId: string) {
    // Find messages to update
    const pendingMessages = await this.prisma.message.findMany({
      where: {
        chatId: { in: chatIds },
        senderId: { not: userId },
        status: MessageStatus.sent,
      },
      select: { id: true, senderId: true, chatId: true },
    });

    if (pendingMessages.length === 0) return [];

    const messageIds = pendingMessages.map((m) => m.id);

    // Update status
    await this.prisma.message.updateMany({
      where: { id: { in: messageIds } },
      data: { status: MessageStatus.delivered },
    });

    return pendingMessages;
  }

  async markAsRead(messageIds: string[], userId: string) {
    // Only mark messages from other users as read
    await this.prisma.message.updateMany({
      where: {
        id: { in: messageIds },
        senderId: { not: userId },
        status: { not: MessageStatus.read },
      },
      data: { status: MessageStatus.read },
    });
  }

  async getUndeliveredMessages(chatId: string, userId: string) {
    // Get messages that were sent while user was offline
    const membership = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!membership || !membership.lastReadAt) {
      return [];
    }

    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        senderId: { not: userId },
        createdAt: { gt: membership.lastReadAt },
      },
      include: {
        sender: { include: { profile: true } },
        attachments: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((m) => MessagesMapper.toDto(m as any));
  }

  async deleteMessage(
    messageId: string,
    userId: string,
    deleteForEveryone: boolean,
  ): Promise<{ success: boolean; message?: any }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { include: { profile: true } },
        attachments: true,
      },
    });

    if (!message) {
      throw new ForbiddenException('Message not found');
    }

    // Check if user is a member of the chat
    const membership = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: message.chatId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    if (deleteForEveryone) {
      // Only the sender can delete for everyone
      if (message.senderId !== userId) {
        throw new ForbiddenException(
          'You can only delete your own messages for everyone',
        );
      }

      // A deleted message shouldn't leave decryptable ciphertext sitting in
      // the database — the whole point of "delete for everyone" is that the
      // content is gone, not just hidden from the current UI.
      if (message.isEncrypted) {
        await this.prisma.messageCipher.deleteMany({
          where: { messageId },
        });
      }

      // Update message to show as deleted
      const updatedMessage = await this.prisma.message.update({
        where: { id: messageId },
        data: {
          content: null,
          isDeleted: true,
        },
        include: {
          sender: { include: { profile: true } },
          attachments: true,
        },
      });

      this.eventEmitter.emit('message.deleted', {
        ...MessagesMapper.toDto(updatedMessage),
        isDeleted: true,
        deleteForEveryone: true,
      });

      return { success: true, message: MessagesMapper.toDto(updatedMessage) };
    } else {
      // Delete for me - we'll track this in a separate way
      // For now, we return success without actually deleting (client handles locally)
      return { success: true };
    }
  }

  async editMessage(
    messageId: string,
    userId: string,
    newContent: string,
  ): Promise<{ success: boolean; message?: any }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { include: { profile: true } },
        attachments: true,
      },
    });

    if (!message) {
      throw new ForbiddenException('Message not found');
    }

    // Only the sender can edit their message
    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    // Only text messages can be edited
    if (message.type !== 'text') {
      throw new ForbiddenException('Only text messages can be edited');
    }

    // Check if message is already deleted
    if (message.isDeleted) {
      throw new ForbiddenException('Cannot edit a deleted message');
    }

    // Editing an encrypted message isn't supported yet — it would need the
    // same per-device re-encryption a fresh send does (see create()), which
    // isn't wired up here. Without this guard, `newContent` (plaintext, since
    // the client only encrypts for *new* sends) would get written straight
    // into `content` on a row still flagged isEncrypted, defeating E2EE for
    // that message.
    if (message.isEncrypted) {
      throw new BadRequestException(
        'Editing encrypted messages is not supported yet',
      );
    }

    const updatedMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: newContent,
        isEdited: true,
      },
      include: {
        sender: { include: { profile: true } },
        replyTo: {
          include: {
            sender: { include: { profile: true } },
          },
        },
        attachments: true,
      },
    });

    this.eventEmitter.emit(
      'message.edited',
      MessagesMapper.toDto(updatedMessage),
    );

    return { success: true, message: MessagesMapper.toDto(updatedMessage) };
  }

  // formatMessage removed — use MessagesMapper.toDto() instead

  private _removed(message: {
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
      profile: {
        displayName: string | null;
        avatarUrl: string | null;
      } | null;
    };
    replyTo?: {
      id: string;
      content: string | null;
      sender: {
        id: string;
        profile: {
          displayName: string | null;
        } | null;
      };
    } | null;
    attachments: Array<{
      id: string;
      fileName: string;
      fileType: string;
      fileSize: bigint;
      url: string;
    }>;
  }) {
    return {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      content: message.content,
      type: message.type,
      status: message.status,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: {
        id: message.sender.id,
        displayName:
          message.sender.profile?.displayName ||
          message.sender.phone ||
          message.sender.email ||
          'Unknown',
        avatarUrl: message.sender.profile?.avatarUrl,
      },
      replyTo: message.replyTo
        ? {
            id: message.replyTo.id,
            content: message.replyTo.content,
            senderName:
              message.replyTo.sender.profile?.displayName || 'Unknown',
          }
        : null,
      attachments: message.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        fileType: a.fileType,
        fileSize: Number(a.fileSize),
        url: a.url,
      })),
      isDeleted: message.isDeleted ?? false,
      isEdited: message.isEdited ?? false,
    };
  }
}
