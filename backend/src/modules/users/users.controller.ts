import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import type { User } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  async searchUsers(
    @Query('q') query: string,
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
  ) {
    const users = await this.usersService.searchUsers(
      query || '',
      user.id,
      limit ? parseInt(limit, 10) : 20,
    );

    return users.map((u) => ({
      id: u.id,
      phone: u.phone,
      email: u.email,
      profile: u.profile
        ? {
            displayName: u.profile.displayName,
            avatarUrl: u.profile.avatarUrl,
            about: u.profile.about,
            isOnline: u.profile.isOnline,
          }
        : null,
    }));
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    const user = await this.usersService.findById(id);

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      lastSeen: user.lastSeen,
      profile: user.profile
        ? {
            displayName: user.profile.displayName,
            avatarUrl: user.profile.avatarUrl,
            about: user.profile.about,
            isOnline: user.profile.isOnline,
          }
        : null,
    };
  }
}
