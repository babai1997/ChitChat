import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UpdateProfileDto } from './dto';

@Injectable()
export class ProfilesService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

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

    if (!existingProfile) {
      // Create profile if it doesn't exist
      return this.prisma.profile.create({
        data: {
          userId,
          displayName: dto.displayName,
          avatarUrl: dto.avatarUrl,
          about: dto.about || 'Hey there! I am using ChitChat',
        },
      });
    }

    // Update existing profile
    return this.prisma.profile.update({
      where: { userId },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.about !== undefined && { about: dto.about }),
      },
    });
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
    return this.prisma.profile.update({
      where: { userId },
      data: {
        avatarUrl: result.secure_url,
      },
    });
  }

  async isProfileComplete(userId: string): Promise<boolean> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    return !!(profile?.displayName);
  }
}
