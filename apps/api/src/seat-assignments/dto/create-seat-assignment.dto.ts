import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { Shift } from '@lms/shared';

export class CreateSeatAssignmentDto {
  @IsUUID()
  seatId!: string;

  @IsUUID()
  studentId!: string;

  @IsEnum(Shift)
  shift!: Shift;

  @IsISO8601()
  startDate!: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsISO8601()
  nextDueDate?: string;
}
