import { registerAs } from '@nestjs/config';
import { getAllowedOrigins } from '../common/utils/allowed-origins';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrls: getAllowedOrigins(),
}));
