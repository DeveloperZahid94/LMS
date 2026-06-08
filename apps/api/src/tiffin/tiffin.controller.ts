import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TiffinService } from './tiffin.service';
import {
  CreateTiffinSubscriptionDto, PauseTiffinDto, ResumeTiffinDto,
  TiffinListQueryDto, UpdateTiffinSubscriptionDto,
} from './dto/tiffin.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('tiffin')
@ApiBearerAuth()
@Controller('tiffin')
@Roles(UserRole.STAFF)
export class TiffinController {
  constructor(private readonly service: TiffinService) {}

  @Get()
  list(@Query() q: TiffinListQueryDto) {
    return this.service.list(q);
  }

  @Get('stats')
  stats(@Query('branchId') branchId?: string) {
    return this.service.stats(branchId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() dto: CreateTiffinSubscriptionDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTiffinSubscriptionDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/pause')
  pause(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PauseTiffinDto) {
    return this.service.pause(id, dto);
  }

  @Post(':id/resume')
  resume(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResumeTiffinDto) {
    return this.service.resume(id, dto);
  }

  @Delete(':id')
  end(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.end(id);
  }
}
