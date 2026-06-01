import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AttendanceSource } from '@lms/shared';

export class CheckInDto {
  @IsString()
  qrCode!: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsEnum(AttendanceSource)
  source?: AttendanceSource;
}

export class ManualAttendanceDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  branchId!: string;
}
