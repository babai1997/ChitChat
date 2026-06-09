import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessagesService } from './messages.service';
import { CreateMessageDto, MessageQueryDto } from './dto';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import type { User } from '@prisma/client';

@Controller('chats/:chatId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get()
  async getMessages(
    @Param('chatId') chatId: string,
    @Query() query: MessageQueryDto,
    @CurrentUser() user: User,
  ) {
    return this.messagesService.getMessages(chatId, user.id, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createMessage(
    @Param('chatId') chatId: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: User,
  ) {
    return this.messagesService.create({
      chatId,
      senderId: user.id,
      content: dto.content,
      type: dto.type,
      replyToId: dto.replyToId,
      attachments: dto.attachments,
    });
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @Param('chatId') chatId: string,
    @Body() body: { messageIds: string[] },
    @CurrentUser() user: User,
  ) {
    await this.messagesService.markAsRead(body.messageIds, user.id);
    return { success: true };
  }

  @Post('attachments')
  @UseInterceptors(FileInterceptor('file'))
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
    } catch (error) {
      console.error('Upload Error:', error);
      throw error;
    }
  }
}
