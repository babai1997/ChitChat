import { Module } from '@nestjs/common';
import { SenderKeysController } from './sender-keys.controller';
import { SenderKeysService } from './sender-keys.service';
import { ChatsModule } from '../chats/chats.module';

@Module({
  imports: [ChatsModule],
  controllers: [SenderKeysController],
  providers: [SenderKeysService],
  exports: [SenderKeysService],
})
export class SenderKeysModule {}
