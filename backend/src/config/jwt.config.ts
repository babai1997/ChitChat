import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => {
  const secret = process.env.JWT_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is not set. Set it in your .env file or deployment environment.',
    );
  }
  if (!refreshSecret) {
    throw new Error(
      'JWT_REFRESH_SECRET environment variable is not set. Set it in your .env file or deployment environment.',
    );
  }

  return {
    secret,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  };
});
