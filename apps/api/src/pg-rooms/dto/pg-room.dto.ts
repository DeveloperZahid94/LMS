import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber,
  IsOptional, IsString, IsUUID, Max, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PgRoomType {
  SINGLE = 'SINGLE',
  DOUBLE = 'DOUBLE',
  TRIPLE = 'TRIPLE',
}

const TYPE_TO_BED_COUNT: Record<PgRoomType, number> = {
  SINGLE: 1, DOUBLE: 2, TRIPLE: 3,
};
export function defaultBedCount(t: PgRoomType): number { return TYPE_TO_BED_COUNT[t]; }

export class CreatePgRoomDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  roomNumber!: string;

  @IsEnum(PgRoomType)
  type!: PgRoomType;

  /** Override the implied bedCount (1/2/3). Pass to use a non-standard layout. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  bedCount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyRate!: number;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  amenities?: string[];
}

export class UpdatePgRoomDto {
  @IsOptional() @IsString()                        roomNumber?: string;
  @IsOptional() @IsEnum(PgRoomType)                type?: PgRoomType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(8) bedCount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)      monthlyRate?: number;
  @IsOptional() @IsString()                        floor?: string;
  @IsOptional() @IsString()                        notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsBoolean()                       isActive?: boolean;
}

export class AssignBedDto {
  @IsUUID()
  studentId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  bedNumber!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyRate?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PgRoomsListQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(PgRoomType)
  type?: PgRoomType;

  @IsOptional()
  @IsString()
  availability?: 'ALL' | 'AVAILABLE' | 'PARTIAL' | 'FULL';

  @IsOptional()
  @IsString()
  search?: string;
}
