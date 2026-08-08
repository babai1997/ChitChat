import {
  Controller,
  Get,
  Put,
  Body,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto';
import { CurrentUser } from '../../common/decorators';
import type { User } from '@prisma/client';

// JwtAuthGuard is already applied globally (see app.module.ts's APP_GUARD).
@ApiTags('Profile')
@ApiBearerAuth('access-token')
@Controller('profile')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile with user details' })
  async getProfile(@CurrentUser() user: User) {
    const profile = await this.profilesService.getProfile(user.id);

    return {
      id: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      about: profile.about,
      isOnline: profile.isOnline,
      user: {
        id: profile.user.id,
        phone: profile.user.phone,
        email: profile.user.email,
        lastSeen: profile.user.lastSeen,
      },
    };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update display name, about, or avatar URL' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    const profile = await this.profilesService.updateProfile(user.id, dto);

    return {
      id: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      about: profile.about,
      isOnline: profile.isOnline,
    };
  }

  @Put('avatar')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload a new avatar (PNG/JPEG, max 5 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Returns the new avatar URL' })
  async uploadAvatar(
    @CurrentUser() user: User,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg)' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.profilesService.uploadAvatar(user.id, file);
  }

  @Get('complete')
  @ApiOperation({
    summary: 'Check whether the user has completed their profile',
  })
  @ApiResponse({ status: 200, description: '{ isComplete: boolean }' })
  async isProfileComplete(@CurrentUser() user: User) {
    const isComplete = await this.profilesService.isProfileComplete(user.id);
    return { isComplete };
  }
}
