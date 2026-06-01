import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PgRoomsService } from './pg-rooms.service';
import {
  AssignBedDto, CreatePgRoomDto, PgRoomsListQueryDto, UpdatePgRoomDto,
} from './dto/pg-room.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('pg-rooms')
@ApiBearerAuth()
@Controller('pg-rooms')
@Roles(UserRole.STAFF)
export class PgRoomsController {
  constructor(private readonly service: PgRoomsService) {}

  @Get()
  list(@Query() q: PgRoomsListQueryDto) {
    return this.service.list(q);
  }

  @Get('stats')
  stats(@Query('branchId') branchId?: string) {
    return this.service.stats(branchId);
  }

  @Post()
  create(@Body() dto: CreatePgRoomDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePgRoomDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Get(':id/history')
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.history(id);
  }

  @Post(':id/assignments')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignBedDto) {
    return this.service.assign(id, dto);
  }

  @Delete('assignments/:assignmentId')
  unassign(@Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.service.unassign(assignmentId);
  }
}
