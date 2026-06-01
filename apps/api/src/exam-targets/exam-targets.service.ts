import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

export const DEFAULT_EXAM_TARGETS = [
  'UPSC', 'SSC', 'Banking', 'RRB', 'NEET', 'JEE',
  'CA', 'CAT', 'GATE', 'State PSC', 'Other',
];

@Injectable()
export class ExamTargetsService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
  ) {}

  list() {
    const tenantId = this.tenantCtx.tenantId;
    return this.prisma.examTarget.findMany({
      where: { tenantId },
      orderBy: [{ isCustom: 'asc' }, { name: 'asc' }],
    });
  }

  async create(name: string) {
    const tenantId = this.tenantCtx.tenantId;
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('name is required');
    if (trimmed.length > 80) throw new BadRequestException('name too long');
    try {
      return await this.prisma.examTarget.create({
        data: { tenantId, name: trimmed, isCustom: true },
      });
    } catch (err: any) {
      // Prisma P2002 → unique constraint violation
      if (err?.code === 'P2002') {
        throw new ConflictException(`"${trimmed}" already exists`);
      }
      throw err;
    }
  }

  async seedDefaults(tenantId: string) {
    await this.prisma.examTarget.createMany({
      data: DEFAULT_EXAM_TARGETS.map((name) => ({ tenantId, name, isCustom: false })),
      skipDuplicates: true,
    });
  }
}
