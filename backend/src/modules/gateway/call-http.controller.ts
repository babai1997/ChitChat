import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CallHandler } from './handlers/call.handler';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { RejectCallDto } from './dto';
import type { User, Profile } from '@prisma/client';

/**
 * HTTP counterpart to the socket-driven call events — used when an action
 * needs to work from a headless background context with no live socket
 * connection (e.g. tapping "Decline" on the incoming-call notification while
 * the app is backgrounded/killed). See CALL_NOTIFICATIONS_PLAN.md.
 */
@ApiTags('Calls')
@ApiBearerAuth('access-token')
@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallHttpController {
  constructor(private readonly callHandler: CallHandler) {}

  @Post('reject')
  @ApiOperation({ summary: 'Reject an incoming call (e.g. from a push notification action)' })
  @ApiResponse({ status: 201, description: 'Call rejected' })
  async reject(
    @CurrentUser() user: User & { profile: Profile | null },
    @Body() dto: RejectCallDto,
  ) {
    await this.callHandler.rejectCall(
      dto.chatId,
      dto.callerId,
      user.id,
      user.profile?.displayName || 'Unknown',
    );
    return { success: true };
  }
}
