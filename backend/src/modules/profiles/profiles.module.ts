import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { ChatsModule } from '../chats/chats.module';

@Module({
  imports: [CloudinaryModule, ChatsModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
