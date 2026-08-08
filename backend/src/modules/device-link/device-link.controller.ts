import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { DeviceLinkService } from './device-link.service';
import { PushLinkPayloadDto } from './dto';
import { CurrentUser } from '../../common/decorators';
import type { User } from '@prisma/client';

// JwtAuthGuard is already applied globally (see app.module.ts's APP_GUARD).
// The real-time path is the DEVICE_HISTORY_CHUNK/DEVICE_LINK_APPROVED
// socket push (see chat.gateway.ts) — this REST controller exists for the
// same reason sender-key-distributions' does: a fallback for
// headless/background/offline-at-the-time contexts.
@ApiTags('Device Link')
@ApiBearerAuth('access-token')
@Controller('devices')
export class DeviceLinkController {
  constructor(private readonly deviceLinkService: DeviceLinkService) {}

  private requireCallerDeviceId(deviceId?: string): string {
    if (!deviceId) throw new NotFoundException('x-device-id header is required');
    return deviceId;
  }

  @Post(':deviceId/approve')
  @ApiParam({ name: 'deviceId', description: 'The pending device being approved' })
  @ApiOperation({
    summary:
      "Approve a pending device link — caller's own device (x-device-id) must itself already be approved",
  })
  @ApiResponse({ status: 201, description: 'Device approved' })
  async approve(
    @CurrentUser() user: User,
    @Param('deviceId') targetDeviceId: string,
    @Headers('x-device-id') callerDeviceId?: string,
  ) {
    return this.deviceLinkService.approve(
      user.id,
      this.requireCallerDeviceId(callerDeviceId),
      targetDeviceId,
    );
  }

  @Post(':deviceId/decline')
  @ApiParam({ name: 'deviceId', description: 'The pending device being declined' })
  @ApiOperation({ summary: 'Decline a pending device link — deletes it outright' })
  async decline(
    @CurrentUser() user: User,
    @Param('deviceId') targetDeviceId: string,
    @Headers('x-device-id') callerDeviceId?: string,
  ) {
    return this.deviceLinkService.decline(
      user.id,
      this.requireCallerDeviceId(callerDeviceId),
      targetDeviceId,
    );
  }

  @Post('link-payloads')
  @ApiOperation({
    summary:
      "Push one chat's re-encrypted history batch to a newly-approved device (pairwise-encrypted by the caller)",
  })
  @ApiResponse({ status: 201, description: 'Payload stored (and relayed in real time if the target socket is up)' })
  async pushPayload(
    @CurrentUser() user: User,
    @Body() dto: PushLinkPayloadDto,
    @Headers('x-device-id') callerDeviceId?: string,
  ) {
    return this.deviceLinkService.pushPayload(
      user.id,
      this.requireCallerDeviceId(callerDeviceId),
      dto,
    );
  }

  @Get('link-payloads/pending')
  @ApiOperation({
    summary:
      'Every pending history payload addressed to the caller device — single-consume, call on reconnect/first approval',
  })
  async getPendingPayloads(
    @CurrentUser() user: User,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.deviceLinkService.getPendingPayloads(
      user.id,
      this.requireCallerDeviceId(deviceId),
    );
  }
}
