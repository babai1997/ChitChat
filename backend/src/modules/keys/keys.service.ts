import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDeviceDto, ReplenishPreKeysDto } from './dto';

/**
 * KeysService — Phase 0 of the E2EE plan (see E2EE_PLAN.md). Owns device
 * identity registration and X3DH key-bundle distribution. It only ever
 * stores and serves PUBLIC key material and opaque ciphertext; it never
 * sees a private key or plaintext message content.
 */
// How often a given (requester, target) pair is allowed to actually consume
// one of the target's one-time prekeys. A bundle is only ever NEEDED to
// start a brand-new session — legitimate clients already cache it
// client-side (see frontend/mobile's e2eeSessions.ts), but a client can't be
// trusted to self-limit, since anyone can call this endpoint directly. This
// is a real vulnerability without a server-side floor: any authenticated
// user can otherwise hammer a stranger's bundle endpoint and burn through
// their entire one-time-prekey pool — a denial-of-service against that
// victim's forward secrecy, not just an efficiency concern. The identity/
// signed-prekey portion of the response is still returned on every call —
// it isn't a scarce resource — only new one-time-prekey consumption is capped.
const OTPK_CONSUME_COOLDOWN_MS = 60_000;

@Injectable()
export class KeysService {
  // In-memory and per-instance, matching this app's existing single-instance
  // deployment (see SocketRegistryService) — revisit alongside that if this
  // ever runs as more than one backend process.
  private readonly lastOtpkConsumedAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    const existing = await this.prisma.device.findUnique({
      where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
      select: { id: true },
    });

    let device: { id: string; deviceId: string };
    let isNewPendingDevice = false;

    if (existing) {
      // Re-registration of an already-known device (token refresh, app
      // relaunch) — never touch `approved` here, only a brand-new Device
      // row needs the bootstrap decision below.
      device = await this.prisma.device.update({
        where: { id: existing.id },
        data: {
          identityKey: dto.identityKey,
          identityDhKey: dto.identityDhKey,
          registrationId: dto.registrationId,
          signedPreKeyId: dto.signedPreKeyId,
          signedPreKeyPub: dto.signedPreKeyPub,
          signedPreKeySig: dto.signedPreKeySig,
          platform: dto.platform,
          revoked: false,
          lastActiveAt: new Date(),
        },
        select: { id: true, deviceId: true },
      });
    } else {
      // Bootstrap rule (Phase 4a, see E2EE_PLAN.md): a user's very first
      // active device has nothing to approve against, so it's auto
      // -approved. Any subsequent device is pending until an existing
      // approved device vouches for it — UNLESS every existing device
      // happens to be unapproved/revoked too, in which case gating this
      // one would permanently lock the user out of ever approving anything.
      const hasApprovedActiveDevice = await this.prisma.device.findFirst({
        where: { userId, approved: true, revoked: false },
        select: { id: true },
      });
      const approved = !hasApprovedActiveDevice;

      device = await this.prisma.device.create({
        data: {
          userId,
          deviceId: dto.deviceId,
          identityKey: dto.identityKey,
          identityDhKey: dto.identityDhKey,
          registrationId: dto.registrationId,
          signedPreKeyId: dto.signedPreKeyId,
          signedPreKeyPub: dto.signedPreKeyPub,
          signedPreKeySig: dto.signedPreKeySig,
          platform: dto.platform,
          approved,
        },
        select: { id: true, deviceId: true },
      });
      isNewPendingDevice = !approved;
    }

    if (dto.oneTimePreKeys.length > 0) {
      await this.prisma.oneTimePreKey.createMany({
        data: dto.oneTimePreKeys.map((k) => ({
          deviceId: device.id,
          keyId: k.keyId,
          publicKey: k.publicKey,
        })),
        skipDuplicates: true,
      });
    }

    if (isNewPendingDevice) {
      this.eventEmitter.emit('device.link-requested', {
        userId,
        newDeviceId: device.deviceId,
        platform: dto.platform,
      });
    }

    return { deviceId: device.deviceId };
  }

  /**
   * X3DH bundle fetch — called by a sender starting a session with `userId`
   * for the first time. Returns one bundle per active device, each with one
   * freshly-consumed one-time prekey (if the pool isn't exhausted yet, and
   * this (requester, target) pair hasn't already consumed one within the
   * cooldown window — see OTPK_CONSUME_COOLDOWN_MS above). X3DH degrades
   * gracefully without one, at a small forward-secrecy cost for that single
   * handshake.
   *
   * @param requesterId Who is asking — required to scope the consumption
   * cooldown per-caller, not globally (a busy but legitimate contact
   * shouldn't be rate-limited by a totally unrelated caller's traffic).
   */
  async getBundlesForUser(userId: string, requesterId: string) {
    const devices = await this.prisma.device.findMany({
      where: { userId, revoked: false },
    });

    const cooldownKey = `${requesterId}:${userId}`;
    const lastConsumedAt = this.lastOtpkConsumedAt.get(cooldownKey);
    const withinCooldown =
      lastConsumedAt !== undefined &&
      Date.now() - lastConsumedAt < OTPK_CONSUME_COOLDOWN_MS;

    return Promise.all(
      devices.map(async (device) => {
        const otpk = withinCooldown
          ? null
          : await this.prisma.oneTimePreKey.findFirst({
              where: { deviceId: device.id, used: false },
              orderBy: { keyId: 'asc' },
            });

        if (otpk) {
          await this.prisma.oneTimePreKey.update({
            where: { id: otpk.id },
            data: { used: true },
          });
          this.lastOtpkConsumedAt.set(cooldownKey, Date.now());
        }

        return {
          deviceId: device.deviceId,
          identityKey: device.identityKey,
          identityDhKey: device.identityDhKey,
          registrationId: device.registrationId,
          signedPreKeyId: device.signedPreKeyId,
          signedPreKeyPub: device.signedPreKeyPub,
          signedPreKeySig: device.signedPreKeySig,
          oneTimePreKeys: otpk ? [{ keyId: otpk.keyId, publicKey: otpk.publicKey }] : [],
        };
      }),
    );
  }

  async replenishPreKeys(userId: string, dto: ReplenishPreKeysDto) {
    const device = await this.prisma.device.findUnique({
      where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
    });
    if (!device) throw new NotFoundException('Device not found');

    if (dto.oneTimePreKeys.length === 0) {
      throw new BadRequestException('oneTimePreKeys must not be empty');
    }

    await this.prisma.oneTimePreKey.createMany({
      data: dto.oneTimePreKeys.map((k) => ({
        deviceId: device.id,
        keyId: k.keyId,
        publicKey: k.publicKey,
      })),
      skipDuplicates: true,
    });

    return { success: true };
  }

  async listMyDevices(userId: string) {
    const devices = await this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
    });
    return devices.map((d) => ({
      deviceId: d.deviceId,
      revoked: d.revoked,
      approved: d.approved,
      platform: d.platform,
      createdAt: d.createdAt,
      lastActiveAt: d.lastActiveAt,
    }));
  }

  async revokeDevice(userId: string, deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });
    if (!device) throw new NotFoundException('Device not found');

    // Soft revoke: excluded from future X3DH bundles and socket delivery,
    // but existing MessageCipher rows addressed to it are left alone — a
    // revoked device just can no longer receive new ciphertext.
    await this.prisma.device.update({
      where: { id: device.id },
      data: { revoked: true },
    });
    return { success: true };
  }

  /** Internal helper for other modules (Phase 1's message fan-out) — active, non-revoked device ids for a user. */
  async getActiveDeviceIds(userId: string): Promise<string[]> {
    const devices = await this.prisma.device.findMany({
      where: { userId, revoked: false },
      select: { id: true },
    });
    return devices.map((d) => d.id);
  }
}
