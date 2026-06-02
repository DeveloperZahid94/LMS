import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { AttendanceService } from './attendance.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload, UserRole } from '@lms/shared';

class SelfAttendanceDto {
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
  @IsOptional() @IsString() selfie?: string;
}

// Base path is intentionally NOT under `attendance/` — `attendance/:id/check-out`
// on the staff controller would otherwise capture `attendance/self/check-out`.
@ApiTags('my-attendance')
@ApiBearerAuth()
@Controller('my-attendance')
@Roles(UserRole.STUDENT)
export class SelfAttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get('today')
  today(@CurrentUser() user: JwtPayload) {
    return this.service.selfToday(user.sub);
  }

  @Post('check-in')
  checkIn(@CurrentUser() user: JwtPayload, @Body() dto: SelfAttendanceDto) {
    return this.service.selfCheckIn(user.sub, dto);
  }

  @Post('check-out')
  checkOut(@CurrentUser() user: JwtPayload, @Body() dto: SelfAttendanceDto) {
    return this.service.selfCheckOut(user.sub, dto);
  }
}
