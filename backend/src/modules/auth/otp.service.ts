import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otpExpiryMinutes: number;
  private readonly maxAttempts: number;
  private readonly rateLimitMinutes: number;
  private readonly smsProvider: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.otpExpiryMinutes = this.configService.get<number>('otp.expiryMinutes') ?? 5;
    this.maxAttempts = this.configService.get<number>('otp.maxAttempts') ?? 3;
    this.rateLimitMinutes = this.configService.get<number>('otp.rateLimitMinutes') ?? 1;
    this.smsProvider = this.configService.get<string>('otp.smsProvider') ?? 'console';
  }

  async sendOtp(phone: string): Promise<{ success: boolean; message: string }> {
    // Check rate limiting - look for recent unverified OTPs
    const recentOtp = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        verified: false,
        createdAt: {
          gte: new Date(Date.now() - this.rateLimitMinutes * 60 * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentOtp) {
      const timeLeft = Math.ceil(
        (recentOtp.createdAt.getTime() +
          this.rateLimitMinutes * 60 * 1000 -
          Date.now()) /
          1000,
      );
      throw new BadRequestException(
        `Please wait ${timeLeft} seconds before requesting another OTP`,
      );
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = this.hashOtp(otp);

    // Store OTP in database
    await this.prisma.otpCode.create({
      data: {
        phone,
        code: hashedOtp,
        expiresAt: new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000),
        attempts: 0,
        verified: false,
      },
    });

    // Send OTP via SMS provider
    await this.sendSms(phone, otp);

    return { success: true, message: 'OTP sent successfully' };
  }

  async verifyOtp(phone: string, otp: string): Promise<boolean> {
    // Find the most recent unverified OTP for this phone
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        verified: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('No OTP found. Please request a new one.');
    }

    // Check expiry
    if (otpRecord.expiresAt < new Date()) {
      await this.prisma.otpCode.delete({ where: { id: otpRecord.id } });
      throw new BadRequestException('OTP expired. Please request a new one.');
    }

    // Check max attempts
    if (otpRecord.attempts >= this.maxAttempts) {
      await this.prisma.otpCode.delete({ where: { id: otpRecord.id } });
      throw new BadRequestException(
        'Too many failed attempts. Please request a new OTP.',
      );
    }

    // Verify OTP
    const isValid = this.hashOtp(otp) === otpRecord.code;

    if (!isValid) {
      // Increment attempts
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });

      const remainingAttempts = this.maxAttempts - otpRecord.attempts - 1;
      throw new BadRequestException(
        `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`,
      );
    }

    // Mark as verified and clean up old OTPs
    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { verified: true },
    });

    // Clean up old OTPs for this phone
    await this.prisma.otpCode.deleteMany({
      where: {
        phone,
        id: { not: otpRecord.id },
      },
    });

    return true;
  }

  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  private async sendSms(phone: string, otp: string): Promise<void> {
    // Switch based on provider
    if (this.smsProvider === 'twilio') {
       await this.sendViaTwilio(phone, otp);
       return;
    }

    // Default/Console fallback
    this.logger.log(`📱 OTP for ${phone}: ${otp}`);
    this.logger.warn('⚠️  Using console SMS provider - for development only!');
  }

  private async sendViaTwilio(phone: string, otp: string): Promise<void> {
    const accountSid = this.configService.get<string>('otp.twilio.accountSid');
    const authToken = this.configService.get<string>('otp.twilio.authToken');
    const fromNumber = this.configService.get<string>('otp.twilio.phoneNumber');

    if (!accountSid || !authToken || !fromNumber) {
      this.logger.error('Missing Twilio credentials in configuration');
      throw new Error('SMS service not configured properly');
    }

    try {
      // Lazy load twilio to avoid startup errors if not installed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio');
      const client = twilio(accountSid, authToken);

      await client.messages.create({
        body: `Your ChitChat verification code is: ${otp}`,
        from: fromNumber,
        to: phone,
      });
      
      this.logger.log(`Twilio SMS sent to ${phone}`);
    } catch (error) {
      this.logger.error(`Failed to send SMS via Twilio: ${error}`);
      throw new Error('Failed to send verification code');
    }
  }
}
