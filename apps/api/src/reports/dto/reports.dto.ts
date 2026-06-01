import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

export type Bucket = 'day' | 'week' | 'month' | 'year';
export type StudentStatusFilter = 'ALL' | 'PAID' | 'PARTIAL' | 'UNPAID';

const BUCKETS = ['day', 'week', 'month', 'year'] as const;
const STATUSES = ['ALL', 'PAID', 'PARTIAL', 'UNPAID'] as const;

export class ReportsRangeDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class ReportsTimeseriesDto extends ReportsRangeDto {
  @IsOptional()
  @IsIn(BUCKETS as unknown as string[])
  bucket?: Bucket = 'day';
}

export class ReportsStudentsDto extends ReportsRangeDto {
  @IsOptional()
  @IsIn(STATUSES as unknown as string[])
  status?: StudentStatusFilter = 'ALL';
}
