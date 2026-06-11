import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    // Don't let an eager-connect failure crash the whole serverless function on
    // boot (that surfaces as an opaque FUNCTION_INVOCATION_FAILED on every
    // route). Prisma connects lazily on first query anyway; log and continue so
    // the actual error is visible per-request instead of taking the app down.
    try {
      await this.$connect();
    } catch (err) {
      this.logger.error(`Prisma initial $connect failed: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect().catch(() => undefined);
  }
}
