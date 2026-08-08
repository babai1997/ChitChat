import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ChatsService } from '../chats/chats.service';
import { UpdateProfileDto } from './dto';

@Injectable()
export class ProfilesService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private chatsService: ChatsService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Notifies every OTHER user who shares a chat with `userId` that their
   * displayName/avatarUrl/about changed — without this, those users' own
   * clients have no way to learn about it short of a full refetch, since
   * they only ever see this data as a snapshot embedded in shared chat data.
   */
  private async broadcastProfileUpdate(
    userId: string,
    profile: { displayName: string | null; avatarUrl: string | null; about: string },
  ) {
    const contactUserIds = await this.chatsService.getSharedContactUserIds(userId);
    if (contactUserIds.length === 0) return;
    this.eventEmitter.emit('profile.updated', {
      userId,
      contactUserIds,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      about: profile.about,
    });
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            email: true,
            lastSeen: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // Check if profile exists
    const existingProfile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    let profile;
    if (!existingProfile) {
      // Create profile if it doesn't exist
      profile = await this.prisma.profile.create({
        data: {
          userId,
          displayName: dto.displayName,
          avatarUrl: dto.avatarUrl,
          about: dto.about || 'Hey there! I am using ChitChat',
        },
      });
    } else {
      // Update existing profile
      profile = await this.prisma.profile.update({
        where: { userId },
        data: {
          ...(dto.displayName !== undefined && { displayName: dto.displayName }),
          ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
          ...(dto.about !== undefined && { about: dto.about }),
        },
      });
    }

    await this.broadcastProfileUpdate(userId, profile);
    return profile;
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    // Check if profile exists
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    // Upload to Cloudinary
    const result = await this.cloudinaryService.uploadFile(file);

    // Update profile
    const updated = await this.prisma.profile.update({
      where: { userId },
      data: {
        avatarUrl: result.secure_url,
      },
    });

    await this.broadcastProfileUpdate(userId, updated);
    return updated;
  }

  async isProfileComplete(userId: string): Promise<boolean> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    return !!profile?.displayName;
  }
}
