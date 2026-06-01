import {
  IsArray, IsBoolean, IsEnum, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SeatType, Shift } from '@lms/shared';

class MonthlyRatesDto {
  @IsOptional() @IsNumber() @Min(0) MORNING?: number;
  @IsOptional() @IsNumber() @Min(0) AFTERNOON?: number;
  @IsOptional() @IsNumber() @Min(0) EVENING?: number;
  @IsOptional() @IsNumber() @Min(0) NIGHT?: number;
  @IsOptional() @IsNumber() @Min(0) FULL_DAY?: number;
}

export class CreateSeatDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @Length(1, 32)
  code!: string;

  @IsEnum(SeatType)
  type!: SeatType;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsObject()
  @Type(() => MonthlyRatesDto)
  monthlyRates?: Partial<Record<Shift, number>>;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
