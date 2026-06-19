import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ReactivateStudentDto } from './dto/reactivate-student.dto';
import { ListStudentsDto } from './dto/list-students.dto';
import { SettleBalanceDto } from './dto/settle-balance.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('students')
@ApiBearerAuth()
@Controller('students')
@Roles(UserRole.STAFF) // STAFF and above (BranchAdmin, ClientAdmin, SuperAdmin)
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  list(@Query() query: ListStudentsDto) {
    return this.service.list(query);
  }

  /** Lookup previously-left students (for the "returning student?" search). Declared before :id. */
  @Roles(UserRole.BRANCH_ADMIN)
  @Get('reactivatable')
  reactivatable(@Query('search') search: string) {
    return this.service.findReactivatable(search ?? '');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles(UserRole.BRANCH_ADMIN)
  @Post()
  create(@Body() dto: CreateStudentDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.BRANCH_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.BRANCH_ADMIN)
  @Post(':id/reactivate')
  reactivate(@Param('id') id: string, @Body() dto: ReactivateStudentDto) {
    return this.service.reactivate(id, dto);
  }

  @Roles(UserRole.CLIENT_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Roles(UserRole.BRANCH_ADMIN)
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() dto: { newPassword?: string }) {
    return this.service.resetPassword(id, dto?.newPassword);
  }

  @Roles(UserRole.STAFF)
  @Post(':id/settle-balance')
  settleBalance(@Param('id') id: string, @Body() dto: SettleBalanceDto) {
    return this.service.settleBalance(id, dto);
  }
}
