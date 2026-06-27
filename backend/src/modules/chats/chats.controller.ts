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
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
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

@ApiTags('Chats')
@ApiBearerAuth('access-token')
@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  // ============================================
  // Get Chats
  // ============================================

  @Get()
  @ApiOperation({ summary: 'Get all chats for the current user' })
  @ApiResponse({
    status: 200,
    description: 'List of chats with latest message & unread count',
  })
  async getChats(@CurrentUser() user: User) {
    return this.chatsService.getUserChats(user.id);
  }

  @Get('calls/history')
  @ApiOperation({ summary: 'Get call history' })
  @ApiQuery({
    name: 'chatId',
    required: false,
    description: 'Filter by chat ID',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Pagination cursor (message ID)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of call messages' })
  async getCallHistory(
    @CurrentUser() user: User,
    @Query('chatId') chatId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.chatsService.getCallHistory(user.id, chatId, cursor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single chat by ID' })
  @ApiParam({ name: 'id', description: 'Chat ID' })
  @ApiResponse({ status: 200, description: 'Chat details with members' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async getChat(@Param('id') id: string, @CurrentUser() user: User) {
    return this.chatsService.getChatById(id, user.id);
  }

  // ============================================
  // Create Chats
  // ============================================

  @Post('direct')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start or get a direct (1-to-1) chat' })
  @ApiResponse({
    status: 201,
    description: 'Direct chat created or existing chat returned',
  })
  async createDirectChat(
    @Body() dto: CreateDirectChatDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.createDirectChat(user.id, dto);
  }

  @Post('group')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new group chat' })
  @ApiResponse({ status: 201, description: 'Group chat created' })
  async createGroup(@Body() dto: CreateGroupDto, @CurrentUser() user: User) {
    return this.chatsService.createGroup(user.id, dto);
  }

  // ============================================
  // Update Group
  // ============================================

  @Put(':id')
  @ApiOperation({ summary: 'Update group name or avatar' })
  @ApiParam({ name: 'id', description: 'Chat ID' })
  @ApiResponse({ status: 200, description: 'Group updated' })
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
  @ApiOperation({ summary: 'Add a member to a group chat' })
  @ApiParam({ name: 'id', description: 'Chat ID' })
  @ApiResponse({ status: 201, description: 'Member added' })
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.addMember(id, user.id, dto);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a member from a group chat' })
  @ApiParam({ name: 'id', description: 'Chat ID' })
  @ApiParam({ name: 'userId', description: 'User ID to remove' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') memberId: string,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.removeMember(id, user.id, memberId);
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a group chat' })
  @ApiParam({ name: 'id', description: 'Chat ID' })
  @ApiResponse({ status: 200, description: 'Left the group' })
  async leaveGroup(@Param('id') id: string, @CurrentUser() user: User) {
    return this.chatsService.leaveGroup(id, user.id);
  }

  // ============================================
  // Read Status
  // ============================================

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all messages in a chat as read' })
  @ApiParam({ name: 'id', description: 'Chat ID' })
  @ApiResponse({ status: 200, description: 'Messages marked as read' })
  async markAsRead(@Param('id') id: string, @CurrentUser() user: User) {
    await this.chatsService.updateLastRead(id, user.id);
    return { success: true };
  }
}
