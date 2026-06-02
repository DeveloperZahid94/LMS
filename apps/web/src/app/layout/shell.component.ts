import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FeatureKey } from '@lms/shared';
import { AuthService } from '../core/services/auth.service';
import { ThemeService } from '../core/services/theme.service';
import { ToastContainerComponent } from '../shared/components/toast-container.component';
import { AlertsApiService } from '../features/alerts/alerts.service';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  /** When set, the item only shows for tenants that have this feature enabled. */
  feature?: FeatureKey;
}

@Component({
  selector: 'lms-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ToastContainerComponent],
  template: `
    <lms-toast-container />
    <div class="drawer lg:drawer-open min-h-screen bg-base-200">
      <input id="lms-drawer" type="checkbox" class="drawer-toggle" />

      <!-- Page content -->
      <div class="drawer-content flex flex-col">
        <!-- Top navbar -->
        <header class="navbar bg-base-100/80 backdrop-blur-md border-b border-base-300 px-4 sticky top-0 z-10 min-h-[3.5rem]">
          <div class="flex-none">
            <!-- Hamburger: toggles desktop collapse, opens drawer on mobile -->
            <label for="lms-drawer" class="btn btn-ghost btn-square btn-sm lg:hidden" title="Open menu">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </label>
            <button type="button" class="btn btn-ghost btn-square btn-sm hidden lg:inline-flex"
                    (click)="toggleCollapsed()"
                    [title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          <div class="flex-1"></div>

          <div class="flex-none gap-1">
            <button class="btn btn-ghost btn-circle btn-sm relative" (click)="goAlerts()" title="Alerts">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span *ngIf="alertCount() > 0"
                    class="badge badge-error badge-xs absolute -top-0.5 -right-0.5 font-semibold">
                {{ alertCount() > 99 ? '99+' : alertCount() }}
              </span>
            </button>
            <button class="btn btn-ghost btn-circle btn-sm" (click)="theme.toggle()" [title]="theme.theme() === 'dark' ? 'Light mode' : 'Dark mode'">
              <span *ngIf="theme.theme() === 'dark'">☀</span>
              <span *ngIf="theme.theme() === 'light'">☾</span>
            </button>
            <div class="dropdown dropdown-end" *ngIf="auth.user() as u">
              <div tabindex="0" role="button" class="btn btn-ghost btn-sm flex items-center gap-2 normal-case">
                <div class="avatar placeholder">
                  <div class="bg-gradient-to-br from-primary to-secondary text-primary-content rounded-full w-8">
                    <span class="text-xs font-semibold">{{ initials(u.fullName) }}</span>
                  </div>
                </div>
                <div class="text-left hidden md:block">
                  <div class="text-sm font-medium leading-tight">{{ u.fullName }}</div>
                  <div class="text-[10px] opacity-60 leading-tight uppercase tracking-wider">{{ u.role }}</div>
                </div>
              </div>
              <ul tabindex="0" class="menu dropdown-content bg-base-100 rounded-box shadow-lg z-30 mt-2 w-56 p-2 border border-base-300">
                <li class="menu-title text-xs truncate">{{ u.email }}</li>
                <li><a routerLink="/settings"><span>⚙</span> Settings</a></li>
                <li><a (click)="auth.logout()" class="text-error"><span>⤴</span> Sign out</a></li>
              </ul>
            </div>
          </div>
        </header>

        <main class="flex-1 px-6 pt-3 pb-6 overflow-auto">
          <router-outlet />
        </main>
      </div>

      <!-- =============================== SIDEBAR =============================== -->
      <aside class="drawer-side z-20">
        <label for="lms-drawer" class="drawer-overlay"></label>
        <div class="bg-base-100 min-h-full border-r border-base-300 flex flex-col transition-[width] duration-300 ease-in-out shadow-sm"
             [class.w-64]="!collapsed()"
             [class.w-16]="collapsed()">

          <!-- Brand block — matched to header height so logo & hamburger sit on the same row -->
          <div class="min-h-[3.5rem] px-3 border-b border-base-300 flex items-center gap-3"
               [class.justify-center]="collapsed()">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary text-primary-content grid place-items-center font-bold text-base shadow-sm shrink-0">
              L
            </div>
            <div class="overflow-hidden transition-opacity leading-tight"
                 [class.opacity-0]="collapsed()"
                 [class.pointer-events-none]="collapsed()"
                 [class.w-0]="collapsed()">
              <div class="font-semibold whitespace-nowrap text-sm">LMS Platform</div>
              <div class="text-[10px] opacity-60 whitespace-nowrap truncate uppercase tracking-wider">{{ auth.user()?.tenantSlug || 'platform' }}</div>
            </div>
          </div>

          <!-- Nav items -->
          <ul class="flex-1 px-2 pt-3 pb-1 space-y-0.5 overflow-y-auto">
            <li *ngFor="let n of nav()">
              <a [routerLink]="n.path"
                 routerLinkActive="lms-nav-active"
                 [routerLinkActiveOptions]="{ exact: false }"
                 class="lms-nav-link"
                 [class.lms-nav-link--collapsed]="collapsed()"
                 [title]="collapsed() ? n.label : ''">
                <span class="lms-nav-icon">{{ n.icon }}</span>
                <span class="lms-nav-label" [class.hidden]="collapsed()">{{ n.label }}</span>
              </a>
            </li>
          </ul>

          <!-- Footer / user summary (only when expanded) -->
          <div class="border-t border-base-300 px-3 py-3 transition-opacity"
               [class.opacity-0]="collapsed()"
               [class.h-0]="collapsed()"
               [class.py-0]="collapsed()"
               [class.overflow-hidden]="collapsed()"
               *ngIf="auth.user() as u">
            <div class="flex items-center gap-2 text-xs">
              <div class="w-8 h-8 rounded-full bg-base-200 grid place-items-center font-semibold shrink-0">
                {{ initials(u.fullName) }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-medium truncate">{{ u.fullName }}</div>
                <div class="opacity-60 truncate text-[10px] uppercase tracking-wider">{{ u.role }}</div>
              </div>
              <button class="btn btn-ghost btn-xs btn-square" (click)="auth.logout()" title="Sign out">⤴</button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  `,
  styles: [`
    /* ----- Sidebar nav-link styling (more aesthetic than DaisyUI's default menu) ----- */
    .lms-nav-link {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.55rem 0.75rem;
      border-radius: 0.625rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: hsl(var(--bc) / 0.75);
      transition: background-color .18s ease, color .18s ease, transform .12s ease;
      cursor: pointer;
      position: relative;
    }
    .lms-nav-link:hover {
      background: hsl(var(--b2));
      color: hsl(var(--bc));
    }
    .lms-nav-link.lms-nav-active {
      background: linear-gradient(90deg, hsl(var(--p) / 0.12), hsl(var(--p) / 0.04));
      color: hsl(var(--p));
      font-weight: 600;
    }
    .lms-nav-link.lms-nav-active::before {
      content: '';
      position: absolute;
      left: -0.5rem;
      top: 25%;
      bottom: 25%;
      width: 3px;
      background: hsl(var(--p));
      border-radius: 999px;
    }
    .lms-nav-link.lms-nav-link--collapsed {
      justify-content: center;
      padding: 0.55rem 0;
    }
    .lms-nav-link.lms-nav-link--collapsed.lms-nav-active::before {
      left: -0.25rem;
    }
    .lms-nav-icon {
      width: 1.75rem;
      height: 1.75rem;
      display: inline-grid;
      place-items: center;
      flex-shrink: 0;
      font-size: 1rem;
      border-radius: 0.5rem;
      background: hsl(var(--b2));
      transition: background-color .18s ease, color .18s ease, transform .12s ease;
    }
    .lms-nav-link:hover .lms-nav-icon {
      transform: scale(1.05);
    }
    .lms-nav-link.lms-nav-active .lms-nav-icon {
      background: hsl(var(--p));
      color: hsl(var(--pc));
    }
    .lms-nav-label {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `],
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  private router = inject(Router);
  private alertsApi = inject(AlertsApiService);
  collapsed = signal(this.readCollapsed());
  alertCount = signal(0);

  ngOnInit() {
    this.refreshAlerts();
    // Refresh the bell count every 60s so it stays roughly fresh while staff browse.
    setInterval(() => this.refreshAlerts(), 60_000);
  }

  toggleCollapsed() {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try { localStorage.setItem('lms.shell.collapsed', next ? '1' : '0'); } catch {}
  }
  private readCollapsed(): boolean {
    try { return localStorage.getItem('lms.shell.collapsed') === '1'; } catch { return false; }
  }

  refreshAlerts() {
    this.alertsApi.list().subscribe({
      next: (r) => this.alertCount.set(r.counts.total),
      error: () => { /* swallow — bell just stays at last known value */ },
    });
  }

  goAlerts() { this.router.navigate(['/alerts']); }

  // Core tenant menu. `feature`-tagged items are hidden when the tenant's plan
  // doesn't include that feature (SuperAdmin toggles these per tenant).
  private readonly baseNav: NavItem[] = [
    { label: 'Dashboard', icon: '◊', path: '/dashboard', feature: FeatureKey.DASHBOARD },
    { label: 'Students', icon: '☺', path: '/students', feature: FeatureKey.STUDENTS },
    { label: 'Seats', icon: '☐', path: '/seats', feature: FeatureKey.SEATS },
    { label: 'PG Rooms', icon: '🛏', path: '/pg-rooms', feature: FeatureKey.PG_ROOMS },
    { label: 'Attendance', icon: '✓', path: '/attendance', feature: FeatureKey.QR_ATTENDANCE },
    { label: 'Payments', icon: '₹', path: '/payments', feature: FeatureKey.PAYMENT_GATEWAY },
    { label: 'Alerts',   icon: '⚠', path: '/alerts', feature: FeatureKey.ALERTS },
    { label: 'WhatsApp', icon: '💬', path: '/whatsapp', feature: FeatureKey.WHATSAPP },
    { label: 'Reports',  icon: '📊', path: '/reports', feature: FeatureKey.REPORTS },
    { label: 'Settings', icon: '⚙', path: '/settings', feature: FeatureKey.SETTINGS },
  ];

  // Platform-owner menu — only the SuperAdmin sees these.
  private readonly adminNav: NavItem[] = [
    { label: 'Tenants', icon: '🏢', path: '/admin/tenants' },
    { label: 'Audit Log', icon: '📜', path: '/admin/audit' },
    { label: 'Database', icon: '🗄', path: '/admin/database' },
  ];

  nav = computed<NavItem[]>(() => {
    const user = this.auth.user();
    // SuperAdmin operates across tenants — show the platform console, not tenant screens.
    if (user?.role === 'SUPER_ADMIN') return this.adminNav;
    // Tenant users: hide feature-gated items their plan doesn't include.
    return this.baseNav.filter((n) => !n.feature || this.auth.hasFeature(n.feature));
  });

  initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }
}
