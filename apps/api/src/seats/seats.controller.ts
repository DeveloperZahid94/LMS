import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SeatsService } from './seats.service';
import { CreateSeatDto } from './dto/create-seat.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('seats')
@ApiBearerAuth()
@Controller('seats')
@Roles(UserRole.STAFF)
export class SeatsController {
  constructor(private readonly service: SeatsService) {}

  @Get()
  list(@Query('branchId') branchId?: string) {
    return this.service.list(branchId);
  }

  @Roles(UserRole.BRANCH_ADMIN)
  @Post()
  create(@Body() dto: CreateSeatDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.BRANCH_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateSeatDto>) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.CLIENT_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
