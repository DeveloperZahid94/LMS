import { Body, Controller, Get, Post, Query } from '@nestjs/common';
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
    @Query('limit') limit?: string,
  ) {
    return this.service.list(branchId, status, { dateFrom, dateTo, limit: limit ? +limit : undefined });
  }

  @Post('manual')
  recordManual(@Body() dto: CreatePaymentDto) {
    return this.service.recordManual(dto);
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
