import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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
}
