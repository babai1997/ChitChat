import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3000;
  const frontendUrl = configService.get<string>('app.frontendUrl') || 'http://localhost:5173';

  // Enable CORS
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  await app.listen(port);

  logger.log(`🚀 ChitChat Backend running on: http://localhost:${port}`);
  logger.log(`📚 API available at: http://localhost:${port}/api`);
  logger.log(`🔌 WebSocket available at: ws://localhost:${port}/chat`);
  logger.log(`🌐 Frontend URL: ${frontendUrl}`);
}

bootstrap();
