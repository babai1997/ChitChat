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
    // A short query (e.g. a single digit/letter) turns this into an open
    // directory scan — anyone can harvest phone numbers/names for the whole
    // user base a few characters at a time. Require enough of a match that
    // "search" means "find the specific person I'm looking for", not "browse".
    if (query.trim().length < 3) {
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        AND: [
          { id: { not: currentUserId } },
          { isVerified: true },
          {
            OR: [
              { phone: { contains: query } },
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
      take: Math.min(limit, 50),
    });
  }

  /** Whether two users share at least one chat together (or are the same user). */
  async shareAnyChat(userId: string, otherUserId: string): Promise<boolean> {
    if (userId === otherUserId) return true;

    const sharedChat = await this.prisma.chatMember.findFirst({
      where: {
        userId,
        chat: { members: { some: { userId: otherUserId } } },
      },
      select: { id: true },
    });

    return sharedChat !== null;
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
