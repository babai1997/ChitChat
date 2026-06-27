import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';

const helmetMiddleware = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3000;
  const frontendUrl =
    configService.get<string>('app.frontendUrl') || 'http://localhost:5173';

  // ── Security headers ──────────────────────────────────────────────────────
  // Skip strict CSP for the Swagger UI path so its inline scripts/styles load.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path?.startsWith('/docs')) return next();
    helmetMiddleware(req, res, next);
  });

  // Enable CORS
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // ── Swagger / OpenAPI ─────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ChitChat API')
    .setDescription(
      'REST + WebSocket API for the ChitChat messaging application',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('Auth', 'Authentication & token management')
    .addTag('Users', 'User search & profiles')
    .addTag('Profile', 'Authenticated user profile')
    .addTag('Chats', 'Chat rooms & group management')
    .addTag('Messages', 'Chat messages & file uploads')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 ChitChat Backend running on: http://localhost:${port}`);
  logger.log(`📚 API available at: http://localhost:${port}/api`);
  logger.log(`📖 Swagger docs at: http://localhost:${port}/docs`);
  logger.log(`🔌 WebSocket available at: ws://localhost:${port}/chat`);
  logger.log(`🌐 Frontend URL: ${frontendUrl}`);
}

bootstrap();
