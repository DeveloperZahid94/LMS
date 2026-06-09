import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportsRangeDto, ReportsStudentsDto, ReportsTimeseriesDto } from './dto/reports.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@Roles(UserRole.STAFF)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('summary')
  summary(@Query() q: ReportsRangeDto) {
    return this.service.summary(q);
  }

  @Get('timeseries')
  timeseries(@Query() q: ReportsTimeseriesDto) {
    return this.service.timeseries({
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      branchId: q.branchId,
      bucket: q.bucket ?? 'day',
    });
  }

  @Get('students')
  students(@Query() q: ReportsStudentsDto) {
    return this.service.studentSummary({
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      branchId: q.branchId,
      status: q.status ?? 'ALL',
    });
  }

  @Get('methods')
  methods(@Query() q: ReportsRangeDto) {
    return this.service.methodBreakdown(q);
  }

  @Get('income-sources')
  incomeSources(@Query() q: ReportsRangeDto) {
    return this.service.incomeBySource(q);
  }

  @Get('profit-loss')
  profitLoss(@Query() q: ReportsTimeseriesDto) {
    return this.service.profitLoss({
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      branchId: q.branchId,
      bucket: q.bucket ?? 'day',
    });
  }

  @Get('aging')
  aging(@Query('branchId') branchId?: string) {
    return this.service.aging({ branchId });
  }
}
