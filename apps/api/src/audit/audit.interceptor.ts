import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { JwtPayload, UserRole } from '@lms/shared';
import { AuditService } from './audit.service';

/**
 * Global interceptor that records every mutating API call (POST/PUT/PATCH/DELETE)
 * to the audit log. Read requests (GET) are skipped to keep the trail signal-rich.
 *
 * Fire-and-forget: auditing must never block or fail the underlying request,
 * mirroring AuditService.record() which swallows its own errors.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  // Verbs we consider state-changing and therefore worth auditing.
  private static readonly MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method?.toUpperCase();

    if (!AuditInterceptor.MUTATING.has(method)) return next.handle();

    const start = Date.now();
    const user = (req as any).user as JwtPayload | undefined;
    const path = req.originalUrl || req.url;
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || undefined;
    const userAgent = req.headers['user-agent'] as string | undefined;

    const finish = (statusCode: number) => {
      const res = context.switchToHttp().getResponse<Response>();
      this.audit.record({
        tenantId: user?.tenantId ?? null,
        userId: user?.sub ?? null,
        action: `HTTP ${method}`,
        entity: this.normalizePath(path),
        method,
        path,
        statusCode: statusCode ?? res?.statusCode,
        durationMs: Date.now() - start,
        actorType: user?.role === UserRole.SUPER_ADMIN ? 'PLATFORM_ADMIN' : 'USER',
        ip,
        userAgent,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => finish(context.switchToHttp().getResponse<Response>()?.statusCode ?? 200),
        error: (err) => finish(err?.status ?? err?.statusCode ?? 500),
      }),
    );
  }

  /** Collapse UUIDs/ids in the path into `:id` so the entity column groups cleanly. */
  private normalizePath(path: string): string {
    return path
      .split('?')[0]
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id');
  }
}
