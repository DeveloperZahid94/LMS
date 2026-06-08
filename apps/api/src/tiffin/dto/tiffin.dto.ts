import {
  IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TiffinMealType {
  VEG = 'VEG',
  NONVEG = 'NONVEG',
}

export enum TiffinMealPlan {
  LUNCH = 'LUNCH',
  DINNER = 'DINNER',
  BOTH = 'BOTH',
}

export enum TiffinStatus {
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}

export class CreateTiffinSubscriptionDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  branchId!: string;

  @IsEnum(TiffinMealType)
  mealType!: TiffinMealType;

  @IsEnum(TiffinMealPlan)
  mealPlan!: TiffinMealPlan;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyRate!: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @IsOptional()
  @IsString()
  deliveryAssignee?: string;

  @IsOptional()
  @IsString()
  deliveryPhone?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTiffinSubscriptionDto {
  @IsOptional() @IsEnum(TiffinMealType)             mealType?: TiffinMealType;
  @IsOptional() @IsEnum(TiffinMealPlan)             mealPlan?: TiffinMealPlan;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) monthlyRate?: number;
  @IsOptional() @IsDateString()                    nextDueDate?: string;
  @IsOptional() @IsString()                        deliveryAssignee?: string;
  @IsOptional() @IsString()                        deliveryPhone?: string;
  @IsOptional() @IsString()                        notes?: string;
}

export class PauseTiffinDto {
  @IsOptional()
  @IsDateString()
  pausedAt?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ResumeTiffinDto {
  @IsOptional()
  @IsDateString()
  resumedAt?: string;
}

export class TiffinListQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(TiffinStatus)
  status?: TiffinStatus;
}
