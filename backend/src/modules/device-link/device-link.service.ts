import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PushLinkPayloadDto } from './dto';

/**
 * DeviceLinkService — Phase 4a of the E2EE plan (see E2EE_PLAN.md). Relays
 * the one-time history handoff from an already-approved device to a
 * brand-new device of the same user: approval bookkeeping, plus persisting
 * and serving the opaque per-chat ciphertext batches (mirrors
 * SenderKeysService's "one device pushes an encrypted blob addressed to
 * another specific device" shape exactly). Like SenderKeysService, this
 * never sees plaintext — `ciphertext` here is already encrypted
 * client-side via the approving device's existing Phase-1 Double Ratchet
 * session with the new device.
 */
@Injectable()
export class DeviceLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Verifies `callerDeviceId` is a real, approved, non-revoked device belonging to `userId`. */
  private async requireApprovedCallerDevice(userId: string, callerDeviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { userId_deviceId: { userId, deviceId: callerDeviceId } },
      select: { id: true, approved: true, revoked: true },
    });
    if (!device || device.revoked) {
      throw new NotFoundException('Calling device not registered');
    }
    if (!device.approved) {
      throw new ForbiddenException('Calling device is itself not yet approved');
    }
    return device;
  }

  async approve(userId: string, callerDeviceId: string, targetDeviceId: string) {
    await this.requireApprovedCallerDevice(userId, callerDeviceId);

    const target = await this.prisma.device.findUnique({
      where: { userId_deviceId: { userId, deviceId: targetDeviceId } },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Target device not found');

    await this.prisma.device.update({
      where: { id: target.id },
      data: { approved: true },
    });

    this.eventEmitter.emit('device.link-approved', {
      userId,
      deviceId: targetDeviceId,
    });

    return { success: true };
  }

  async decline(userId: string, callerDeviceId: string, targetDeviceId: string) {
    await this.requireApprovedCallerDevice(userId, callerDeviceId);

    const target = await this.prisma.device.findUnique({
      where: { userId_deviceId: { userId, deviceId: targetDeviceId } },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Target device not found');

    // A declined device never had real access to begin with (approved was
    // false the whole time) — delete outright rather than soft-revoke, so
    // it doesn't linger in the Linked Devices list forever.
    await this.prisma.device.delete({ where: { id: target.id } });

    this.eventEmitter.emit('device.link-declined', {
      userId,
      deviceId: targetDeviceId,
    });

    return { success: true };
  }

  /**
   * Upserts one payload row per (target device, chat) — a re-push (e.g. the
   * approving device retries or re-syncs) overwrites in place rather than
   * accumulating history, same as SenderKeyDistribution. Returns the
   * resolved recipient's userId so the caller (gateway handler) can push a
   * real-time notification without a second round trip.
   */
  async pushPayload(userId: string, approvingDeviceId: string, dto: PushLinkPayloadDto) {
    const approvingDevice = await this.requireApprovedCallerDevice(userId, approvingDeviceId);

    const newDevice = await this.prisma.device.findUnique({
      where: { userId_deviceId: { userId, deviceId: dto.newDeviceId } },
      select: { id: true },
    });
    if (!newDevice) throw new NotFoundException('Target device not found');

    await this.prisma.deviceLinkPayload.upsert({
      where: {
        newDeviceId_chatId: { newDeviceId: newDevice.id, chatId: dto.chatId },
      },
      update: { ciphertext: dto.ciphertext, approvingDeviceId: approvingDevice.id },
      create: {
        approvingDeviceId: approvingDevice.id,
        newDeviceId: newDevice.id,
        chatId: dto.chatId,
        ciphertext: dto.ciphertext,
      },
    });

    // Persisted regardless (see getPendingPayloads) — this is purely a
    // best-effort real-time accelerator for a target that happens to
    // already be online waiting.
    this.eventEmitter.emit('device.history-chunk', {
      userId,
      newDeviceId: dto.newDeviceId,
      chatId: dto.chatId,
      ciphertext: dto.ciphertext,
      approvingDeviceId,
    });

    return { success: true };
  }

  /**
   * Every pending history payload addressed to this device — single
   * -consume: deleted immediately after being read, since a payload is a
   * one-time handoff, not an ongoing decryptable-forever row (unlike
   * MessageCipher). Safe to call repeatedly; a device with nothing pending
   * just gets an empty array back.
   */
  async getPendingPayloads(userId: string, newDeviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { userId_deviceId: { userId, deviceId: newDeviceId } },
      select: { id: true },
    });
    if (!device) throw new NotFoundException('Device not registered');

    const payloads = await this.prisma.deviceLinkPayload.findMany({
      where: { newDeviceId: device.id },
      include: { approvingDevice: { select: { deviceId: true } } },
    });

    if (payloads.length > 0) {
      await this.prisma.deviceLinkPayload.deleteMany({
        where: { id: { in: payloads.map((p) => p.id) } },
      });
    }

    return payloads.map((p) => ({
      chatId: p.chatId,
      ciphertext: p.ciphertext,
      approvingDeviceId: p.approvingDevice.deviceId,
    }));
  }
}
