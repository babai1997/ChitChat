import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';
import { CallHttpController } from './call-http.controller';
import { SocketRegistryService } from './services/socket-registry.service';
import { TurnCredentialsService } from './services/turn-credentials.service';
import { MessageHandler } from './handlers/message.handler';
import { PresenceHandler } from './handlers/presence.handler';
import { CallHandler } from './handlers/call.handler';
import { SenderKeyHandler } from './handlers/sender-key.handler';
import { MessagesModule } from '../messages/messages.module';
import { ChatsModule } from '../chats/chats.module';
import { UsersModule } from '../users/users.module';
import { PushModule } from '../push';
import { SenderKeysModule } from '../sender-keys';

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
    SenderKeysModule,
  ],
  controllers: [CallHttpController],
  providers: [
    ChatGateway,
    SocketRegistryService,
    TurnCredentialsService,
    MessageHandler,
    PresenceHandler,
    CallHandler,
    SenderKeyHandler,
  ],
  exports: [ChatGateway, SocketRegistryService],
})
export class GatewayModule {}
