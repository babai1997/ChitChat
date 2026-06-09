import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3000;
  const frontendUrl =
    configService.get<string>('app.frontendUrl') || 'http://localhost:5173';

  // ── Security headers ──────────────────────────────────────────────────────
  // Helmet sets: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
  // Strict-Transport-Security, Content-Security-Policy, etc.
  // crossOriginResourcePolicy is set to cross-origin so the frontend (different
  // origin) can load images/assets served by this backend.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Enable CORS
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 ChitChat Backend running on: http://localhost:${port}`);
  logger.log(`📚 API available at: http://localhost:${port}/api`);
  logger.log(`🔌 WebSocket available at: ws://localhost:${port}/chat`);
  logger.log(`🌐 Frontend URL: ${frontendUrl}`);
}

bootstrap();
