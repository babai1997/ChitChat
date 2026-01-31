import { registerAs } from '@nestjs/config';

export default registerAs('otp', () => ({
  expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES ?? '5', 10),
  maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '3', 10),
  rateLimitMinutes: parseInt(process.env.OTP_RATE_LIMIT_MINUTES ?? '1', 10),
  smsProvider: process.env.SMS_PROVIDER || 'console',
}));
