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

    // A reactivated student starts a fresh ledger "stint": only payments/discounts on or
    // after ledgerResetAt count toward the balance, so a prior stint can't skew it.
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { ledgerResetAt: true } as any,
    });
    const resetAt = (student as any)?.ledgerResetAt ?? null;
    const payWhere: any = { tenantId, studentId, status: 'PAID', deletedAt: null };
    if (resetAt) {
      payWhere.OR = [
        { paidAt: { gte: resetAt } },
        { paidAt: null, createdAt: { gte: resetAt } },
      ];
    }

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
        where: payWhere,
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
