import { Module } from '@nestjs/common';
import { SeatAssignmentsService } from './seat-assignments.service';
import { SeatAssignmentsController } from './seat-assignments.controller';

@Module({
  controllers: [SeatAssignmentsController],
  providers: [SeatAssignmentsService],
  exports: [SeatAssignmentsService],
})
export class SeatAssignmentsModule {}
