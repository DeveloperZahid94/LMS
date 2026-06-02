import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  AllSettings, BackupSettings, BiometricSettings, BusinessSettings, ProfileResponse,
  SecuritySettings, SettingsApiService, SmsSettings,
} from './settings.service';
import { StudentsApiService } from '../students/students.service';
import { PaymentsApiService } from '../payments/payments.service';
import { ToastService } from '../../core/services/toast.service';
import { ExportColumn, exportCsv } from '../../shared/utils/export.util';
import { AuthService } from '../../core/services/auth.service';

type Section = 'profile' | 'business' | 'sms' | 'backup' | 'biometric' | 'security' | 'about';

@Component({
  selector: 'lms-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="mb-4">
      <h1 class="text-2xl font-bold">Settings</h1>
      <p class="text-sm opacity-60">Manage your account and system preferences</p>
    </div>

    <!-- =========================== TABS =========================== -->
    <div role="tablist" class="tabs tabs-boxed bg-base-200 mb-4 flex flex-wrap gap-1 p-1">
      <a *ngFor="let s of sections" role="tab" class="tab gap-1.5"
         [class.tab-active]="section() === s.key"
         (click)="section.set(s.key)">
        <span>{{ s.icon }}</span><span class="hidden sm:inline">{{ s.label }}</span>
      </a>
    </div>

    <!-- =========================== PROFILE =========================== -->
    <ng-container *ngIf="section() === 'profile'">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <!-- Admin profile -->
        <div class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-5">
            <div class="font-bold text-lg mb-3">Admin Profile</div>
            <div class="flex flex-col items-center gap-2 mb-4">
              <div class="w-24 h-24 rounded-full grid place-items-center bg-primary text-primary-content text-2xl font-bold">
                {{ initials(profile()?.fullName) }}
              </div>
              <button class="btn btn-outline btn-sm" (click)="comingSoon('Photo upload')">Change Photo</button>
              <span class="badge badge-ghost">{{ profile()?.role }}</span>
            </div>
            <form [formGroup]="profileForm" (ngSubmit)="saveProfile()" class="space-y-3">
              <label class="form-control">
                <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Full name</span></div>
                <input class="input input-bordered" formControlName="fullName" />
              </label>
              <label class="form-control">
                <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Email address</span></div>
                <input class="input input-bordered" type="email" formControlName="email" />
              </label>
              <label class="form-control">
                <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Phone number</span></div>
                <input class="input input-bordered" formControlName="phone" placeholder="+91xxxxxxxxxx" />
              </label>
              <label class="form-control">
                <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Role</span></div>
                <input class="input input-bordered" [value]="profile()?.role" readonly />
              </label>
              <div class="flex justify-end">
                <button type="submit" class="btn btn-primary" [disabled]="savingProfile()">
                  <span *ngIf="savingProfile()" class="loading loading-spinner loading-sm"></span>
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Change password -->
        <div class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-5">
            <div class="font-bold text-lg mb-3">Change Password</div>
            <form [formGroup]="pwForm" (ngSubmit)="savePassword()" class="space-y-3">
              <label class="form-control">
                <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Current password</span></div>
                <div class="join">
                  <input class="input input-bordered join-item flex-1"
                         [type]="showPw().current ? 'text' : 'password'" formControlName="currentPassword" />
                  <button type="button" class="btn join-item" (click)="togglePw('current')">{{ showPw().current ? 'Hide' : 'Show' }}</button>
                </div>
              </label>
              <label class="form-control">
                <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">New password</span></div>
                <input class="input input-bordered" [type]="showPw().next ? 'text' : 'password'" formControlName="newPassword" />
              </label>
              <label class="form-control">
                <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Confirm new password</span></div>
                <input class="input input-bordered" [type]="showPw().confirm ? 'text' : 'password'" formControlName="confirmPassword" />
              </label>
              <div class="text-xs opacity-60">Minimum 8 characters. Use a mix of letters, numbers and symbols.</div>
              <div class="flex justify-end">
                <button type="submit" class="btn btn-primary" [disabled]="savingPw()">
                  <span *ngIf="savingPw()" class="loading loading-spinner loading-sm"></span>
                  Update password
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- =========================== BUSINESS =========================== -->
    <ng-container *ngIf="section() === 'business'">
      <form [formGroup]="businessForm" (ngSubmit)="saveSection('business')">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-5">
              <div class="font-bold text-lg mb-3">Location</div>
              <div class="space-y-3">
                <label class="form-control">
                  <div class="label py-1"><span class="label-text">Address</span></div>
                  <textarea class="textarea textarea-bordered" rows="2" formControlName="address" placeholder="Street, house number, area"></textarea>
                </label>
                <label class="form-control">
                  <div class="label py-1"><span class="label-text">City</span></div>
                  <input class="input input-bordered" formControlName="city" />
                </label>
                <div class="grid grid-cols-2 gap-3">
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">State</span></div>
                    <input class="input input-bordered" formControlName="state" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">PIN code</span></div>
                    <input class="input input-bordered" formControlName="pincode" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-5">
              <div class="font-bold text-lg mb-3">Tax &amp; Compliance</div>
              <label class="form-control">
                <div class="label py-1"><span class="label-text">GSTIN</span></div>
                <input class="input input-bordered" formControlName="gstin" placeholder="optional" />
                <div class="text-xs opacity-60 mt-1">Shown on receipts and invoices when set.</div>
              </label>
            </div>
          </div>
        </div>
        <div class="flex justify-end mt-4">
          <button type="submit" class="btn btn-primary" [disabled]="savingSection()">Save Business Info</button>
        </div>
      </form>
    </ng-container>

    <!-- =========================== SMS & REMINDERS =========================== -->
    <ng-container *ngIf="section() === 'sms'">
      <form [formGroup]="smsForm" (ngSubmit)="saveSection('sms')">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <!-- Connection -->
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-5">
              <div class="font-bold text-lg">MSG91 Connection</div>
              <div class="text-sm opacity-60 mb-2">API credentials &amp; DLT templates</div>

              <div class="alert mb-3 py-2"
                   [class.alert-error]="!smsForm.value.apiKey"
                   [class.alert-success]="!!smsForm.value.apiKey">
                <span class="inline-block w-2 h-2 rounded-full"
                      [class.bg-error]="!smsForm.value.apiKey"
                      [class.bg-success]="!!smsForm.value.apiKey"></span>
                <span class="text-sm" *ngIf="!smsForm.value.apiKey"><strong>Not connected</strong> — add your API key</span>
                <span class="text-sm" *ngIf="!!smsForm.value.apiKey"><strong>Configured.</strong> Live sending needs Support to enable it.</span>
              </div>

              <div class="space-y-3">
                <label class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">API key</span></div>
                  <div class="join">
                    <input class="input input-bordered join-item flex-1"
                           [type]="showApiKey() ? 'text' : 'password'"
                           formControlName="apiKey" placeholder="Enter MSG91 API key" />
                    <button type="button" class="btn join-item" (click)="showApiKey.set(!showApiKey())">{{ showApiKey() ? 'Hide' : 'Show' }}</button>
                  </div>
                  <div class="text-xs opacity-60 mt-1">Get from msg91.com → API</div>
                </label>
                <label class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Sender ID</span></div>
                  <input class="input input-bordered" formControlName="senderId" placeholder="6-char DLT sender ID" />
                  <div class="text-xs opacity-60 mt-1">Registered on Airtel DLT portal (6 chars)</div>
                </label>
                <div formGroupName="templates" class="space-y-3">
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">7-day template ID</span></div>
                    <input class="input input-bordered" formControlName="day7" placeholder="DLT7DAY001" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Due-date template ID</span></div>
                    <input class="input input-bordered" formControlName="dueToday" placeholder="DLTDUE002" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Overdue template ID</span></div>
                    <input class="input input-bordered" formControlName="overdue" placeholder="DLTOVER003" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Schedule -->
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-5">
              <div class="font-bold text-lg">Reminder Schedule</div>
              <div class="text-sm opacity-60 mb-2">When automatic reminders are sent</div>
              <div formGroupName="schedule" class="space-y-2">
                <label class="flex items-center justify-between p-3 rounded-lg bg-base-200">
                  <div>
                    <div class="font-medium text-sm">7-Day Reminder</div>
                    <div class="text-xs opacity-60">Send before due date</div>
                  </div>
                  <input type="checkbox" class="toggle toggle-primary" formControlName="day7Enabled" />
                </label>
                <label class="flex items-center justify-between p-3 rounded-lg bg-base-200">
                  <div>
                    <div class="font-medium text-sm">Due-Today Alert</div>
                    <div class="text-xs opacity-60">Send on the due date</div>
                  </div>
                  <input type="checkbox" class="toggle toggle-primary" formControlName="dueTodayEnabled" />
                </label>
                <label class="flex items-center justify-between p-3 rounded-lg bg-base-200">
                  <div>
                    <div class="font-medium text-sm">Overdue Alert</div>
                    <div class="text-xs opacity-60">Send daily once payment is overdue</div>
                  </div>
                  <input type="checkbox" class="toggle toggle-primary" formControlName="overdueEnabled" />
                </label>
                <div class="flex items-center justify-between p-3 rounded-lg bg-base-200">
                  <div>
                    <div class="font-medium text-sm">Send time (24h)</div>
                    <div class="text-xs opacity-60">Hour of day for the daily batch</div>
                  </div>
                  <input type="number" min="0" max="23" class="input input-bordered input-sm w-24" formControlName="hour" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex justify-end mt-4">
          <button type="submit" class="btn btn-primary" [disabled]="savingSection()">Save SMS Settings</button>
        </div>
      </form>
    </ng-container>

    <!-- =========================== BACKUP & STORAGE =========================== -->
    <ng-container *ngIf="section() === 'backup'">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <!-- Backup -->
        <div class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-5">
            <div class="font-bold text-lg">Backup &amp; Storage</div>
            <div class="text-sm opacity-60 mb-3">Download a JSON dump or schedule periodic backups.</div>

            <div class="rounded-xl bg-base-200 p-4 mb-4 flex flex-col gap-3">
              <div>
                <div class="font-semibold flex items-center gap-2">🔄 Backup Storage</div>
                <div *ngIf="lastBackupAt()" class="text-xs opacity-70 mt-1 text-success">
                  ✓ Last backup: {{ lastBackupAt() | date:'medium' }}
                </div>
                <div *ngIf="!lastBackupAt()" class="text-xs opacity-60 mt-1">No backup created yet from this device.</div>
              </div>
              <button class="btn btn-primary btn-sm self-start" (click)="backupNow()" [disabled]="backupBusy()">
                <span *ngIf="backupBusy()" class="loading loading-spinner loading-sm"></span>
                Backup Now
              </button>
            </div>

            <form [formGroup]="backupForm" (ngSubmit)="saveSection('backup')" class="space-y-3">
              <label class="flex items-center justify-between p-3 rounded-lg bg-base-200">
                <div>
                  <div class="font-medium">Auto backup</div>
                  <div class="text-xs opacity-60">Periodic snapshot (requires Support to enable)</div>
                </div>
                <input type="checkbox" class="toggle toggle-primary" formControlName="autoEnabled" />
              </label>
              <label class="form-control">
                <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Backup time</span></div>
                <input class="input input-bordered" type="time" formControlName="time" />
              </label>
              <label class="form-control">
                <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Retention period</span></div>
                <div class="join">
                  <button type="button" class="join-item btn btn-sm" *ngFor="let d of [30, 60, 90]"
                          [class.btn-primary]="backupForm.value.retentionDays === d"
                          (click)="backupForm.patchValue({ retentionDays: d })">{{ d }} days</button>
                </div>
              </label>
              <label class="form-control">
                <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Backup frequency</span></div>
                <div class="join">
                  <button type="button" class="join-item btn btn-sm"
                          [class.btn-primary]="backupForm.value.frequency === 'daily'"
                          (click)="backupForm.patchValue({ frequency: 'daily' })">Daily</button>
                  <button type="button" class="join-item btn btn-sm"
                          [class.btn-primary]="backupForm.value.frequency === 'weekly'"
                          (click)="backupForm.patchValue({ frequency: 'weekly' })">Weekly</button>
                </div>
              </label>
              <div class="flex justify-end">
                <button type="submit" class="btn btn-primary" [disabled]="savingSection()">Save Backup Settings</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Export -->
        <div class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-5">
            <div class="font-bold text-lg mb-3">Export Your Data</div>
            <div class="space-y-3">
              <button type="button" class="card bg-base-200 hover:bg-base-300 transition-colors p-4 text-left w-full" (click)="exportStudents()" [disabled]="exporting()">
                <div class="font-semibold flex items-center gap-2">🧾 Export All Students</div>
                <div class="text-xs opacity-60 mt-1">CSV of all student records</div>
              </button>
              <button type="button" class="card bg-base-200 hover:bg-base-300 transition-colors p-4 text-left w-full" (click)="exportPayments()" [disabled]="exporting()">
                <div class="font-semibold flex items-center gap-2">💰 Export All Payments</div>
                <div class="text-xs opacity-60 mt-1">CSV of every payment row</div>
              </button>
              <button type="button" class="card bg-base-200 hover:bg-base-300 transition-colors p-4 text-left w-full" (click)="backupNow()" [disabled]="backupBusy()">
                <div class="font-semibold flex items-center gap-2">🗄 Export Full Database</div>
                <div class="text-xs opacity-60 mt-1">JSON bundle of all tables</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- =========================== BIOMETRIC =========================== -->
    <ng-container *ngIf="section() === 'biometric'">
      <form [formGroup]="bioForm" (ngSubmit)="saveSection('biometric')">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <!-- Connection -->
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-5">
              <div class="font-bold text-lg">Device Connection</div>
              <div class="text-sm opacity-60 mb-2">Secureye fingerprint device</div>
              <div class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Device IP</span></div>
                    <input class="input input-bordered" formControlName="ipAddress" placeholder="192.168.1.200" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Port</span></div>
                    <input class="input input-bordered" type="number" formControlName="port" placeholder="4370" />
                  </label>
                </div>
                <label class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Device password</span></div>
                  <div class="join">
                    <input class="input input-bordered join-item flex-1"
                           [type]="showBioPw() ? 'text' : 'password'" formControlName="password" />
                    <button type="button" class="btn join-item" (click)="showBioPw.set(!showBioPw())">{{ showBioPw() ? 'Hide' : 'Show' }}</button>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <!-- Setup & mode -->
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-5">
              <div class="font-bold text-lg mb-2">Setup &amp; Mode</div>
              <div class="rounded-lg bg-base-200 p-3 text-sm">
                <div class="font-semibold mb-1">Requirements:</div>
                <ul class="space-y-0.5 text-xs opacity-80">
                  <li>✓ Device on same WiFi network</li>
                  <li>✓ Fixed/static IP assigned</li>
                  <li>✓ Port 4370 not blocked</li>
                </ul>
                <div class="text-xs opacity-60 mt-2">Set static IP: router (192.168.1.1) → find device MAC → assign static IP.</div>
              </div>
              <label class="flex items-center justify-between p-3 rounded-lg bg-base-200 mt-3">
                <div>
                  <div class="font-medium">Use mock mode (for testing)</div>
                  <div class="text-xs opacity-60">Test without a physical device connected</div>
                </div>
                <input type="checkbox" class="toggle toggle-primary" formControlName="mockMode" />
              </label>
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button type="button" class="btn btn-outline" (click)="testBiometric()" [disabled]="bioTesting()">
            <span *ngIf="bioTesting()" class="loading loading-spinner loading-sm"></span>
            Test Connection
          </button>
          <button type="submit" class="btn btn-primary" [disabled]="savingSection()">Save Biometric Settings</button>
        </div>
      </form>
    </ng-container>

    <!-- =========================== SECURITY =========================== -->
    <ng-container *ngIf="section() === 'security'">
      <form [formGroup]="secForm" (ngSubmit)="saveSection('security')">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <!-- Session -->
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-5">
              <div class="font-bold text-lg mb-1">Session</div>
              <div class="text-xs opacity-60 mb-2">Auto logout after</div>
              <div class="join">
                <button type="button" class="join-item btn btn-sm" *ngFor="let m of [15, 30, 60, 120]"
                        [class.btn-primary]="secForm.value.autoLogoutMin === m"
                        (click)="secForm.patchValue({ autoLogoutMin: m })">{{ m }} min</button>
              </div>
              <label class="flex items-center justify-between p-3 rounded-lg bg-base-200 mt-3">
                <div>
                  <div class="font-medium">Allow multiple sessions</div>
                  <div class="text-xs opacity-60">When OFF, new login logs out previous session</div>
                </div>
                <input type="checkbox" class="toggle toggle-primary" formControlName="allowMultipleSessions" />
              </label>
            </div>
          </div>

          <!-- Login security -->
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-5">
              <div class="font-bold text-lg mb-1">Login Security</div>
              <label class="flex items-center justify-between p-3 rounded-lg bg-base-200 mt-1">
                <div>
                  <div class="font-medium">Failed login lockout</div>
                  <div class="text-xs opacity-60">Lock account after N failed attempts</div>
                </div>
                <input type="checkbox" class="toggle toggle-primary" formControlName="failedLoginLockoutEnabled" />
              </label>
              <div class="grid grid-cols-1 gap-3 mt-3" *ngIf="secForm.value.failedLoginLockoutEnabled">
                <label class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Failed attempts before lockout</span></div>
                  <input class="input input-bordered" type="number" min="1" max="20" formControlName="failedLoginAttempts" />
                </label>
                <label class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Lockout duration</span></div>
                  <div class="join">
                    <button type="button" class="join-item btn btn-sm" *ngFor="let m of [15, 30, 60]"
                            [class.btn-primary]="secForm.value.lockoutDurationMin === m"
                            (click)="secForm.patchValue({ lockoutDurationMin: m })">{{ m }} min</button>
                  </div>
                </label>
              </div>
              <label class="flex items-center justify-between p-3 rounded-lg bg-base-200 mt-3">
                <div>
                  <div class="font-medium">New device login alert</div>
                  <div class="text-xs opacity-60">Email on login from a new device or location</div>
                </div>
                <input type="checkbox" class="toggle toggle-primary" formControlName="newDeviceLoginAlert" />
              </label>
            </div>
          </div>
        </div>

        <!-- Audit log (full width) -->
        <div class="card bg-base-100 border border-base-300 shadow-sm mt-4">
          <div class="card-body p-5 flex-row items-center justify-between flex-wrap gap-3">
            <div>
              <div class="font-bold text-lg">Audit Log</div>
              <div class="text-xs opacity-60">Full history of all admin actions</div>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn btn-outline btn-sm" (click)="comingSoon('Audit log viewer')">View Audit Log</button>
              <button type="button" class="btn btn-outline btn-sm" (click)="comingSoon('Audit log export')">Export Audit Log</button>
            </div>
          </div>
        </div>

        <div class="alert text-xs mt-4">
          <span>ⓘ</span>
          <span>Settings are stored per-tenant. Auto-logout and lockout enforcement need the corresponding middleware enabled by Support.</span>
        </div>
        <div class="flex justify-end mt-4">
          <button type="submit" class="btn btn-primary" [disabled]="savingSection()">Save Security Settings</button>
        </div>
      </form>
    </ng-container>

    <!-- =========================== ABOUT =========================== -->
    <ng-container *ngIf="section() === 'about'">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-5">
            <div class="font-bold text-lg mb-2">About</div>
            <div class="text-sm space-y-2">
              <div><span class="opacity-60">Product:</span> LMS Platform</div>
              <div><span class="opacity-60">Tenant:</span> {{ tenantSlug() }}</div>
              <div><span class="opacity-60">Signed in as:</span> {{ profile()?.fullName }} ({{ profile()?.email }})</div>
              <div><span class="opacity-60">Last login:</span> {{ profile()?.lastLoginAt ? (profile()!.lastLoginAt | date:'medium') : '—' }}</div>
            </div>
          </div>
        </div>
        <div class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-5">
            <div class="font-bold text-lg mb-2">Need help?</div>
            <div class="text-sm opacity-70">
              Reach out to Support to enable integrations (SMS sending, biometric sync, scheduled backups,
              audit-log export) or to adjust your plan.
            </div>
          </div>
        </div>
      </div>
    </ng-container>
  `,
})
export class SettingsComponent implements OnInit {
  private api = inject(SettingsApiService);
  private studentsApi = inject(StudentsApiService);
  private paymentsApi = inject(PaymentsApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  sections: { key: Section; label: string; icon: string }[] = [
    { key: 'profile',   label: 'Profile',         icon: '👤' },
    { key: 'business',  label: 'Business Info',   icon: '🏢' },
    { key: 'sms',       label: 'SMS & Reminders', icon: '💬' },
    { key: 'backup',    label: 'Backup & Storage',icon: '🗄' },
    { key: 'biometric', label: 'Biometric Device',icon: '🛡' },
    { key: 'security',  label: 'Security',        icon: '🔒' },
    { key: 'about',     label: 'About',           icon: 'ⓘ' },
  ];

  section = signal<Section>('profile');
  settings = signal<AllSettings | null>(null);
  profile = signal<ProfileResponse | null>(null);

  savingProfile = signal(false);
  savingPw = signal(false);
  savingSection = signal(false);
  bioTesting = signal(false);
  backupBusy = signal(false);
  exporting = signal(false);

  showApiKey = signal(false);
  showBioPw = signal(false);
  showPw = signal({ current: false, next: false, confirm: false });
  lastBackupAt = signal<Date | null>(null);

  tenantSlug = computed(() => this.auth.user()?.tenantSlug ?? '');

  profileForm = this.fb.group({
    fullName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
  });

  pwForm = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  businessForm = this.fb.group({
    address: [''],
    city: [''],
    state: [''],
    pincode: [''],
    gstin: [''],
  });

  smsForm = this.fb.group({
    provider: ['msg91'],
    apiKey: [''],
    senderId: [''],
    templates: this.fb.group({
      day7: [''],
      dueToday: [''],
      overdue: [''],
    }),
    schedule: this.fb.group({
      day7Enabled: [true],
      dueTodayEnabled: [true],
      overdueEnabled: [true],
      hour: [9, [Validators.min(0), Validators.max(23)]],
    }),
  });

  bioForm = this.fb.group({
    ipAddress: ['192.168.1.200'],
    port: [4370, [Validators.min(1), Validators.max(65535)]],
    password: [''],
    mockMode: [true],
  });

  secForm = this.fb.group({
    autoLogoutMin: [30],
    allowMultipleSessions: [false],
    failedLoginLockoutEnabled: [true],
    failedLoginAttempts: [5],
    lockoutDurationMin: [30],
    newDeviceLoginAlert: [true],
  });

  backupForm = this.fb.group({
    autoEnabled: [false],
    time: ['03:00'],
    frequency: ['daily' as 'daily' | 'weekly'],
    retentionDays: [30],
  });

  ngOnInit() {
    forkJoin({
      settings: this.api.get(),
      profile: this.api.getProfile(),
    }).subscribe({
      next: (r) => {
        this.settings.set(r.settings);
        this.profile.set(r.profile);
        this.profileForm.patchValue({
          fullName: r.profile.fullName,
          email: r.profile.email,
          phone: r.profile.phone ?? '',
        });
        this.businessForm.patchValue(r.settings.business);
        this.smsForm.patchValue(r.settings.sms as any);
        this.bioForm.patchValue(r.settings.biometric);
        this.secForm.patchValue(r.settings.security);
        this.backupForm.patchValue(r.settings.backup);
      },
      error: () => this.toast.error('Could not load settings'),
    });
    const last = localStorage.getItem('lms.lastBackupAt');
    if (last) this.lastBackupAt.set(new Date(last));
  }

  initials(name?: string | null): string {
    if (!name) return '?';
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }

  togglePw(k: 'current' | 'next' | 'confirm') {
    this.showPw.update((s) => ({ ...s, [k]: !s[k] }));
  }

  saveProfile() {
    if (this.profileForm.invalid) return;
    this.savingProfile.set(true);
    const v = this.profileForm.getRawValue();
    this.api.updateProfile({
      fullName: v.fullName ?? undefined,
      email: v.email ?? undefined,
      phone: v.phone ?? undefined,
    }).subscribe({
      next: (r) => {
        this.profile.set({ ...this.profile()!, ...r });
        this.toast.success('Profile saved');
        this.savingProfile.set(false);
      },
      error: (err) => {
        this.toast.error(err.error?.message ?? 'Could not save profile');
        this.savingProfile.set(false);
      },
    });
  }

  savePassword() {
    const v = this.pwForm.getRawValue();
    if (this.pwForm.invalid) {
      this.toast.warning('Please complete the password form.');
      return;
    }
    if (v.newPassword !== v.confirmPassword) {
      this.toast.error('New password and confirmation do not match.');
      return;
    }
    this.savingPw.set(true);
    this.api.changePassword({ currentPassword: v.currentPassword!, newPassword: v.newPassword! }).subscribe({
      next: () => {
        this.toast.success('Password updated');
        this.pwForm.reset();
        this.savingPw.set(false);
      },
      error: (err) => {
        this.toast.error(err.error?.message ?? 'Could not change password');
        this.savingPw.set(false);
      },
    });
  }

  saveSection(s: 'business' | 'sms' | 'biometric' | 'security' | 'backup') {
    this.savingSection.set(true);
    const patch: any = {};
    if (s === 'business')  patch.business  = this.businessForm.getRawValue() as BusinessSettings;
    if (s === 'sms')       patch.sms       = this.smsForm.getRawValue() as SmsSettings;
    if (s === 'biometric') patch.biometric = this.bioForm.getRawValue() as BiometricSettings;
    if (s === 'security')  patch.security  = this.secForm.getRawValue() as SecuritySettings;
    if (s === 'backup')    patch.backup    = this.backupForm.getRawValue() as BackupSettings;
    this.api.update(patch).subscribe({
      next: (r) => {
        this.settings.set(r);
        this.toast.success('Settings saved');
        this.savingSection.set(false);
      },
      error: (err) => {
        this.toast.error(err.error?.message ?? 'Could not save');
        this.savingSection.set(false);
      },
    });
  }

  testBiometric() {
    this.bioTesting.set(true);
    const v = this.bioForm.getRawValue();
    this.api.testBiometric({
      ipAddress: v.ipAddress!,
      port: Number(v.port),
      password: v.password ?? '',
      mockMode: !!v.mockMode,
    }).subscribe({
      next: (r) => {
        if (r.ok) this.toast.success(r.message);
        else this.toast.error(r.message);
        this.bioTesting.set(false);
      },
      error: () => {
        this.toast.error('Test failed');
        this.bioTesting.set(false);
      },
    });
  }

  backupNow() {
    this.backupBusy.set(true);
    // Hit the streaming endpoint and trigger a download via anchor.
    const url = this.api.backupUrl();
    fetch(url, { headers: { Authorization: 'Bearer ' + (this.auth.accessToken ?? '') } })
      .then(async (res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dlUrl;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `lms-backup-${stamp}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(dlUrl);
        const now = new Date();
        this.lastBackupAt.set(now);
        localStorage.setItem('lms.lastBackupAt', now.toISOString());
        this.toast.success('Backup downloaded');
      })
      .catch((e) => this.toast.error('Backup failed: ' + (e?.message ?? '')))
      .finally(() => this.backupBusy.set(false));
  }

  exportStudents() {
    this.exporting.set(true);
    this.studentsApi.list({ limit: 5000, sortBy: 'fullName', sortOrder: 'asc' }).subscribe({
      next: (res) => {
        const cols: ExportColumn<any>[] = [
          { header: 'Code',       value: (s) => s.code },
          { header: 'Name',       value: (s) => s.fullName },
          { header: 'Phone',      value: (s) => s.phone },
          { header: 'Email',      value: (s) => s.email ?? '' },
          { header: 'Status',     value: (s) => s.status },
          { header: 'Joined',     value: (s) => s.joinedAt?.slice(0, 10) ?? '' },
          { header: 'Expires',    value: (s) => s.expiresAt?.slice(0, 10) ?? '' },
        ];
        exportCsv(res.data, cols, { title: 'All Students', fileSlug: 'students-all' });
        this.toast.success(`Exported ${res.data.length} students`);
        this.exporting.set(false);
      },
      error: () => { this.toast.error('Export failed'); this.exporting.set(false); },
    });
  }

  exportPayments() {
    this.exporting.set(true);
    this.paymentsApi.list({ limit: 5000 }).subscribe({
      next: (res) => {
        const rows = res.data;
        const cols: ExportColumn<any>[] = [
          { header: 'Date',     value: (p) => (p.paidAt || p.createdAt)?.slice(0, 19) ?? '' },
          { header: 'Student',  value: (p) => p.student.fullName },
          { header: 'Code',     value: (p) => p.student.code },
          { header: 'Amount',   value: (p) => p.amount },
          { header: 'Method',   value: (p) => p.method },
          { header: 'Status',   value: (p) => p.status },
          { header: 'Notes',    value: (p) => p.notes ?? '' },
        ];
        exportCsv(rows, cols, { title: 'All Payments', fileSlug: 'payments-all' });
        this.toast.success(`Exported ${rows.length} payments`);
        this.exporting.set(false);
      },
      error: () => { this.toast.error('Export failed'); this.exporting.set(false); },
    });
  }

  comingSoon(label: string) {
    this.toast.info(`${label} — integration coming soon. Contact Support to enable.`);
  }
}
