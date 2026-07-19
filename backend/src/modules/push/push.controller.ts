import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PushService } from './push.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { RegisterPushTokenDto, UnregisterPushTokenDto } from './dto';
import type { User } from '@prisma/client';

@ApiTags('Push')
@ApiBearerAuth('access-token')
@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register (or refresh) this device\'s push token for call wake-up notifications',
  })
  @ApiResponse({ status: 201, description: 'Token registered' })
  async register(@CurrentUser() user: User, @Body() dto: RegisterPushTokenDto) {
    await this.pushService.registerToken(user.id, dto);
    return { success: true };
  }

  @Post('unregister')
  @ApiOperation({ summary: 'Remove this device\'s push token (e.g. on logout)' })
  @ApiResponse({ status: 201, description: 'Token removed' })
  async unregister(@CurrentUser() user: User, @Body() dto: UnregisterPushTokenDto) {
    await this.pushService.unregisterToken(user.id, dto.deviceId);
    return { success: true };
  }
}
