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
  const allowedOrigins = configService.get<string[]>('app.frontendUrls') || [
    'http://localhost:5173',
  ];
  logger.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);

  // ── Security headers ──────────────────────────────────────────────────────
  // Skip strict CSP for the Swagger UI path so its inline scripts/styles load.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path?.startsWith('/docs')) return next();
    helmetMiddleware(req, res, next);
  });

  // Enable CORS — FRONTEND_URL can list several allowed origins (custom
  // domain, its www variant, Render's own default URL); a request from
  // anything else is rejected, logged so a future mismatch is visible in
  // the deploy logs instead of just failing silently in the browser.
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`CORS rejected origin: ${origin}`);
        callback(new Error(`Origin ${origin} not allowed by CORS`), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    // x-device-id is attached to every request by the frontend's axios
    // interceptor (see frontend/src/api/client.ts) — missing it here fails
    // the CORS preflight for every cross-origin request, not just some.
    allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
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
  logger.log(`🌐 Frontend URL(s): ${allowedOrigins.join(', ')}`);
}

bootstrap();
