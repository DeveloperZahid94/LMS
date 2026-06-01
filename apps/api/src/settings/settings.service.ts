import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

/** Sensible defaults for any field we expose on the Settings screen. */
const DEFAULTS = {
  sms: {
    provider: 'msg91' as const,
    apiKey: '',
    senderId: '',
    templates: { day7: '', dueToday: '', overdue: '' },
    schedule: { day7Enabled: true, dueTodayEnabled: true, overdueEnabled: true, hour: 9 },
  },
  biometric: {
    ipAddress: '',
    port: 4370,
    password: '',
    mockMode: true,
  },
  security: {
    autoLogoutMin: 30,
    allowMultipleSessions: false,
    failedLoginLockoutEnabled: true,
    failedLoginAttempts: 5,
    lockoutDurationMin: 30,
    newDeviceLoginAlert: true,
  },
  backup: {
    autoEnabled: false,
    time: '03:00',
    frequency: 'daily' as 'daily' | 'weekly',
    retentionDays: 30,
  },
  business: {
    address: '',
    city: '',
    state: '',
    pincode: '',
    gstin: '',
  },
};

export type SettingsShape = typeof DEFAULTS;

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
  ) {}

  // Raw SQL on purpose: the new `tenant_settings` table isn't in the generated
  // Prisma client until `npx prisma generate` is re-run. Using $queryRaw lets
  // Settings work as soon as the SQL migration (010_tenant_settings.sql) runs,
  // regardless of Prisma client regeneration state.
  private get db(): any { return this.prisma as any; }

  async get() {
    const tenantId = this.tenantCtx.tenantId;
    const rows = await this.prisma.$queryRaw<Array<{ data: any }>>`
      SELECT data FROM tenant_settings WHERE "tenantId" = ${tenantId} LIMIT 1
    `;
    const stored = rows[0]?.data ?? {};
    return this.merged(stored);
  }

  async update(patch: any) {
    const tenantId = this.tenantCtx.tenantId;
    const current = await this.get();
    const merged = this.merged(patch, current);
    const json = JSON.stringify(merged);
    await this.prisma.$executeRaw`
      INSERT INTO tenant_settings (id, "tenantId", data, "updatedAt")
      VALUES (gen_random_uuid()::text, ${tenantId}, ${json}::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT ("tenantId")
      DO UPDATE SET data = ${json}::jsonb, "updatedAt" = CURRENT_TIMESTAMP
    `;
    return merged;
  }

  /**
   * Mock biometric "Test Connection". Returns ok=true after a small delay if
   * mockMode is on, or whenever the IP looks like a private-network address.
   * Real implementation would open a TCP socket to ipAddress:port using the
   * ZKTeco protocol; out of scope for this iteration.
   */
  async testBiometric(ipAddress: string, port: number, password: string, mockMode: boolean) {
    void password; // eslint-disable-line @typescript-eslint/no-unused-vars
    if (mockMode) {
      await new Promise((r) => setTimeout(r, 600));
      return { ok: true, message: 'Mock mode: simulated successful handshake.', mode: 'mock' };
    }
    // Cheap heuristic: require a private-network IP and a port in 1..65535.
    const looksPrivate = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ipAddress ?? '');
    const portOk = Number.isInteger(port) && port > 0 && port < 65536;
    await new Promise((r) => setTimeout(r, 400));
    if (looksPrivate && portOk) {
      return { ok: true, message: 'Configuration looks valid. Live device handshake is not yet wired up — contact Support to enable the Securecure SDK.', mode: 'config-only' };
    }
    return { ok: false, message: 'IP / port look invalid for a LAN device.', mode: 'config-only' };
  }

  /**
   * Builds a JSON "backup" of the tenant's main tables. Not a true pg_dump;
   * gives the user a portable archive of their data they can download and
   * re-import or just keep offsite.
   */
  async backupBundle() {
    const tenantId = this.tenantCtx.tenantId;
    const where = { tenantId };
    const [students, payments, seats, seatAssignments, pgRooms, pgAssignments, branches] = await Promise.all([
      this.prisma.student.findMany({ where }),
      this.prisma.payment.findMany({ where }),
      this.prisma.seat.findMany({ where }),
      this.prisma.seatAssignment.findMany({ where }),
      this.db.pgRoom.findMany({ where }),
      this.db.pgRoomAssignment.findMany({ where }),
      this.prisma.branch.findMany({ where }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      tenantId,
      version: 1,
      tables: {
        branches,
        students,
        payments,
        seats,
        seatAssignments,
        pgRooms,
        pgAssignments,
      },
      counts: {
        branches: branches.length,
        students: students.length,
        payments: payments.length,
        seats: seats.length,
        seatAssignments: seatAssignments.length,
        pgRooms: pgRooms.length,
        pgAssignments: pgAssignments.length,
      },
    };
  }

  private merged(patch: any, base: any = DEFAULTS): SettingsShape {
    // Deep-merge two levels (sections + their fields).
    const out: any = { ...base };
    for (const key of Object.keys(patch ?? {})) {
      if (patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key])) {
        out[key] = { ...(base?.[key] ?? {}), ...patch[key] };
      } else {
        out[key] = patch[key];
      }
    }
    // Make sure all top-level sections exist with their defaults filled in.
    for (const section of Object.keys(DEFAULTS) as (keyof SettingsShape)[]) {
      out[section] = { ...(DEFAULTS[section] as any), ...(out[section] ?? {}) };
    }
    return out as SettingsShape;
  }
}
