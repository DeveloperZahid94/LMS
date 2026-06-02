import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { CheckInDto, ManualAttendanceDto } from './dto/check-in.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireFeature } from '../feature-flags/feature-flag.decorator';
import { FeatureFlagGuard } from '../feature-flags/feature-flag.guard';
import { UserRole, FeatureKey } from '@lms/shared';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
@Roles(UserRole.STAFF)
@UseGuards(FeatureFlagGuard)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Post('qr')
  @RequireFeature(FeatureKey.QR_ATTENDANCE)
  qrCheckIn(@Body() dto: CheckInDto) {
    return this.service.checkInByQr(dto);
  }

  @Post('manual')
  manualCheckIn(@Body() dto: ManualAttendanceDto) {
    return this.service.manualCheckIn(dto);
  }

  @Post(':id/check-out')
  checkOut(@Param('id') id: string) {
    return this.service.checkOut(id);
  }

  @Get()
  list(@Query('date') date: string, @Query('branchId') branchId?: string) {
    return this.service.listForDate(date, branchId);
  }

  @Get('report')
  report(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('studentId') studentId?: string,
    @Query('source') source?: string,
  ) {
    return this.service.report({ from, to, branchId, studentId, source });
  }

  @Get('students/:studentId')
  listForStudent(@Param('studentId') studentId: string) {
    return this.service.listForStudent(studentId);
  }

  @Delete(':id')
  @Roles(UserRole.BRANCH_ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
