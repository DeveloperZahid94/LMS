import { Global, Module } from '@nestjs/common';
import { BalanceService } from './balance.service';

// Global so any feature service can inject BalanceService without import cycles
// (it depends only on the global PrismaService).
@Global()
@Module({
  providers: [BalanceService],
  exports: [BalanceService],
})
export class BalanceModule {}
