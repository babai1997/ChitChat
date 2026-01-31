import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpService } from './otp.service';
import { SendOtpDto, VerifyOtpDto, GoogleAuthDto, RefreshTokenDto } from './dto';
import { User, AuthProviderType } from '@prisma/client';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  user: {
    id: string;
    phone?: string | null;
    email?: string | null;
    isVerified: boolean;
    profile: {
      displayName?: string | null;
      avatarUrl?: string | null;
      about?: string | null;
    } | null;
  };
  isNewUser: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtRefreshSecret: string;
  private readonly jwtRefreshExpiresIn: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private otpService: OtpService,
  ) {
    this.jwtRefreshSecret = this.configService.get<string>('jwt.refreshSecret')!;
    this.jwtRefreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn')!;
  }

  // ============================================
  // OTP Authentication
  // ============================================

  async sendOtp(dto: SendOtpDto): Promise<{ success: boolean; message: string }> {
    return this.otpService.sendOtp(dto.phone);
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<AuthResponse> {
    // Verify OTP
    await this.otpService.verifyOtp(dto.phone, dto.otp);

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: { profile: true },
    });

    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          isVerified: true,
          authProviders: {
            create: {
              provider: AuthProviderType.otp,
              metadata: {},
            },
          },
          profile: {
            create: {
              about: 'Hey there! I am using ChitChat',
            },
          },
        },
        include: { profile: true },
      });
      this.logger.log(`New user created: ${user.id}`);
    } else {
      // Ensure user is verified
      if (!user.isVerified) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { isVerified: true },
          include: { profile: true },
        });
      }
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: this.sanitizeUser(user),
      isNewUser,
    };
  }

  // ============================================
  // Google Authentication
  // ============================================

  async googleAuth(dto: GoogleAuthDto): Promise<AuthResponse> {
    // In production, verify the ID token with Google
    // For MVP, we'll use a simplified flow
    // TODO: Implement proper Google OAuth verification

    const googleUser = await this.verifyGoogleToken(dto.idToken);

    // Find or create user
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: googleUser.email },
          {
            authProviders: {
              some: {
                provider: AuthProviderType.google,
                providerId: googleUser.sub,
              },
            },
          },
        ],
      },
      include: { profile: true, authProviders: true },
    });

    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await this.prisma.user.create({
        data: {
          email: googleUser.email,
          isVerified: true,
          authProviders: {
            create: {
              provider: AuthProviderType.google,
              providerId: googleUser.sub,
              metadata: {
                name: googleUser.name,
                picture: googleUser.picture,
              },
            },
          },
          profile: {
            create: {
              displayName: googleUser.name,
              avatarUrl: googleUser.picture,
              about: 'Hey there! I am using ChitChat',
            },
          },
        },
        include: { profile: true, authProviders: true },
      });
      this.logger.log(`New Google user created: ${user.id}`);
    } else {
      // Check if Google provider exists, if not, add it
      const hasGoogleProvider = user.authProviders?.some(
        (p) => p.provider === AuthProviderType.google,
      );

      if (!hasGoogleProvider) {
        await this.prisma.authProvider.create({
          data: {
            userId: user.id,
            provider: AuthProviderType.google,
            providerId: googleUser.sub,
            metadata: {
              name: googleUser.name,
              picture: googleUser.picture,
            },
          },
        });
      }
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: this.sanitizeUser(user),
      isNewUser,
    };
  }

  private async verifyGoogleToken(idToken: string): Promise<{
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
  }> {
    // TODO: In production, use Google's tokeninfo endpoint or google-auth-library
    // For MVP, we'll parse the JWT (NOT SECURE - only for development)

    try {
      // For development, decode without verification
      // In production: use OAuth2Client.verifyIdToken()
      const decoded = this.jwtService.decode(idToken) as {
        sub?: string;
        email?: string;
        name?: string;
        picture?: string;
      };

      if (!decoded?.sub) {
        throw new BadRequestException('Invalid Google token');
      }

      return {
        sub: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
      };
    } catch {
      throw new BadRequestException('Failed to verify Google token');
    }
  }

  // ============================================
  // Token Management
  // ============================================

  async refreshTokens(dto: RefreshTokenDto): Promise<TokenPair> {
    // Find refresh token in database
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if expired
    if (storedToken.expiresAt < new Date()) {
      await this.prisma.refreshToken.deleteMany({
        where: { id: storedToken.id },
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    // Verify the token
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: this.jwtRefreshSecret,
      });
    } catch {
      await this.prisma.refreshToken.deleteMany({
        where: { id: storedToken.id },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Get user
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { profile: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Delete old refresh token (rotation)
    await this.prisma.refreshToken.deleteMany({
      where: { id: storedToken.id },
    });

    // Generate new tokens
    return this.generateTokens(user);
  }

  async logout(userId: string): Promise<{ success: boolean }> {
    // Delete all refresh tokens for this user
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });

    return { success: true };
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async generateTokens(user: User): Promise<TokenPair> {
    const payload = {
      sub: user.id,
      phone: user.phone,
      email: user.email,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.jwtRefreshSecret,
        expiresIn: this.jwtRefreshExpiresIn as `${number}d`,
      }),
    ]);

    // Store refresh token in database
    const refreshExpiresAt = new Date();
    const expiresInDays = parseInt(this.jwtRefreshExpiresIn.replace('d', ''), 10) || 7;
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + expiresInDays);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: refreshExpiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: User & { profile: { displayName?: string | null; avatarUrl?: string | null; about?: string | null } | null }) {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      isVerified: user.isVerified,
      profile: user.profile
        ? {
            displayName: user.profile.displayName,
            avatarUrl: user.profile.avatarUrl,
            about: user.profile.about,
          }
        : null,
    };
  }
}
