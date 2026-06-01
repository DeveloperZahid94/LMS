import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { StudentStatus } from '@lms/shared';

const SORTABLE = ['code', 'fullName', 'phone', 'status', 'joinedAt', 'expiresAt', 'createdAt'] as const;
export type StudentSortField = (typeof SORTABLE)[number];

export class ListStudentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number = 25;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @IsOptional()
  @IsIn(SORTABLE as unknown as string[])
  sortBy?: StudentSortField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  /**
   * When true, exclude students with any active (TEMPORARY or CONFIRMED) seat
   * allocation. Used by the Allocate-seat form.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  notAllocated?: boolean;

  /** Lower bound (inclusive) for registration/joined date — yyyy-mm-dd. */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** Upper bound (inclusive) for registration/joined date — yyyy-mm-dd. */
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
