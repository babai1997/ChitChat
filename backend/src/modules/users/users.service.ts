import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
      include: { profile: true },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
  }

  async searchUsers(query: string, currentUserId: string, limit = 20) {
    return this.prisma.user.findMany({
      where: {
        AND: [
          { id: { not: currentUserId } },
          { isVerified: true },
          {
            OR: [
              { phone: { contains: query } },
              { email: { contains: query, mode: 'insensitive' } },
              {
                profile: {
                  displayName: { contains: query, mode: 'insensitive' },
                },
              },
            ],
          },
        ],
      },
      include: { profile: true },
      take: limit,
    });
  }

  async updateLastSeen(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastSeen: new Date() },
    });
  }

  async setOnlineStatus(userId: string, isOnline: boolean) {
    return this.prisma.profile.update({
      where: { userId },
      data: { isOnline },
    });
  }

  async getUsersById(userIds: string[]) {
    return this.prisma.user.findMany({
      where: { id: { in: userIds } },
      include: { profile: true },
    });
  }
}
