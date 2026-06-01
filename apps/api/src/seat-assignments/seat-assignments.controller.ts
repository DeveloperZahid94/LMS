import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { SeatAssignmentsService } from './seat-assignments.service';
import { CreateSeatAssignmentDto } from './dto/create-seat-assignment.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, SeatAssignmentStatus } from '@lms/shared';

class ListAssignmentsQuery {
  @IsOptional() @IsUUID()   branchId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['TEMPORARY', 'CONFIRMED', 'ENDED', 'ACTIVE', 'ALL'])
  status?: 'TEMPORARY' | 'CONFIRMED' | 'ENDED' | 'ACTIVE' | 'ALL' = 'ACTIVE';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number = 25;
}

@ApiTags('seat-assignments')
@ApiBearerAuth()
@Controller('seat-assignments')
@Roles(UserRole.STAFF)
export class SeatAssignmentsController {
  constructor(private readonly service: SeatAssignmentsService) {}

  @Get()
  list(@Query() q: ListAssignmentsQuery) {
    // "ACTIVE" virtual status = TEMPORARY ∪ CONFIRMED (blocks the seat).
    const statusIn = q.status === 'ACTIVE'
      ? [SeatAssignmentStatus.TEMPORARY, SeatAssignmentStatus.CONFIRMED]
      : undefined;
    const status = q.status === 'ACTIVE' || q.status === undefined
      ? undefined
      : (q.status as SeatAssignmentStatus | 'ALL');

    return this.service.list({
      branchId: q.branchId,
      search: q.search,
      status,
      statusIn,
      page: q.page,
      limit: q.limit,
    });
  }

  @Roles(UserRole.BRANCH_ADMIN)
  @Post()
  create(@Body() dto: CreateSeatAssignmentDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.BRANCH_ADMIN)
  @Delete(':id')
  end(@Param('id') id: string) {
    return this.service.end(id);
  }
}
