import { Body, Controller, Delete, Get, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BackupService } from './backup.service';
import { UpsertBackupDto } from './dto';
import { CurrentUser } from '../../common/decorators';
import type { User } from '@prisma/client';

// JwtAuthGuard is already applied globally (see app.module.ts's APP_GUARD).
// Unlike device-link, there is no cross-device concept here at all — this
// is scoped entirely to the caller's own account.
@ApiTags('Backup')
@ApiBearerAuth('access-token')
@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Put()
  @ApiOperation({ summary: 'Create or overwrite this account\'s passphrase-encrypted backup' })
  @ApiResponse({ status: 200, description: 'Backup stored' })
  async upsert(@CurrentUser() user: User, @Body() dto: UpsertBackupDto) {
    return this.backupService.upsert(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "This account's backup, or null if none exists" })
  async get(@CurrentUser() user: User) {
    return this.backupService.get(user.id);
  }

  @Delete()
  @ApiOperation({ summary: "Delete this account's backup" })
  async delete(@CurrentUser() user: User) {
    return this.backupService.delete(user.id);
  }
}
