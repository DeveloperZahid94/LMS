import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaymentMethod } from '@lms/shared';

export class CreatePaymentDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  branchId!: string;

  @IsNumber()
  @Min(1)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * When set, the student's active seat allocations get their `nextDueDate`
   * advanced to this date. Useful for "paid now, next installment due X".
   */
  @IsOptional()
  @IsISO8601()
  nextDueDate?: string;
}

export class RazorpayCreateOrderDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  branchId!: string;

  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string;
}

export class RazorpayVerifyDto {
  @IsString() paymentId!: string;
  @IsString() razorpayOrderId!: string;
  @IsString() razorpayPaymentId!: string;
  @IsString() razorpaySignature!: string;
}
