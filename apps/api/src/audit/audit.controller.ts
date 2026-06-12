import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtPayload, UserRole } from '@lms/shared';
import { AuditService, TenantAuditQuery } from './audit.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * Tenant-facing audit trail. Always scoped to the caller's own tenant (taken
 * from the JWT, never a query param) so one tenant can never read another's
 * activity. The cross-tenant viewer lives at /admin/audit-logs (SuperAdmin).
 */
@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
@Roles(UserRole.CLIENT_ADMIN, UserRole.BRANCH_ADMIN)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() query: TenantAuditQuery) {
    return this.audit.listForTenant(user.tenantId as string, query);
  }

  @Get('export')
  async export(
    @CurrentUser() user: JwtPayload,
    @Query() query: TenantAuditQuery,
    @Res() res: Response,
  ) {
    const rows = await this.audit.exportForTenant(user.tenantId as string, query);
    const header = ['Time', 'Actor', 'Email', 'Action', 'Method', 'Path', 'Status', 'Duration (ms)', 'IP'];
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.createdAt.toISOString(),
          r.user?.fullName ?? (r.actorType === 'PLATFORM_ADMIN' ? 'SuperAdmin' : ''),
          r.user?.email ?? '',
          r.action,
          r.method ?? '',
          r.path ?? r.entity,
          r.statusCode ?? '',
          r.durationMs ?? '',
          r.ip ?? '',
        ].map(csvCell).join(','),
      );
    }
    const csv = '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${stamp}.csv"`);
    res.send(csv);
  }
}

/** Quote a CSV cell, escaping embedded quotes, per RFC 4180. */
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
