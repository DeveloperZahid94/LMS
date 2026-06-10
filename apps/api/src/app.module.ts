import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { StudentsModule } from './students/students.module';
import { ExamTargetsModule } from './exam-targets/exam-targets.module';
import { SeatsModule } from './seats/seats.module';
import { SeatAssignmentsModule } from './seat-assignments/seat-assignments.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PaymentsModule } from './payments/payments.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AdminModule } from './admin/admin.module';
import { CronModule } from './cron/cron.module';
import { AlertsModule } from './alerts/alerts.module';
import { ReportsModule } from './reports/reports.module';
import { PgRoomsModule } from './pg-rooms/pg-rooms.module';
import { TiffinModule } from './tiffin/tiffin.module';
import { ExpensesModule } from './expenses/expenses.module';
import { StaffModule } from './staff/staff.module';
import { BalanceModule } from './balance/balance.module';
import { SettingsModule } from './settings/settings.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuditModule } from './audit/audit.module';
import { EmailModule } from './email/email.module';

import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { TenantGuard } from './tenant/tenant.guard';
import { AuditInterceptor } from './audit/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenantModule,
    FeatureFlagsModule,
    AuditModule,
    IntegrationsModule,
    EmailModule,
    StudentsModule,
    ExamTargetsModule,
    SeatsModule,
    SeatAssignmentsModule,
    AttendanceModule,
    PaymentsModule,
    DashboardModule,
    AdminModule,
    CronModule,
    AlertsModule,
    ReportsModule,
    PgRoomsModule,
    TiffinModule,
    ExpensesModule,
    StaffModule,
    BalanceModule,
    SettingsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
