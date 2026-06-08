import { Module } from '@nestjs/common';
import { TiffinService } from './tiffin.service';
import { TiffinController } from './tiffin.controller';

@Module({
  controllers: [TiffinController],
  providers: [TiffinService],
})
export class TiffinModule {}
