import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { CreateMessageDto, MessageQueryDto, GalleryQueryDto } from './dto';
import { CurrentUser } from '../../common/decorators';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import type { User } from '@prisma/client';

// JwtAuthGuard is already applied globally (see app.module.ts's APP_GUARD) —
// it does NOT need @UseGuards here too. It used to be applied both ways,
// which silently ran the guard (and its DB-querying JwtStrategy.validate)
// TWICE on every single request to this controller.
@ApiTags('Messages')
@ApiBearerAuth('access-token')
@Controller('chats/:chatId/messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated messages for a chat' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  @ApiResponse({
    status: 200,
    description: 'Paginated message list with sender profiles',
  })
  async getMessages(
    @Param('chatId') chatId: string,
    @Query() query: MessageQueryDto,
    @CurrentUser() user: User,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.messagesService.getMessages(chatId, user.id, query, deviceId);
  }

  @Get('gallery')
  @ApiOperation({ summary: 'Get every message of the given type(s) across the whole chat — powers the "All Media"/"Docs" tabs' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  async getGallery(
    @Param('chatId') chatId: string,
    @Query() query: GalleryQueryDto,
    @CurrentUser() user: User,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.messagesService.getGallery(
      chatId,
      user.id,
      query.types,
      query.cursor,
      query.limit ?? 30,
      deviceId,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send a message (HTTP fallback — prefer WebSocket)',
  })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  @ApiResponse({
    status: 201,
    description: 'Message created and broadcast via socket',
  })
  async createMessage(
    @Param('chatId') chatId: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: User,
  ) {
    // Note: encrypted sends via this REST fallback are stored correctly but
    // don't get real-time delivery — a single room broadcast can't carry
    // different ciphertext per recipient device (see messages.service.ts's
    // create()). The WebSocket path (message.handler.ts) is the only one
    // that does per-device fan-out; this endpoint exists for plaintext
    // fallbacks (e.g. the mobile notification quick-reply action).
    const { dto: message } = await this.messagesService.create({
      chatId,
      senderId: user.id,
      content: dto.content,
      type: dto.type,
      replyToId: dto.replyToId,
      attachments: dto.attachments,
      isEncrypted: dto.isEncrypted,
      ciphers: dto.ciphers,
      groupCiphertext: dto.groupCiphertext,
    });
    return message;
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark specific messages as read' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  @ApiBody({
    schema: {
      properties: { messageIds: { type: 'array', items: { type: 'string' } } },
    },
  })
  @ApiResponse({ status: 200, description: 'Messages marked as read' })
  async markAsRead(
    @Param('chatId') _chatId: string,
    @Body() body: { messageIds: string[] },
    @CurrentUser() user: User,
  ) {
    await this.messagesService.markAsRead(body.messageIds, user.id);
    return { success: true };
  }

  @Post('attachments')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a file attachment (max 10 MB)' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Returns the Cloudinary URL and file metadata',
  })
  async uploadAttachment(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    try {
      const result = await this.cloudinaryService.uploadFile(file);
      return {
        url: result.secure_url,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      };
    } catch (error: unknown) {
      console.error('Upload Error:', error);
      throw error;
    }
  }
}
