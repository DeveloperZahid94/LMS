import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { SeatAssignmentsModule } from '../seat-assignments/seat-assignments.module';

@Module({
  imports: [SeatAssignmentsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
