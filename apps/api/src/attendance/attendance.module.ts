import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { SelfAttendanceController } from './self-attendance.controller';

@Module({
  controllers: [AttendanceController, SelfAttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
