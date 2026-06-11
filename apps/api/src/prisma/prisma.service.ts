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

  onModuleInit() {
    // Do NOT await $connect() here. On serverless, if the database is
    // unreachable, an awaited connect HANGS the whole app bootstrap forever →
    // every route times out (504) with no logs. Prisma connects lazily on the
    // first query anyway; kick it off in the background and just log failures so
    // the app always finishes booting and DB errors surface per-request.
    this.$connect().catch((err) =>
      this.logger.error(`Prisma initial $connect failed: ${(err as Error).message}`),
    );
  }

  async onModuleDestroy() {
    await this.$disconnect().catch(() => undefined);
  }
}
