import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { KeysService } from './keys.service';
import { CurrentUser } from '../../common/decorators';
import { RegisterDeviceDto, ReplenishPreKeysDto } from './dto';
import type { User } from '@prisma/client';

// JwtAuthGuard is already applied globally (see app.module.ts's APP_GUARD).
@ApiTags('Keys')
@ApiBearerAuth('access-token')
@Controller()
export class KeysController {
  constructor(private readonly keysService: KeysService) {}

  @Post('devices/register')
  @ApiOperation({
    summary:
      "Register (or refresh) this device's E2EE identity — first login per device",
  })
  @ApiResponse({ status: 201, description: 'Device registered' })
  async registerDevice(
    @CurrentUser() user: User,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.keysService.registerDevice(user.id, dto);
  }

  @Get('devices/:userId/bundle')
  // Tighter than the app-wide default (100/60s across all endpoints) —
  // this specific endpoint burns one of the TARGET's one-time prekeys per
  // call (see keys.service.ts), so it needs its own, stricter cap rather
  // than sharing budget with everything else the caller does.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'X3DH key bundle for every active device of a user — call before messaging them for the first time',
  })
  async getBundle(
    @CurrentUser() requester: User,
    @Param('userId') userId: string,
  ) {
    return this.keysService.getBundlesForUser(userId, requester.id);
  }

  @Post('devices/prekeys/replenish')
  @ApiOperation({ summary: "Top up a device's one-time prekey pool" })
  async replenishPreKeys(
    @CurrentUser() user: User,
    @Body() dto: ReplenishPreKeysDto,
  ) {
    return this.keysService.replenishPreKeys(user.id, dto);
  }

  @Get('devices/mine')
  @ApiOperation({ summary: "List this account's registered devices" })
  async listMyDevices(@CurrentUser() user: User) {
    return this.keysService.listMyDevices(user.id);
  }

  @Delete('devices/:deviceId')
  @ApiOperation({
    summary: 'Revoke a device — it stops receiving new E2EE messages',
  })
  async revokeDevice(
    @CurrentUser() user: User,
    @Param('deviceId') deviceId: string,
  ) {
    return this.keysService.revokeDevice(user.id, deviceId);
  }
}
