import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  AllSettings, BackupSettings, BiometricSettings, BusinessSettings, ProfileResponse,
  SecuritySettings, SettingsApiService, SmsSettings,
} from './settings.service';
import { StudentsApiService } from '../students/students.service';
import { PaymentsApiService } from '../payments/payments.service';
import { BranchesApiService, Branch } from '../students/branches.service';
import { ToastService } from '../../core/services/toast.service';
import { ExportColumn, exportCsv } from '../../shared/utils/export.util';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { IdleService } from '../../core/services/idle.service';
import { StaffApiService, Staff, CreateStaffDto, UpdateStaffDto } from '../../core/services/staff.service';
import { AuditApiService } from '../audit/audit.service';

type Section = 'profile' | 'business' | 'sms' | 'backup' | 'biometric' | 'security' | 'staff' | 'appearance' | 'about';

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
      <a *ngFor="let s of visibleSections()" role="tab" class="tab gap-1.5"
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
              <div class="flex flex-wrap gap-2">
                <button class="btn btn-primary btn-sm self-start" (click)="backupSqlNow()" [disabled]="backupSqlBusy()">
                  <span *ngIf="backupSqlBusy()" class="loading loading-spinner loading-sm"></span>
                  Download backup (.sql)
                </button>
                <button class="btn btn-outline btn-sm self-start" (click)="backupNow()" [disabled]="backupBusy()">
                  <span *ngIf="backupBusy()" class="loading loading-spinner loading-sm"></span>
                  JSON snapshot
                </button>
              </div>
              <div class="text-xs opacity-60">
                The <strong>.sql</strong> file is a restorable dump of your organisation's data. Restore it into a database with the LMS schema:
                <code class="bg-base-100 px-1 rounded">psql "&lt;db-url&gt;" -f backup.sql</code>
              </div>
            </div>

            <form [formGroup]="backupForm" (ngSubmit)="saveSection('backup')" class="space-y-3">
              <label class="flex items-center justify-between p-3 rounded-lg bg-base-200">
                <div>
                  <div class="font-medium">Auto backup</div>
                  <div class="text-xs opacity-60">Emails a restorable .sql backup to your org address (needs email integration enabled)</div>
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
              <button type="button" class="btn btn-outline btn-sm" (click)="viewAuditLog()">View Audit Log</button>
              <button type="button" class="btn btn-outline btn-sm gap-2" (click)="exportAuditLog()" [disabled]="exportingAudit()">
                <span *ngIf="exportingAudit()" class="loading loading-spinner loading-xs"></span>
                Export Audit Log
              </button>
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

    <!-- =========================== APPEARANCE =========================== -->
    <ng-container *ngIf="section() === 'appearance'">
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-5">
          <div class="font-bold text-lg">Theme</div>
          <p class="text-sm opacity-60 mb-4">
            Choose a colour palette for the app. Your choice is saved on this device.
          </p>

          <!-- Dropdown selector -->
          <label class="form-control max-w-xs mb-5">
            <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Active theme</span></div>
            <select class="select select-bordered" [ngModel]="theme.theme()" (ngModelChange)="theme.set($event)">
              <option *ngFor="let t of theme.themes" [ngValue]="t.key">{{ t.label }} — {{ t.description }}</option>
            </select>
          </label>

          <!-- Visual swatch tiles -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <button *ngFor="let t of theme.themes" type="button"
                    (click)="theme.set(t.key)"
                    class="relative text-left rounded-2xl border-2 p-3 transition-all hover:shadow-md"
                    [class.border-primary]="theme.theme() === t.key"
                    [class.border-base-300]="theme.theme() !== t.key">
              <span *ngIf="theme.theme() === t.key"
                    class="absolute top-2 right-2 badge badge-primary badge-sm">✓</span>
              <div class="flex gap-1.5 mb-2">
                <span class="w-6 h-6 rounded-lg" [style.background]="t.swatch[0]"></span>
                <span class="w-6 h-6 rounded-lg" [style.background]="t.swatch[1]"></span>
                <span class="w-6 h-6 rounded-lg" [style.background]="t.swatch[2]"></span>
              </div>
              <div class="font-semibold text-sm leading-tight">{{ t.label }}</div>
              <div class="text-[11px] opacity-60 leading-tight mt-0.5">{{ t.description }}</div>
              <div class="text-[10px] uppercase tracking-wider opacity-40 mt-1">{{ t.mode }}</div>
            </button>
          </div>
        </div>
      </div>
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

    <!-- =========================== STAFF =========================== -->
    <ng-container *ngIf="section() === 'staff'">
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-5">
          <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div>
              <div class="font-bold text-lg">Staff</div>
              <p class="text-sm opacity-60">Add team members and pick them when allocating seats/rooms or logging expenses.</p>
            </div>
            <button class="btn btn-primary btn-sm" (click)="openStaffCreate()">+ Add staff</button>
          </div>

          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr class="text-xs uppercase tracking-wider">
                  <th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let s of staffList()" class="hover">
                  <td class="font-medium">{{ s.fullName }}</td>
                  <td class="text-sm opacity-80">{{ s.email }}</td>
                  <td><span class="badge badge-ghost badge-sm">{{ s.role }}</span></td>
                  <td class="text-sm">{{ s.branch?.name || '—' }}</td>
                  <td>
                    <span class="badge badge-sm" [class.badge-success]="s.isActive" [class.badge-ghost]="!s.isActive">
                      {{ s.isActive ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="text-right">
                    <div class="flex items-center justify-end gap-1" *ngIf="s.role !== 'CLIENT_ADMIN'">
                      <button class="btn btn-ghost btn-xs" (click)="openStaffEdit(s)" title="Edit">✎</button>
                      <button class="btn btn-ghost btn-xs" (click)="toggleStaffActive(s)" [title]="s.isActive ? 'Deactivate' : 'Activate'">
                        {{ s.isActive ? '🚫' : '✅' }}
                      </button>
                    </div>
                    <span *ngIf="s.role === 'CLIENT_ADMIN'" class="text-xs opacity-40">owner</span>
                  </td>
                </tr>
                <tr *ngIf="staffList().length === 0 && !staffLoading()">
                  <td colspan="6" class="text-center opacity-60 py-8">No staff yet. Add your first team member.</td>
                </tr>
                <tr *ngIf="staffLoading()"><td colspan="6" class="text-center py-6"><span class="loading loading-spinner loading-md"></span></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Staff create/edit modal -->
      <dialog class="modal" [class.modal-open]="staffEditorOpen()">
        <div class="modal-box max-w-md">
          <h3 class="font-bold text-lg">{{ editingStaffId() ? '✎ Edit staff' : '+ Add staff' }}</h3>
          <form [formGroup]="staffForm" (ngSubmit)="saveStaff()" class="grid grid-cols-1 gap-3 mt-3">
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Full name *</span></div>
              <input class="input input-bordered input-sm" formControlName="fullName" placeholder="e.g. Asha Verma" />
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Email *</span></div>
              <input class="input input-bordered input-sm" type="email" formControlName="email" placeholder="name@example.com"
                     [class.input-disabled]="!!editingStaffId()" [readonly]="!!editingStaffId()" />
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="form-control">
                <div class="label py-1"><span class="label-text">Role *</span></div>
                <select class="select select-bordered select-sm" formControlName="role">
                  <option value="STAFF">Staff</option>
                  <option value="BRANCH_ADMIN">Branch admin</option>
                </select>
              </label>
              <label class="form-control">
                <div class="label py-1"><span class="label-text">Branch</span></div>
                <select class="select select-bordered select-sm" formControlName="branchId">
                  <option value="">— None —</option>
                  <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }} ({{ b.code }})</option>
                </select>
              </label>
            </div>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Phone</span></div>
              <input class="input input-bordered input-sm" formControlName="phone" placeholder="+91xxxxxxxxxx" />
            </label>
            <label class="form-control">
              <div class="label py-1">
                <span class="label-text">{{ editingStaffId() ? 'Reset password (optional)' : 'Password *' }}</span>
              </div>
              <input class="input input-bordered input-sm" type="password" formControlName="password"
                     [placeholder]="editingStaffId() ? 'Leave blank to keep current' : 'Min 8 characters'" />
            </label>
            <p class="text-xs opacity-60">New staff are asked to set their own password on first login.</p>
            <div class="modal-action">
              <button type="button" class="btn btn-ghost" (click)="closeStaffEditor()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="savingStaff() || staffForm.invalid">
                <span *ngIf="savingStaff()" class="loading loading-spinner loading-sm"></span>
                {{ editingStaffId() ? 'Save changes' : 'Add staff' }}
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop"><button type="button" (click)="closeStaffEditor()">close</button></form>
      </dialog>
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
  private idle = inject(IdleService);
  private staffApi = inject(StaffApiService);
  private branchesApi = inject(BranchesApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auditApi = inject(AuditApiService);
  theme = inject(ThemeService);

  exportingAudit = signal(false);

  sections: { key: Section; label: string; icon: string }[] = [
    { key: 'profile',   label: 'Profile',         icon: '👤' },
    { key: 'business',  label: 'Business Info',   icon: '🏢' },
    { key: 'sms',       label: 'SMS & Reminders', icon: '💬' },
    { key: 'backup',    label: 'Backup & Storage',icon: '🗄' },
    { key: 'biometric', label: 'Biometric Device',icon: '🛡' },
    { key: 'security',  label: 'Security',        icon: '🔒' },
    { key: 'staff',     label: 'Staff',           icon: '👥' },
    { key: 'appearance',label: 'Appearance',      icon: '🎨' },
    { key: 'about',     label: 'About',           icon: 'ⓘ' },
  ];

  /** Staff management is admin-only; everyone else sees the rest. */
  canManageStaff = computed(() => this.auth.user()?.role === 'CLIENT_ADMIN');
  visibleSections = computed(() =>
    this.sections.filter((s) => s.key !== 'staff' || this.canManageStaff()),
  );

  section = signal<Section>('profile');
  settings = signal<AllSettings | null>(null);
  profile = signal<ProfileResponse | null>(null);

  savingProfile = signal(false);
  savingPw = signal(false);
  savingSection = signal(false);
  bioTesting = signal(false);
  backupBusy = signal(false);
  backupSqlBusy = signal(false);
  exporting = signal(false);

  showApiKey = signal(false);
  showBioPw = signal(false);
  showPw = signal({ current: false, next: false, confirm: false });
  lastBackupAt = signal<Date | null>(null);

  // ----- Staff management -----
  staffList = signal<Staff[]>([]);
  branches = signal<Branch[]>([]);
  staffLoading = signal(false);
  savingStaff = signal(false);
  staffEditorOpen = signal(false);
  editingStaffId = signal<string | null>(null);

  staffForm = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['STAFF' as 'STAFF' | 'BRANCH_ADMIN', Validators.required],
    branchId: [''],
    phone: [''],
    password: ['', [Validators.minLength(8)]],
  });

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
    // Deep-link support: /settings?section=staff opens that tab directly.
    const wanted = this.route.snapshot.queryParamMap.get('section') as Section | null;
    if (wanted && this.sections.some((s) => s.key === wanted)) {
      if (wanted !== 'staff' || this.canManageStaff()) this.section.set(wanted);
    }

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
        // Keep the live auto-logout timer in sync with the loaded value.
        this.idle.configure(r.settings.security.autoLogoutMin);
      },
      error: () => this.toast.error('Could not load settings'),
    });
    const last = localStorage.getItem('lms.lastBackupAt');
    if (last) this.lastBackupAt.set(new Date(last));

    if (this.canManageStaff()) {
      this.loadStaff();
      this.branchesApi.list().subscribe({ next: (bs) => this.branches.set(bs), error: () => {} });
    }
  }

  // ----- Staff management -----
  loadStaff() {
    this.staffLoading.set(true);
    this.staffApi.list().subscribe({
      next: (rows) => { this.staffList.set(rows); this.staffLoading.set(false); },
      error: () => { this.staffLoading.set(false); this.toast.error('Could not load staff'); },
    });
  }

  openStaffCreate() {
    this.editingStaffId.set(null);
    this.staffForm.reset({ fullName: '', email: '', role: 'STAFF', branchId: '', phone: '', password: '' });
    this.staffForm.get('email')!.enable();
    this.staffForm.get('password')!.setValidators([Validators.required, Validators.minLength(8)]);
    this.staffForm.get('password')!.updateValueAndValidity();
    this.staffEditorOpen.set(true);
    this.blurActive();
  }

  openStaffEdit(s: Staff) {
    this.editingStaffId.set(s.id);
    this.staffForm.reset({
      fullName: s.fullName,
      email: s.email,
      role: (s.role === 'BRANCH_ADMIN' ? 'BRANCH_ADMIN' : 'STAFF'),
      branchId: s.branchId ?? '',
      phone: s.phone ?? '',
      password: '',
    });
    // Email is immutable here; password optional (blank = keep current).
    this.staffForm.get('email')!.disable();
    this.staffForm.get('password')!.setValidators([Validators.minLength(8)]);
    this.staffForm.get('password')!.updateValueAndValidity();
    this.staffEditorOpen.set(true);
    this.blurActive();
  }

  closeStaffEditor() { this.staffEditorOpen.set(false); }

  saveStaff() {
    if (this.staffForm.invalid) return;
    const v = this.staffForm.getRawValue();
    this.savingStaff.set(true);
    const id = this.editingStaffId();

    if (id) {
      const patch: UpdateStaffDto = {
        fullName: v.fullName!.trim(),
        role: v.role!,
        branchId: v.branchId || undefined,
        phone: v.phone?.trim() || undefined,
        ...(v.password ? { password: v.password } : {}),
      };
      this.staffApi.update(id, patch).subscribe({
        next: () => { this.toast.success('Staff updated'); this.afterStaffSave(); },
        error: (e) => this.failStaff(e, 'Could not update staff'),
      });
    } else {
      const dto: CreateStaffDto = {
        fullName: v.fullName!.trim(),
        email: v.email!.trim(),
        password: v.password!,
        role: v.role!,
        branchId: v.branchId || undefined,
        phone: v.phone?.trim() || undefined,
      };
      this.staffApi.create(dto).subscribe({
        next: () => { this.toast.success('Staff added'); this.afterStaffSave(); },
        error: (e) => this.failStaff(e, 'Could not add staff'),
      });
    }
  }

  toggleStaffActive(s: Staff) {
    this.staffApi.update(s.id, { isActive: !s.isActive }).subscribe({
      next: () => { this.toast.success(s.isActive ? 'Staff deactivated' : 'Staff activated'); this.loadStaff(); },
      error: (e) => this.failStaff(e, 'Could not update staff'),
    });
  }

  private afterStaffSave() {
    this.savingStaff.set(false);
    this.staffEditorOpen.set(false);
    this.loadStaff();
  }
  private failStaff(err: any, fallback: string) {
    this.savingStaff.set(false);
    const msg = err?.error?.message;
    this.toast.error(Array.isArray(msg) ? msg.join(' · ') : (msg ?? fallback));
  }
  private blurActive() { (document.activeElement as HTMLElement | null)?.blur(); }

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
        // Apply the new inactivity limit immediately — no reload needed.
        if (s === 'security') this.idle.configure(r.security.autoLogoutMin);
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

  backupSqlNow() {
    this.backupSqlBusy.set(true);
    fetch(this.api.backupSqlUrl(), { headers: { Authorization: 'Bearer ' + (this.auth.accessToken ?? '') } })
      .then(async (res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = `lms-backup-${new Date().toISOString().slice(0, 10)}.sql`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(dlUrl);
        const now = new Date();
        this.lastBackupAt.set(now);
        localStorage.setItem('lms.lastBackupAt', now.toISOString());
        this.toast.success('SQL backup downloaded');
      })
      .catch((e) => this.toast.error('Backup failed: ' + (e?.message ?? '')))
      .finally(() => this.backupSqlBusy.set(false));
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

  viewAuditLog() {
    this.router.navigate(['/audit-log']);
  }

  exportAuditLog() {
    this.exportingAudit.set(true);
    this.auditApi.exportCsv({}).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.exportingAudit.set(false);
        this.toast.success('Audit log exported');
      },
      error: () => { this.toast.error('Export failed'); this.exportingAudit.set(false); },
    });
  }

  comingSoon(label: string) {
    this.toast.info(`${label} — integration coming soon. Contact Support to enable.`);
  }
}
