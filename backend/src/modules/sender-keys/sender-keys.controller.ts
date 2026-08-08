import { Body, Controller, Get, Headers, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SenderKeysService } from './sender-keys.service';
import { DistributeSenderKeyDto } from './dto';
import { CurrentUser } from '../../common/decorators';
import type { User } from '@prisma/client';

// JwtAuthGuard is already applied globally (see app.module.ts's APP_GUARD).
// The real-time path is the WS event handled in sender-key.handler.ts (see
// GatewayModule) — this REST controller exists for the same reason
// messages.controller.ts's POST does: a fallback for headless/background
// contexts with no live socket connection.
@ApiTags('Sender Keys')
@ApiBearerAuth('access-token')
@Controller()
export class SenderKeysController {
  constructor(private readonly senderKeysService: SenderKeysService) {}

  @Post('chats/:chatId/sender-key-distributions')
  @ApiOperation({
    summary:
      "Distribute this device's group Sender Key chain to other members' devices (pairwise-encrypted per target)",
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  @ApiResponse({ status: 201, description: 'Distributions stored (and relayed in real time if the sockets are up)' })
  async distribute(
    @Param('chatId') chatId: string,
    @Body() dto: DistributeSenderKeyDto,
    @CurrentUser() user: User,
  ) {
    const resolved = await this.senderKeysService.distribute(chatId, user.id, dto);
    return { success: true, delivered: resolved.length };
  }

  @Get('sender-key-distributions')
  @ApiOperation({
    summary:
      "Every pending Sender Key distribution addressed to the caller's device, across all chats — call on reconnect / first need",
  })
  async getPending(
    @CurrentUser() user: User,
    @Headers('x-device-id') deviceId?: string,
  ) {
    if (!deviceId) {
      throw new NotFoundException('x-device-id header is required');
    }
    return this.senderKeysService.getPendingForDevice(user.id, deviceId);
  }
}
