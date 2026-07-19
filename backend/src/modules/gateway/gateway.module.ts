import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';
import { SocketRegistryService } from './services/socket-registry.service';
import { MessageHandler } from './handlers/message.handler';
import { PresenceHandler } from './handlers/presence.handler';
import { CallHandler } from './handlers/call.handler';
import { MessagesModule } from '../messages/messages.module';
import { ChatsModule } from '../chats/chats.module';
import { UsersModule } from '../users/users.module';
import { PushModule } from '../push';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('jwt.secret') ||
          'default-secret-change-in-production',
        signOptions: {
          expiresIn: (configService.get<string>('jwt.expiresIn') ||
            '15m') as `${number}m`,
        },
      }),
    }),
    MessagesModule,
    ChatsModule,
    UsersModule,
    PushModule,
  ],
  providers: [
    ChatGateway,
    SocketRegistryService,
    MessageHandler,
    PresenceHandler,
    CallHandler,
  ],
  exports: [ChatGateway, SocketRegistryService],
})
export class GatewayModule {}
