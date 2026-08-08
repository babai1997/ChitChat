import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatsService } from '../chats/chats.service';
import { DistributeSenderKeyDto } from './dto';

/**
 * SenderKeysService — Phase 2 of the E2EE plan (see E2EE_PLAN.md). Relays
 * SenderKeyDistributionMessages: the pairwise-encrypted "here's my group
 * chain key" handshake that lets Sender Keys give group chats one
 * encryption per message instead of Phase 1's one-per-recipient-device.
 *
 * This service NEVER sees a chain key in the clear — `ciphertext` here is
 * already encrypted client-side via the sender's existing Phase-1 Double
 * Ratchet session with each specific recipient device (see
 * frontend/mobile's e2eeSessions.ts). It only stores and relays opaque
 * blobs, same trust boundary as MessageCipher for 1:1 chats.
 */
@Injectable()
export class SenderKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatsService: ChatsService,
  ) {}

  /**
   * Upserts one distribution row per resolved target device — a rekey
   * simply overwrites the previous epoch's row for that (chat, sender
   * device, recipient device) triple rather than accumulating history.
   * Returns the resolved targets (with recipientUserId/deviceId as the
   * caller passed them) so the gateway handler can push them over the
   * socket in real time without a second round trip.
   */
  async distribute(
    chatId: string,
    senderUserId: string,
    dto: DistributeSenderKeyDto,
  ): Promise<
    { recipientUserId: string; recipientDeviceId: string; ciphertext: string }[]
  > {
    const memberIds = await this.chatsService.getChatMemberIds(chatId);
    if (!memberIds.includes(senderUserId)) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    const senderDevice = await this.prisma.device.findUnique({
      where: {
        userId_deviceId: { userId: senderUserId, deviceId: dto.senderDeviceId },
      },
      select: { id: true },
    });
    if (!senderDevice) {
      throw new NotFoundException('Sending device not registered');
    }

    const recipientDevices = await this.prisma.device.findMany({
      where: {
        revoked: false,
        OR: dto.targets.map((t) => ({
          userId: t.recipientUserId,
          deviceId: t.recipientDeviceId,
        })),
      },
      select: { id: true, userId: true, deviceId: true },
    });
    const byCompoundKey = new Map(
      recipientDevices.map((d) => [`${d.userId}:${d.deviceId}`, d.id]),
    );

    const resolved: {
      recipientUserId: string;
      recipientDeviceId: string;
      ciphertext: string;
      internalRecipientDeviceId: string;
    }[] = [];
    for (const target of dto.targets) {
      const internalId = byCompoundKey.get(
        `${target.recipientUserId}:${target.recipientDeviceId}`,
      );
      if (!internalId) continue; // target device revoked/unregistered — skip, don't fail the whole batch
      resolved.push({
        recipientUserId: target.recipientUserId,
        recipientDeviceId: target.recipientDeviceId,
        ciphertext: target.ciphertext,
        internalRecipientDeviceId: internalId,
      });
    }

    await Promise.all(
      resolved.map((r) =>
        this.prisma.senderKeyDistribution.upsert({
          where: {
            chatId_senderDeviceId_recipientDeviceId: {
              chatId,
              senderDeviceId: senderDevice.id,
              recipientDeviceId: r.internalRecipientDeviceId,
            },
          },
          update: { ciphertext: r.ciphertext },
          create: {
            chatId,
            senderDeviceId: senderDevice.id,
            recipientDeviceId: r.internalRecipientDeviceId,
            ciphertext: r.ciphertext,
          },
        }),
      ),
    );

    return resolved.map(({ recipientUserId, recipientDeviceId, ciphertext }) => ({
      recipientUserId,
      recipientDeviceId,
      ciphertext,
    }));
  }

  /**
   * Every distribution addressed to this device across every chat — used at
   * reconnect / first need, so a device that missed the real-time push (was
   * offline, or is brand new to a chat) still gets caught up. Deliberately
   * not scoped to one chat: a device can be behind on several groups at
   * once, and one fetch is cheaper than one round trip per chat.
   */
  async getPendingForDevice(userId: string, deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
      select: { id: true },
    });
    if (!device) throw new NotFoundException('Device not registered');

    const distributions = await this.prisma.senderKeyDistribution.findMany({
      where: { recipientDeviceId: device.id },
      include: { senderDevice: { select: { userId: true, deviceId: true } } },
    });

    return distributions.map((d) => ({
      chatId: d.chatId,
      senderUserId: d.senderDevice.userId,
      senderDeviceId: d.senderDevice.deviceId,
      ciphertext: d.ciphertext,
      updatedAt: d.updatedAt,
    }));
  }
}
