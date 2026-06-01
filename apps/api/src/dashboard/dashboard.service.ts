import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { DashboardSummary, TimeSeriesPoint } from '@lms/shared';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
  ) {}

  async summary(branchId?: string): Promise<DashboardSummary> {
    const tenantId = this.tenantCtx.tenantId;
    const branchFilter = branchId ? { branchId } : {};

    const now = new Date();
    const todayStart = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

    const [
      totalStudents, activeStudents, totalSeats, occupiedSeats,
      todayCheckIns, monthRevenue, duePaymentsCount, expiringSoon,
    ] = await Promise.all([
      this.prisma.student.count({ where: { tenantId, ...branchFilter } }),
      this.prisma.student.count({ where: { tenantId, status: 'ACTIVE', ...branchFilter } }),
      this.prisma.seat.count({ where: { tenantId, isActive: true, ...branchFilter } }),
      this.prisma.seatAssignment.count({ where: { tenantId, status: { in: ['TEMPORARY', 'CONFIRMED'] } } }),
      this.prisma.attendance.count({ where: { tenantId, date: todayStart, ...branchFilter } }),
      this.prisma.payment.aggregate({
        where: { tenantId, status: 'PAID', paidAt: { gte: monthStart }, ...branchFilter },
        _sum: { amount: true },
      }),
      this.prisma.payment.count({ where: { tenantId, status: 'PENDING', ...branchFilter } }),
      this.prisma.studentPlanEnrollment.count({
        where: {
          tenantId,
          status: 'ACTIVE',
          endDate: { lte: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
        },
      }),
    ]);

    const attendanceLast7Days = await this.attendanceSeries(tenantId, branchId, sevenDaysAgo);
    const revenueLast6Months = await this.revenueSeries(tenantId, branchId);
    const seatOccupancyByZone = await this.seatsByZone(tenantId, branchId);

    return {
      kpis: {
        totalStudents,
        activeStudents,
        totalSeats,
        occupiedSeats,
        todayCheckIns,
        monthRevenue: Number(monthRevenue._sum.amount ?? 0),
        duePaymentsCount,
        expiringSoonCount: expiringSoon,
      },
      charts: { attendanceLast7Days, revenueLast6Months, seatOccupancyByZone },
    };
  }

  private async attendanceSeries(
    tenantId: string, branchId: string | undefined, since: Date,
  ): Promise<TimeSeriesPoint[]> {
    const records = await this.prisma.attendance.findMany({
      where: { tenantId, date: { gte: since }, ...(branchId && { branchId }) },
      select: { date: true },
    });
    const counts = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(since); d.setUTCDate(since.getUTCDate() + i);
      counts.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of records) {
      const key = r.date.toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, value]) => ({ label, value }));
  }

  private async revenueSeries(
    tenantId: string, branchId: string | undefined,
  ): Promise<TimeSeriesPoint[]> {
    const months: TimeSeriesPoint[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const agg = await this.prisma.payment.aggregate({
        where: {
          tenantId,
          status: 'PAID',
          paidAt: { gte: start, lt: end },
          ...(branchId && { branchId }),
        },
        _sum: { amount: true },
      });
      months.push({
        label: start.toLocaleString('en', { month: 'short' }),
        value: Number(agg._sum.amount ?? 0),
      });
    }
    return months;
  }

  private async seatsByZone(
    tenantId: string, branchId: string | undefined,
  ): Promise<TimeSeriesPoint[]> {
    const seats = await this.prisma.seat.groupBy({
      by: ['zone'],
      where: { tenantId, isActive: true, ...(branchId && { branchId }) },
      _count: { _all: true },
    });
    return seats.map((s) => ({ label: s.zone ?? 'Unzoned', value: s._count._all }));
  }
}
