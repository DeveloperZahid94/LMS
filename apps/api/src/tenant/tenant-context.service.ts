import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { JwtPayload, UserRole } from '@lms/shared';

@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  constructor(@Inject(REQUEST) private readonly req: { user?: JwtPayload }) {}

  get user(): JwtPayload | undefined {
    return this.req.user;
  }

  /**
   * Returns the tenantId every business-layer query MUST scope to.
   * Throws if no tenant context exists (e.g. SuperAdmin calling a tenant-scoped endpoint
   * without ?tenantId override — those routes should add explicit handling).
   */
  get tenantId(): string {
    const id = this.req.user?.tenantId;
    if (!id) throw new Error('No tenant in request context');
    return id;
  }

  get optionalTenantId(): string | null {
    return this.req.user?.tenantId ?? null;
  }

  get isSuperAdmin(): boolean {
    return this.req.user?.role === UserRole.SUPER_ADMIN;
  }

  get userId(): string | undefined {
    return this.req.user?.sub;
  }
}
