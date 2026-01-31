import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChatsService } from './chats.service';
import {
  CreateDirectChatDto,
  CreateGroupDto,
  UpdateGroupDto,
  AddMemberDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import type { User } from '@prisma/client';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  // ============================================
  // Get Chats
  // ============================================

  @Get()
  async getChats(@CurrentUser() user: User) {
    return this.chatsService.getUserChats(user.id);
  }

  @Get(':id')
  async getChat(@Param('id') id: string, @CurrentUser() user: User) {
    return this.chatsService.getChatById(id, user.id);
  }

  // ============================================
  // Create Chats
  // ============================================

  @Post('direct')
  @HttpCode(HttpStatus.CREATED)
  async createDirectChat(
    @Body() dto: CreateDirectChatDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.createDirectChat(user.id, dto);
  }

  @Post('group')
  @HttpCode(HttpStatus.CREATED)
  async createGroup(@Body() dto: CreateGroupDto, @CurrentUser() user: User) {
    return this.chatsService.createGroup(user.id, dto);
  }

  // ============================================
  // Update Group
  // ============================================

  @Put(':id')
  async updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.updateGroup(id, user.id, dto);
  }

  // ============================================
  // Member Management
  // ============================================

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.addMember(id, user.id, dto);
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') memberId: string,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.removeMember(id, user.id, memberId);
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  async leaveGroup(@Param('id') id: string, @CurrentUser() user: User) {
    return this.chatsService.leaveGroup(id, user.id);
  }

  // ============================================
  // Read Status
  // ============================================

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Param('id') id: string, @CurrentUser() user: User) {
    await this.chatsService.updateLastRead(id, user.id);
    return { success: true };
  }
}
