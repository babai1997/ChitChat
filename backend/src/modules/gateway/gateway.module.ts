import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';
import { MessagesModule } from '../messages/messages.module';
import { ChatsModule } from '../chats/chats.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('jwt.secret') || 'default-secret-change-in-production';
        const expiresIn = configService.get<string>('jwt.expiresIn') || '15m';
        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as `${number}m` | `${number}h` | `${number}d`,
          },
        };
      },
    }),
    MessagesModule,
    ChatsModule,
    UsersModule,
  ],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class GatewayModule {}
