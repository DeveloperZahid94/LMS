import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Single source of truth for a student's account balance.
 *
 * The stored `student.outstandingBalance` is materialised (not an incremental
 * ledger): it always equals
 *
 *     expected − paid − discount
 *
 * where `expected` = SUM(monthlyRate) of the student's ACTIVE billable
 * accommodations (cabin/seat + PG bed + tiffin) and `paid`/`discount` come from
 * their PAID, non-deleted payments. This is the exact formula the Reports
 * by-student view uses (for an all-time window), so the profile, payment modal,
 * alerts, student list and Reports never drift.
 *
 * Signed: > 0 = due, < 0 = advance/credit, 0 = settled.
 *
 * Call recompute() after ANY event that changes a student's accommodations or
 * payments (allocate/end, payment record/delete, tiffin collect, settle, …).
 */
@Injectable()
export class BalanceService {
  constructor(private prisma: PrismaService) {}

  async recompute(tenantId: string, studentId: string): Promise<number> {
    const db = this.prisma as any;
    const [seat, pg, tiffin, pay] = await Promise.all([
      this.prisma.seatAssignment.aggregate({
        where: { tenantId, studentId, status: { in: ['TEMPORARY', 'CONFIRMED'] } },
        _sum: { monthlyRate: true },
      }),
      db.pgRoomAssignment.aggregate({
        where: { tenantId, studentId, status: 'ACTIVE' },
        _sum: { monthlyRate: true },
      }),
      db.tiffinSubscription.aggregate({
        where: { tenantId, studentId, status: 'ACTIVE' },
        _sum: { monthlyRate: true },
      }),
      this.prisma.payment.aggregate({
        where: { tenantId, studentId, status: 'PAID', deletedAt: null },
        _sum: { amount: true, discount: true },
      }),
    ]);

    const expected =
      Number(seat._sum.monthlyRate ?? 0) +
      Number(pg._sum.monthlyRate ?? 0) +
      Number(tiffin._sum.monthlyRate ?? 0);
    const paid = Number(pay._sum.amount ?? 0);
    const discount = Number(pay._sum.discount ?? 0);

    const balance = Number((expected - paid - discount).toFixed(2));
    await this.prisma.student.update({
      where: { id: studentId },
      data: { outstandingBalance: balance },
    });
    return balance;
  }
}
