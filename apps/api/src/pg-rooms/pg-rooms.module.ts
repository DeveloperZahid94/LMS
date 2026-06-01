import { Module } from '@nestjs/common';
import { PgRoomsService } from './pg-rooms.service';
import { PgRoomsController } from './pg-rooms.controller';

@Module({
  controllers: [PgRoomsController],
  providers: [PgRoomsService],
})
export class PgRoomsModule {}
