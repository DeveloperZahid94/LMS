import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, RazorpayCreateOrderDto, RazorpayVerifyDto } from './dto/payment.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaymentStatus, UserRole } from '@lms/shared';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
@Roles(UserRole.STAFF)
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  list(
    @Query('branchId') branchId?: string,
    @Query('status') status?: PaymentStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: 'date' | 'amount' | 'student',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      branchId, status, dateFrom, dateTo, search, sortBy, sortOrder,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @Get('students/:studentId/summary')
  studentSummary(@Param('studentId') studentId: string) {
    return this.service.studentSummary(studentId);
  }

  @Post('manual')
  recordManual(@Body() dto: CreatePaymentDto) {
    return this.service.recordManual(dto);
  }

  @Roles(UserRole.CLIENT_ADMIN)
  @Post(':id/delete')
  softDelete(@Param('id') id: string, @Body() dto: { reason?: string }) {
    return this.service.softDelete(id, dto?.reason);
  }

  @Post(':id/email-receipt')
  emailReceipt(@Param('id') id: string) {
    return this.service.emailReceipt(id);
  }

  @Post('razorpay/order')
  createOrder(@Body() dto: RazorpayCreateOrderDto) {
    return this.service.createRazorpayOrder(dto);
  }

  @Post('razorpay/verify')
  verify(@Body() dto: RazorpayVerifyDto) {
    return this.service.verifyRazorpay(dto);
  }
}
