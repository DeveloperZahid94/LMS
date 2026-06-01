import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
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
    ],
  },
  { path: '**', redirectTo: '' },
];
