import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CheckInDto, ManualAttendanceDto } from './dto/check-in.dto';
import { AttendanceSource } from '@lms/shared';

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
  ) {}

  async checkInByQr(dto: CheckInDto) {
    const tenantId = this.tenantCtx.tenantId;
    const student = await this.prisma.student.findFirst({
      where: { tenantId, qrCode: dto.qrCode, status: 'ACTIVE' },
    });
    if (!student) throw new NotFoundException('Invalid QR — student not found');
    return this.upsertTodayAttendance(
      tenantId, dto.branchId, student.id, dto.source ?? AttendanceSource.QR,
    );
  }

  manualCheckIn(dto: ManualAttendanceDto) {
    const tenantId = this.tenantCtx.tenantId;
    return this.upsertTodayAttendance(tenantId, dto.branchId, dto.studentId, AttendanceSource.MANUAL);
  }

  async checkOut(attendanceId: string) {
    const tenantId = this.tenantCtx.tenantId;
    const attendance = await this.prisma.attendance.findFirst({
      where: { id: attendanceId, tenantId },
    });
    if (!attendance) throw new NotFoundException('Attendance not found');
    if (attendance.checkOutAt) throw new ConflictException('Already checked out');
    return this.prisma.attendance.update({
      where: { id: attendanceId },
      data: { checkOutAt: new Date() },
    });
  }

  listForDate(date: string, branchId?: string) {
    const tenantId = this.tenantCtx.tenantId;
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    return this.prisma.attendance.findMany({
      where: { tenantId, date: dayStart, ...(branchId && { branchId }) },
      include: { student: { select: { id: true, code: true, fullName: true, phone: true } } },
      orderBy: { checkInAt: 'desc' },
    });
  }

  private async upsertTodayAttendance(
    tenantId: string, branchId: string, studentId: string, source: AttendanceSource,
  ) {
    const now = new Date();
    const dayStart = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');

    const existing = await this.prisma.attendance.findUnique({
      where: { studentId_date: { studentId, date: dayStart } },
    });
    if (existing) {
      throw new ConflictException('Student already checked in today');
    }
    return this.prisma.attendance.create({
      data: {
        tenantId,
        branchId,
        studentId,
        date: dayStart,
        checkInAt: now,
        source,
      },
    });
  }
}
