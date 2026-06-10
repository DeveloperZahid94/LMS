import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { CreateStaffDto, UpdateStaffDto } from './dto/staff.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('staff')
@ApiBearerAuth()
@Controller('staff')
// Listing is STAFF-level so the staff/assigned-by dropdowns work for everyone;
// creating and editing staff is restricted to the tenant admin below.
@Roles(UserRole.STAFF)
export class StaffController {
  constructor(private readonly service: StaffService) {}

  @Get()
  list(@Query('activeOnly') activeOnly?: string) {
    return this.service.list(activeOnly === 'true' || activeOnly === '1');
  }

  @Roles(UserRole.CLIENT_ADMIN)
  @Post()
  create(@Body() dto: CreateStaffDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.CLIENT_ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) {
    return this.service.update(id, dto);
  }
}
