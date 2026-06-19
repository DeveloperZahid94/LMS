import {
  IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ExpenseCategory {
  RENT = 'RENT',
  SALARY = 'SALARY',
  ELECTRICITY = 'ELECTRICITY',
  WATER = 'WATER',
  INTERNET = 'INTERNET',
  MAINTENANCE = 'MAINTENANCE',
  SUPPLIES = 'SUPPLIES',
  EQUIPMENT = 'EQUIPMENT',
  MARKETING = 'MARKETING',
  MISC = 'MISC',
}

export enum ExpensePaymentStatus {
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  UNPAID = 'UNPAID',
}

export class CreateExpenseDto {
  @IsString()
  title!: string;

  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  /** Optional — null/absent means a tenant-wide expense not tied to a branch. */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  vendor?: string;

  /** Optional staff member this expense is attributed to (e.g. SALARY recipient). */
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** When true, record this as a pay-later (credit) expense rather than paid in full. */
  @IsOptional()
  @IsBoolean()
  onCredit?: boolean;

  /** Amount already paid up-front on a credit expense (0 = nothing paid yet). Ignored unless onCredit. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  /** When the outstanding balance is due. Only meaningful for credit expenses. */
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateExpenseDto {
  @IsOptional() @IsString()                            title?: string;
  @IsOptional() @IsEnum(ExpenseCategory)               category?: ExpenseCategory;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsDateString()                        expenseDate?: string;
  @IsOptional() @IsUUID()                              branchId?: string;
  @IsOptional() @IsString()                            paymentMethod?: string;
  @IsOptional() @IsString()                            vendor?: string;
  /** Pass an empty string to clear the attribution. */
  @IsOptional() @IsString()                            staffId?: string;
  @IsOptional() @IsString()                            notes?: string;
  @IsOptional() @IsBoolean()                           onCredit?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paidAmount?: number;
  /** Pass an empty string to clear the due date. */
  @IsOptional() @IsString()                            dueDate?: string;
}

/** Records a payment against a credit (pay-later) expense, reducing its outstanding balance. */
export class PayExpenseDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  /** Date the payment was made; defaults to now. */
  @IsOptional()
  @IsDateString()
  paidDate?: string;
}

export class ExpenseListQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsEnum(ExpensePaymentStatus)
  paymentStatus?: ExpensePaymentStatus;

  /** Inclusive lower bound on expenseDate (ISO date). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive upper bound on expenseDate (ISO date). */
  @IsOptional()
  @IsDateString()
  to?: string;
}
