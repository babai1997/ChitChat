import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD, APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

// Config
import { appConfig, jwtConfig, otpConfig } from './config';

// Database
import { PrismaModule } from './prisma';

// Common
import { JwtAuthGuard, HttpExceptionFilter } from './common';

// Feature Modules
import { AuthModule } from './modules/auth';
import { UsersModule } from './modules/users';
import { ProfilesModule } from './modules/profiles';
import { ChatsModule } from './modules/chats';
import { MessagesModule } from './modules/messages';
import { GatewayModule } from './modules/gateway';
import { CloudinaryModule } from './modules/cloudinary/cloudinary.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, otpConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    EventEmitterModule.forRoot({ global: true }),

    // Database
    PrismaModule,

    // Feature Modules
    AuthModule,
    UsersModule,
    ProfilesModule,
    ChatsModule,
    MessagesModule,
    GatewayModule,
    CloudinaryModule,
  ],
  providers: [
    // Global JWT Auth Guard
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global Exception Filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Global Validation Pipe
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    },
  ],
})
export class AppModule {}
