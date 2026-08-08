import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertBackupDto } from './dto';

/**
 * BackupService — Phase 4b of the E2EE plan (see E2EE_PLAN.md). The
 * fallback for when no other device is online to sync from (Phase 4a's
 * scope): a client-side, passphrase-encrypted snapshot of recent history.
 * This service never sees a passphrase, a derived key, or plaintext — only
 * an opaque ciphertext blob plus the (non-secret) salt/nonce needed to
 * re-derive the same key at restore time. One row per user; a re-backup
 * overwrites it rather than accumulating history, same shape as
 * DeviceLinkPayload/SenderKeyDistribution.
 */
@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(userId: string, dto: UpsertBackupDto) {
    await this.prisma.backup.upsert({
      where: { userId },
      update: { salt: dto.salt, nonce: dto.nonce, ciphertext: dto.ciphertext },
      create: { userId, salt: dto.salt, nonce: dto.nonce, ciphertext: dto.ciphertext },
    });
    return { success: true };
  }

  async get(userId: string) {
    const backup = await this.prisma.backup.findUnique({ where: { userId } });
    if (!backup) return null;
    return {
      salt: backup.salt,
      nonce: backup.nonce,
      ciphertext: backup.ciphertext,
      updatedAt: backup.updatedAt,
    };
  }

  async delete(userId: string) {
    await this.prisma.backup.deleteMany({ where: { userId } });
    return { success: true };
  }
}
