import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BranchesService, CreateBranchDto } from './branches.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
@Roles(UserRole.STAFF)
export class BranchesController {
  constructor(private readonly service: BranchesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Roles(UserRole.CLIENT_ADMIN)
  @Post()
  create(@Body() dto: CreateBranchDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.CLIENT_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateBranchDto>) {
    return this.service.update(id, dto);
  }
}
