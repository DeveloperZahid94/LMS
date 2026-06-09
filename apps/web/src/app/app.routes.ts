import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { superAdminGuard } from './core/guards/super-admin.guard';
import { studentGuard } from './core/guards/student.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'student-login',
    loadComponent: () => import('./features/auth/student-login.component').then((m) => m.StudentLoginComponent),
  },
  {
    path: 'checkin',
    canActivate: [studentGuard],
    loadComponent: () => import('./features/attendance/checkin.component').then((m) => m.CheckinComponent),
  },
  {
    path: 'superadmin',
    loadComponent: () =>
      import('./features/auth/superadmin-login.component').then((m) => m.SuperadminLoginComponent),
  },
  { path: 'super-admin', redirectTo: 'superadmin', pathMatch: 'full' },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'students',
        loadComponent: () =>
          import('./features/students/students-list.component').then((m) => m.StudentsListComponent),
      },
      {
        path: 'students/new',
        loadComponent: () =>
          import('./features/students/student-form.component').then((m) => m.StudentFormComponent),
      },
      {
        path: 'students/:id/profile',
        loadComponent: () =>
          import('./features/students/student-profile.component').then((m) => m.StudentProfileComponent),
      },
      {
        path: 'students/:id',
        loadComponent: () =>
          import('./features/students/student-form.component').then((m) => m.StudentFormComponent),
      },
      {
        path: 'seats',
        loadComponent: () =>
          import('./features/seats/seats-list.component').then((m) => m.SeatsListComponent),
      },
      {
        path: 'pg-rooms',
        loadComponent: () =>
          import('./features/pg-rooms/pg-rooms.component').then((m) => m.PgRoomsComponent),
      },
      {
        path: 'tiffin',
        loadComponent: () =>
          import('./features/tiffin/tiffin.component').then((m) => m.TiffinComponent),
      },
      {
        path: 'expenses',
        loadComponent: () =>
          import('./features/expenses/expenses.component').then((m) => m.ExpensesComponent),
      },
      {
        path: 'whatsapp',
        loadComponent: () =>
          import('./features/whatsapp/whatsapp.component').then((m) => m.WhatsappComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'attendance',
        loadComponent: () =>
          import('./features/attendance/attendance.component').then((m) => m.AttendanceComponent),
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('./features/payments/payments.component').then((m) => m.PaymentsComponent),
      },
      {
        path: 'alerts',
        loadComponent: () =>
          import('./features/alerts/alerts.component').then((m) => m.AlertsComponent),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'reports/attendance',
        loadComponent: () =>
          import('./features/reports/attendance-report.component').then((m) => m.AttendanceReportComponent),
      },
      {
        path: 'change-password',
        loadComponent: () =>
          import('./features/auth/change-password.component').then((m) => m.ChangePasswordComponent),
      },
      // ----- SuperAdmin (platform owner) section -----
      {
        path: 'admin/tenants',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./features/admin/tenants-list.component').then((m) => m.TenantsListComponent),
      },
      {
        path: 'admin/tenants/:id',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./features/admin/tenant-detail.component').then((m) => m.TenantDetailComponent),
      },
      {
        path: 'admin/audit',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./features/admin/audit-log.component').then((m) => m.AuditLogComponent),
      },
      {
        path: 'admin/database',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./features/admin/database-console.component').then((m) => m.DatabaseConsoleComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
