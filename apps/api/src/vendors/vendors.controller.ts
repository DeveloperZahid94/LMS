import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { CreateVendorDto, RecordVendorAdvanceDto, UpdateVendorDto } from './dto/vendors.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('vendors')
@ApiBearerAuth()
@Controller('vendors')
@Roles(UserRole.STAFF)
export class VendorsController {
  constructor(private readonly service: VendorsService) {}

  @Get()
  list(@Query('activeOnly') activeOnly?: string) {
    return this.service.list(activeOnly === 'true');
  }

  @Post()
  create(@Body() dto: CreateVendorDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendorDto) {
    return this.service.update(id, dto);
  }

  /** Top up the vendor's advance wallet. */
  @Post(':id/advance')
  recordAdvance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordVendorAdvanceDto) {
    return this.service.recordAdvance(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
