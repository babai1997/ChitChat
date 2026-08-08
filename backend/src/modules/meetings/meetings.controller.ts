import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto';
import { CurrentUser } from '../../common/decorators';
import type { Profile, User } from '@prisma/client';

// JwtAuthGuard is already applied globally (see app.module.ts's APP_GUARD) —
// joining a meeting requires a ChitChat account (no anonymous guest join),
// per the product decision this feature was scoped against.
@ApiTags('Meetings')
@ApiBearerAuth('access-token')
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new shareable meeting room' })
  @ApiResponse({ status: 201, description: 'Meeting created' })
  async create(
    @CurrentUser() user: User & { profile: Profile | null },
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meetingsService.create(user.id, user.profile?.displayName ?? 'Someone', dto);
  }

  // NOTE: literal-path routes (personal, mine, by-chat/:chatId) MUST be
  // declared before the generic GET ':slug' route below — Nest/Express
  // matches routes in declaration order within a controller, so ':slug'
  // would otherwise swallow these as if "personal"/"mine" were slugs.
  @Get('personal')
  @ApiOperation({ summary: "Get-or-create the caller's persistent Personal Meeting Room" })
  async getPersonalRoom(@CurrentUser() user: User & { profile: Profile | null }) {
    return this.meetingsService.getPersonalRoom(user.id, user.profile?.displayName ?? 'Someone');
  }

  @Get('mine')
  @ApiOperation({ summary: 'Every meeting the caller hosts, for the "My Meetings" list' })
  async listMine(@CurrentUser() user: User) {
    return this.meetingsService.listMine(user.id);
  }

  @Get('by-chat/:chatId')
  @ApiParam({ name: 'chatId' })
  @ApiOperation({ summary: "Resolve a chat's meeting link — any current member may fetch it" })
  async getByChatId(@CurrentUser() user: User, @Param('chatId') chatId: string) {
    return this.meetingsService.getByChatId(chatId, user.id);
  }

  @Get(':slug')
  @ApiParam({ name: 'slug' })
  @ApiOperation({ summary: 'Look up a meeting by its shareable slug — does not require membership' })
  async getBySlug(@Param('slug') slug: string) {
    return this.meetingsService.getBySlug(slug);
  }

  @Post(':slug/join')
  @ApiParam({ name: 'slug' })
  @ApiOperation({ summary: 'Join a meeting via its slug — grants ChatMember membership, idempotent' })
  async join(@CurrentUser() user: User, @Param('slug') slug: string) {
    return this.meetingsService.join(slug, user.id);
  }

  @Delete(':slug')
  @ApiParam({ name: 'slug' })
  @ApiOperation({ summary: 'Revoke a meeting link — host-only, does not delete the chat/history' })
  async revoke(@CurrentUser() user: User, @Param('slug') slug: string) {
    return this.meetingsService.revoke(slug, user.id);
  }
}
