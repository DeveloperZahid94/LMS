import { Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

export class CreateBranchDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(1, 32) code!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
export class BranchesService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
  ) {}

  list() {
    const tenantId = this.tenantCtx.tenantId;
    return this.prisma.branch.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  }

  create(dto: CreateBranchDto) {
    const tenantId = this.tenantCtx.tenantId;
    return this.prisma.branch.create({ data: { tenantId, ...dto } });
  }

  async update(id: string, dto: Partial<CreateBranchDto>) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.prisma.branch.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Branch not found');
    return this.prisma.branch.update({ where: { id }, data: dto });
  }
}
