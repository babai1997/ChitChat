import { Module } from '@nestjs/common';
import { DeviceLinkController } from './device-link.controller';
import { DeviceLinkService } from './device-link.service';

@Module({
  controllers: [DeviceLinkController],
  providers: [DeviceLinkService],
  exports: [DeviceLinkService],
})
export class DeviceLinkModule {}
