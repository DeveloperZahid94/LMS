import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, ExpenseListQueryDto, PayExpenseDto, UpdateExpenseDto } from './dto/expenses.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
@Roles(UserRole.STAFF)
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  list(@Query() q: ExpenseListQueryDto) {
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
  create(@Body() dto: CreateExpenseDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto) {
    return this.service.update(id, dto);
  }

  /** Record a payment against a credit (pay-later) expense. */
  @Post(':id/pay')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayExpenseDto) {
    return this.service.pay(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
