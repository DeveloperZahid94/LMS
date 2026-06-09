import {
  IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min,
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

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateExpenseDto {
  @IsOptional() @IsString()                            title?: string;
  @IsOptional() @IsEnum(ExpenseCategory)               category?: ExpenseCategory;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsDateString()                        expenseDate?: string;
  @IsOptional() @IsUUID()                              branchId?: string;
  @IsOptional() @IsString()                            paymentMethod?: string;
  @IsOptional() @IsString()                            vendor?: string;
  @IsOptional() @IsString()                            notes?: string;
}

export class ExpenseListQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  /** Inclusive lower bound on expenseDate (ISO date). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive upper bound on expenseDate (ISO date). */
  @IsOptional()
  @IsDateString()
  to?: string;
}
