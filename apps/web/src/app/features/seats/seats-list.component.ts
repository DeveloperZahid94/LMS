import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { SeatsApiService, SeatAssignmentsApiService, SeatWithAssignments } from './seats.service';
import {
  ALL_SHIFTS, COMMON_AMENITIES, MonthlyRates, SeatAssignment, SeatAssignmentStatus,
  SeatType, Shift, SHIFT_LABELS,
} from '@lms/shared';
import { BranchesApiService, Branch } from '../students/branches.service';
import { StudentsApiService } from '../students/students.service';
import { ToastService } from '../../core/services/toast.service';
import {
  SearchableSelectComponent, ComboItem,
} from '../../shared/components/searchable-select.component';

type TabKey = 'manage' | 'allocations' | 'allocate';

interface StudentLite {
  id: string; code: string; fullName: string; phone: string;
}

@Component({
  selector: 'lms-seats-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent],
  template: `
    <div class="mb-4 flex items-end justify-between flex-wrap gap-2">
      <div>
        <h1 class="text-2xl font-bold">Seats & cabins</h1>
        <p class="text-sm opacity-60">Manage inventory, rates, and allocations.</p>
      </div>
      <div class="flex gap-2 items-center flex-wrap">
        <input *ngIf="tab() === 'manage'"
               class="input input-bordered input-sm w-56"
               [ngModel]="manageSearch()"
               (ngModelChange)="manageSearch.set($event); seatPage.set(1)"
               placeholder="Search seat, student, zone, rate…" />
        <select class="select select-bordered select-sm" [(ngModel)]="branchFilter" (ngModelChange)="onBranchChange()">
          <option [ngValue]="undefined">All branches</option>
          <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }}</option>
        </select>
        <button *ngIf="tab() === 'manage'" class="btn btn-primary btn-sm" (click)="openAddSeat()">+ Add seat</button>
      </div>
    </div>

    <div class="mb-4 flex items-center justify-between gap-3 flex-wrap">
      <div role="tablist" class="tabs tabs-boxed bg-base-200 w-fit">
        <a role="tab" class="tab gap-2" [class.tab-active]="tab() === 'manage'" (click)="tab.set('manage')">
          <span>🪑</span> Manage <span class="badge badge-sm">{{ seats().length }}</span>
        </a>
        <a role="tab" class="tab gap-2" [class.tab-active]="tab() === 'allocations'" (click)="onTabAllocations()">
          <span>📋</span> Allocations <span class="badge badge-sm">{{ allocTotal() }}</span>
        </a>
        <a role="tab" class="tab gap-2" [class.tab-active]="tab() === 'allocate'" (click)="onTabAllocate()">
          <span>➕</span> Allocate
        </a>
      </div>

      <!-- Manage-tab toolbar: filter chips + view toggle -->
      <div *ngIf="tab() === 'manage' && seats().length > 0" class="flex items-center gap-2 flex-wrap">
        <div class="join">
          <button class="btn btn-sm join-item" [class.btn-active]="manageFilter() === 'all'" (click)="setManageFilter('all')">
            All <span class="ml-1 badge badge-sm">{{ seats().length }}</span>
          </button>
          <button class="btn btn-sm join-item" [class.btn-active]="manageFilter() === 'vacant'" (click)="setManageFilter('vacant')">
            Vacant <span class="ml-1 badge badge-sm badge-ghost">{{ countByFilter('vacant') }}</span>
          </button>
          <button class="btn btn-sm join-item" [class.btn-active]="manageFilter() === 'partial'" (click)="setManageFilter('partial')">
            Partial <span class="ml-1 badge badge-sm badge-success">{{ countByFilter('partial') }}</span>
          </button>
          <button class="btn btn-sm join-item" [class.btn-active]="manageFilter() === 'full'" (click)="setManageFilter('full')">
            Full <span class="ml-1 badge badge-sm badge-warning">{{ countByFilter('full') }}</span>
          </button>
          <button class="btn btn-sm join-item btn-error btn-outline" [class.btn-active]="manageFilter() === 'overdue'" (click)="setManageFilter('overdue')">
            ⚠ Overdue <span class="ml-1 badge badge-sm badge-error">{{ countByFilter('overdue') }}</span>
          </button>
        </div>
        <div class="join" title="Toggle view">
          <button class="btn btn-sm join-item" [class.btn-active]="viewMode() === 'card'" (click)="viewMode.set('card')" title="Card view">▦</button>
          <button class="btn btn-sm join-item" [class.btn-active]="viewMode() === 'list'" (click)="viewMode.set('list')" title="List view">☰</button>
          <button class="btn btn-sm join-item" [class.btn-active]="viewMode() === 'floor'" (click)="viewMode.set('floor')" title="Floor plan">🗺</button>
        </div>
      </div>
    </div>

    <!-- ============================================ TAB 1: MANAGE ======================================== -->
    <ng-container *ngIf="tab() === 'manage'">
      <div *ngIf="seats().length === 0" class="card bg-base-100 border border-base-300">
        <div class="card-body text-center py-10">
          <p class="opacity-60 mb-3">No seats configured yet.</p>
          <button class="btn btn-primary mx-auto" (click)="openAddSeat()">+ Add your first seat</button>
        </div>
      </div>

      <!-- Card view -->
      <div *ngIf="viewMode() === 'card' && seats().length > 0"
           class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <div *ngFor="let s of pagedSeats()"
             class="card bg-base-100 border border-base-300 hover:shadow-lg hover:border-primary/40 cursor-pointer transition-all"
             [class.opacity-50]="!s.isActive"
             [class.border-success]="s.isActive && occupiedSlots(s) > 0 && !isFullyBooked(s)"
             [class.border-warning]="s.isActive && isFullyBooked(s)"
             (click)="openEditSeat(s)">
          <div class="card-body p-4">
            <div class="flex items-start justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <div class="text-2xl font-bold leading-tight">{{ s.code }}</div>
                  <span *ngIf="seatHasOverdue(s)" class="badge badge-error badge-sm animate-pulse" title="One or more occupants have an overdue installment">
                    ⚠ Overdue
                  </span>
                </div>
                <div class="text-xs opacity-60">{{ s.floor ? 'Floor ' + s.floor : '' }}<span *ngIf="s.floor && s.zone"> · </span>{{ s.zone || '' }}</div>
              </div>
              <span class="badge badge-sm"
                [class.badge-primary]="s.type === 'CABIN'"
                [class.badge-ghost]="s.type !== 'CABIN'">
                {{ s.type }}
              </span>
            </div>

            <div class="flex flex-wrap gap-1 mt-2 min-h-[1.25rem]">
              <span *ngFor="let a of s.amenities" class="badge badge-outline badge-sm">{{ a }}</span>
            </div>

            <!-- Student name badges per shift -->
            <div class="mt-3 space-y-1" *ngIf="s.assignments.length > 0">
              <div *ngFor="let a of s.assignments"
                   class="flex items-center justify-between text-xs gap-2">
                <span class="badge badge-sm"
                  [class.badge-warning]="a.status === 'TEMPORARY'"
                  [class.badge-success]="a.status === 'CONFIRMED'">
                  {{ shortShift(a.shift) }}
                </span>
                <span class="truncate font-medium flex-1" [title]="a.student.fullName">
                  {{ a.student.fullName }}
                </span>
                <span class="opacity-60 shrink-0">{{ a.student.code }}</span>
              </div>
            </div>
            <div *ngIf="s.assignments.length === 0" class="mt-3 text-xs opacity-50 italic">All shifts free</div>

            <div class="mt-3 text-sm">
              <span class="opacity-60">Best rate:</span>
              <span class="font-medium ml-1">{{ bestRate(s) }}</span>
            </div>

            <div class="mt-2">
              <div class="flex gap-1">
                <div *ngFor="let sh of shifts"
                     class="flex-1 h-1.5 rounded-full transition-colors"
                     [class.bg-base-300]="!shiftTaken(s, sh)"
                     [class.bg-success]="shiftTaken(s, sh) && shiftStatus(s, sh) === 'CONFIRMED'"
                     [class.bg-warning]="shiftTaken(s, sh) && shiftStatus(s, sh) === 'TEMPORARY'"
                     [title]="shiftBarTitle(s, sh)">
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- List view -->
      <div *ngIf="viewMode() === 'list' && seats().length > 0"
           class="card bg-base-100 border border-base-300 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>Code</th><th>Type</th><th>Floor</th><th>Zone</th><th>Amenities</th>
                <th>Best rate</th><th>Occupancy</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of pagedSeats()" class="cursor-pointer" (click)="openEditSeat(s)">
                <td>
                  <div class="flex items-center gap-2">
                    <code class="text-sm font-bold bg-base-200 px-2 py-0.5 rounded">{{ s.code }}</code>
                    <span *ngIf="seatHasOverdue(s)" class="badge badge-error badge-sm animate-pulse">⚠ Overdue</span>
                  </div>
                </td>
                <td>
                  <span class="badge badge-sm"
                    [class.badge-primary]="s.type === 'CABIN'"
                    [class.badge-ghost]="s.type !== 'CABIN'">{{ s.type }}</span>
                </td>
                <td class="text-sm">{{ s.floor || '—' }}</td>
                <td class="text-sm">{{ s.zone || '—' }}</td>
                <td>
                  <div class="flex flex-wrap gap-1">
                    <span *ngFor="let a of s.amenities" class="badge badge-outline badge-sm">{{ a }}</span>
                    <span *ngIf="s.amenities.length === 0" class="opacity-50 text-xs">—</span>
                  </div>
                </td>
                <td class="text-sm font-medium">{{ bestRate(s) }}</td>
                <td>
                  <div *ngIf="s.assignments.length === 0" class="text-xs opacity-50">All free</div>
                  <div *ngIf="s.assignments.length > 0" class="space-y-0.5">
                    <div *ngFor="let a of s.assignments" class="text-xs flex items-center gap-1.5">
                      <span class="badge badge-xs"
                        [class.badge-warning]="a.status === 'TEMPORARY'"
                        [class.badge-success]="a.status === 'CONFIRMED'">{{ shortShift(a.shift) }}</span>
                      <span class="truncate">{{ a.student.fullName }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span *ngIf="!s.isActive" class="badge badge-ghost badge-sm">inactive</span>
                  <span *ngIf="s.isActive && isFullyBooked(s)" class="badge badge-warning badge-sm">full</span>
                  <span *ngIf="s.isActive && occupiedSlots(s) > 0 && !isFullyBooked(s)" class="badge badge-success badge-sm">partial</span>
                  <span *ngIf="s.isActive && occupiedSlots(s) === 0" class="badge badge-ghost badge-sm">vacant</span>
                </td>
                <td><button class="btn btn-ghost btn-xs">Edit</button></td>
              </tr>
              <tr *ngIf="pagedSeats().length === 0">
                <td colspan="9" class="text-center opacity-60 py-8">No seats match the current filters.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Floor-plan view: cabin tiles grouped by floor -->
      <div *ngIf="viewMode() === 'floor' && seats().length > 0" class="space-y-4">
        <div *ngIf="floorGroups().length === 0" class="card bg-base-100 border border-base-300">
          <div class="card-body text-center py-8 opacity-60">No seats match the current filters.</div>
        </div>
        <div *ngFor="let g of floorGroups()" class="card bg-base-100 border border-base-300">
          <div class="card-body p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-lg">{{ g.floor === 'Unassigned' ? 'No floor assigned' : 'Floor ' + g.floor }}</h3>
              <div class="text-xs opacity-60">
                {{ g.seats.length }} cabin{{ g.seats.length === 1 ? '' : 's' }} ·
                <span class="text-success">{{ floorCount(g.seats, 'vacant') }} vacant</span> ·
                <span class="text-warning">{{ floorCount(g.seats, 'partial') }} partial</span> ·
                <span class="text-error">{{ floorCount(g.seats, 'full') }} full</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button *ngFor="let s of g.seats"
                      type="button"
                      class="rounded-lg border-2 transition-all hover:scale-105 hover:shadow-md p-3 min-w-[72px] text-center"
                      [class.border-base-300]="!s.isActive"
                      [class.bg-base-200]="!s.isActive"
                      [class.opacity-60]="!s.isActive"
                      [class.border-success]="s.isActive && occupiedSlots(s) === 0"
                      [class.bg-success]="s.isActive && occupiedSlots(s) === 0"
                      [class.bg-opacity-5]="s.isActive && (occupiedSlots(s) === 0 || isFullyBooked(s))"
                      [class.border-warning]="s.isActive && occupiedSlots(s) > 0 && !isFullyBooked(s)"
                      [class.border-error]="s.isActive && isFullyBooked(s)"
                      [class.bg-error]="s.isActive && isFullyBooked(s)"
                      [title]="floorTileTitle(s)"
                      (click)="openFloorDetail(s)">
                <div class="font-bold text-sm">{{ s.code }}</div>
                <div class="text-[10px] opacity-70 mt-0.5">
                  {{ occupiedSlots(s) }}/{{ shifts.length }}
                </div>
                <span *ngIf="seatHasOverdue(s)" class="text-[10px] text-error">⚠</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Legend -->
        <div class="flex items-center gap-3 text-xs opacity-70 flex-wrap">
          <span class="inline-flex items-center gap-1"><span class="inline-block w-3 h-3 rounded border-2 border-success bg-success bg-opacity-10"></span> Vacant</span>
          <span class="inline-flex items-center gap-1"><span class="inline-block w-3 h-3 rounded border-2 border-warning"></span> Partially booked</span>
          <span class="inline-flex items-center gap-1"><span class="inline-block w-3 h-3 rounded border-2 border-error bg-error bg-opacity-10"></span> Fully booked</span>
          <span class="inline-flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-base-200 border-2 border-base-300"></span> Inactive</span>
        </div>
      </div>

      <!-- Pagination footer (cards + list) -->
      <div *ngIf="seats().length > 0 && viewMode() !== 'floor'" class="flex items-center justify-between mt-4 flex-wrap gap-2 text-sm">
        <div class="flex items-center gap-3">
          <select class="select select-bordered select-sm" [(ngModel)]="seatPageSize" (ngModelChange)="onSeatPageSizeChange()">
            <option [ngValue]="8">8 / page</option>
            <option [ngValue]="12">12 / page</option>
            <option [ngValue]="24">24 / page</option>
            <option [ngValue]="48">48 / page</option>
            <option [ngValue]="200">All</option>
          </select>
          <span class="opacity-60">
            Showing <span class="font-medium">{{ pagedSeats().length === 0 ? 0 : (seatPage() - 1) * seatPageSize + 1 }}</span>–<span class="font-medium">{{ seatRangeEnd() }}</span> of {{ filteredSeats().length }} filtered
          </span>
        </div>
        <div class="join">
          <button class="btn btn-sm join-item" (click)="seatGoTo(1)" [disabled]="seatPage() === 1">«</button>
          <button class="btn btn-sm join-item" (click)="seatGoTo(seatPage() - 1)" [disabled]="seatPage() === 1">‹ Prev</button>
          <button class="btn btn-sm join-item btn-active">{{ seatPage() }} / {{ seatTotalPages() }}</button>
          <button class="btn btn-sm join-item" (click)="seatGoTo(seatPage() + 1)" [disabled]="seatPage() >= seatTotalPages()">Next ›</button>
          <button class="btn btn-sm join-item" (click)="seatGoTo(seatTotalPages())" [disabled]="seatPage() >= seatTotalPages()">»</button>
        </div>
      </div>
    </ng-container>

    <!-- ============================================ TAB 2: ALLOCATIONS ==================================== -->
    <ng-container *ngIf="tab() === 'allocations'">
      <div class="card bg-base-100 border border-base-300 mb-4">
        <div class="card-body py-3 flex flex-row flex-wrap items-center gap-3">
          <input class="input input-bordered input-sm flex-1 min-w-[200px]"
                 [(ngModel)]="allocSearch"
                 (ngModelChange)="onAllocSearch()"
                 placeholder="Search by student name, code, phone, or seat code" />
          <select class="select select-bordered select-sm" [(ngModel)]="allocStatus" (ngModelChange)="onAllocFilterChange()">
            <option value="ACTIVE">Active (Temporary + Confirmed)</option>
            <option value="TEMPORARY">Temporary only</option>
            <option value="CONFIRMED">Confirmed only</option>
            <option value="ENDED">Ended</option>
            <option value="ALL">All</option>
          </select>
          <select class="select select-bordered select-sm" [(ngModel)]="allocLimit" (ngModelChange)="onAllocPageSize()">
            <option [ngValue]="10">10 / page</option>
            <option [ngValue]="25">25 / page</option>
            <option [ngValue]="50">50 / page</option>
            <option [ngValue]="100">100 / page</option>
          </select>
        </div>
      </div>

      <div class="card bg-base-100 border border-base-300 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>Seat</th><th>Student</th><th>Shift</th><th>Rate</th><th>Paid</th><th>Status</th><th>Start</th><th>End</th><th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of allocations()">
                <td>
                  <code class="text-xs bg-base-200 px-1.5 py-0.5 rounded">{{ a.seat?.code }}</code>
                  <span class="opacity-60 text-xs ml-1">{{ a.seat?.type }}</span>
                </td>
                <td>
                  <div class="font-medium">{{ a.student?.fullName }}</div>
                  <div class="opacity-60 text-xs">{{ a.student?.code }} · {{ a.student?.phone }}</div>
                </td>
                <td><span class="badge badge-outline">{{ a.shift }}</span></td>
                <td class="text-sm">{{ a.monthlyRate ? '₹' + (a.monthlyRate | number) : '—' }}</td>
                <td class="text-sm">
                  <div *ngIf="a.monthlyRate; else paidPlain">
                    <div class="flex items-center gap-2">
                      <span>₹{{ a.paidAmount | number }}</span>
                      <span class="text-xs opacity-60">{{ a.paidPct }}%</span>
                    </div>
                    <progress class="progress w-20 h-1.5"
                      [class.progress-success]="(a.paidPct ?? 0) >= 50"
                      [class.progress-warning]="(a.paidPct ?? 0) < 50"
                      [value]="a.paidPct ?? 0" max="100"></progress>
                  </div>
                  <ng-template #paidPlain>₹{{ a.paidAmount | number }}</ng-template>
                </td>
                <td>
                  <span class="badge badge-sm"
                    [class.badge-warning]="a.status === 'TEMPORARY'"
                    [class.badge-success]="a.status === 'CONFIRMED'"
                    [class.badge-ghost]="a.status === 'ENDED'">
                    {{ a.status }}
                  </span>
                </td>
                <td class="text-sm">{{ a.startDate | date:'mediumDate' }}</td>
                <td class="text-sm">{{ a.endDate ? (a.endDate | date:'mediumDate') : '—' }}</td>
                <td class="text-right">
                  <div class="join">
                    <button class="btn btn-ghost btn-xs join-item" (click)="viewing.set(a)">View</button>
                    <button *ngIf="a.status !== 'ENDED'" class="btn btn-ghost btn-xs join-item text-error" (click)="endAllocation(a)">End</button>
                  </div>
                </td>
              </tr>
              <tr *ngIf="allocations().length === 0 && !allocLoading()">
                <td colspan="9" class="text-center opacity-60 py-8">No allocations match the current filters.</td>
              </tr>
              <tr *ngIf="allocLoading()">
                <td colspan="9" class="text-center py-6"><span class="loading loading-spinner loading-md"></span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between p-3 border-t border-base-300 text-sm flex-wrap gap-2">
          <div class="opacity-60">
            Showing <span class="font-medium">{{ allocations().length === 0 ? 0 : (allocPage() - 1) * allocLimit + 1 }}</span>–<span class="font-medium">{{ allocRangeEnd() }}</span> of {{ allocTotal() }}
          </div>
          <div class="join">
            <button class="btn btn-sm join-item" (click)="allocGoTo(1)" [disabled]="allocPage() === 1">«</button>
            <button class="btn btn-sm join-item" (click)="allocGoTo(allocPage() - 1)" [disabled]="allocPage() === 1">‹ Prev</button>
            <button class="btn btn-sm join-item btn-active">{{ allocPage() }}</button>
            <button class="btn btn-sm join-item" (click)="allocGoTo(allocPage() + 1)" [disabled]="allocPage() >= allocTotalPages()">Next ›</button>
            <button class="btn btn-sm join-item" (click)="allocGoTo(allocTotalPages())" [disabled]="allocPage() >= allocTotalPages()">»</button>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- ============================================ TAB 3: ALLOCATE ======================================= -->
    <ng-container *ngIf="tab() === 'allocate'">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <form [formGroup]="allocateForm" (ngSubmit)="submitAllocation()" class="card bg-base-100 border border-base-300 lg:col-span-2">
          <div class="card-body">
            <h3 class="card-title text-lg">Allocate a seat</h3>
            <p class="text-sm opacity-60">
              Each student can hold one active seat at a time. Allocations start as
              <span class="badge badge-warning badge-sm">TEMPORARY</span> and auto-promote to
              <span class="badge badge-success badge-sm">CONFIRMED</span> once the student has paid ≥ 50% of the seat's monthly rate.
            </p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div class="form-control">
                <div class="label py-1 justify-between">
                  <span class="label-text">Student *</span>
                  <span class="label-text-alt opacity-60">{{ allocatableStudents().length }} available</span>
                </div>
                <lms-searchable-select
                    [items]="studentItems()"
                    placeholder="Pick a student"
                    searchPlaceholder="Search name, code, or phone"
                    formControlName="studentId">
                </lms-searchable-select>
              </div>
              <div class="form-control">
                <div class="label py-1 justify-between">
                  <span class="label-text">Seat *</span>
                  <span class="label-text-alt opacity-60">{{ availableSeatCount() }}/{{ seats().length }} available</span>
                </div>
                <lms-searchable-select
                    [items]="seatItems()"
                    placeholder="Pick a seat"
                    searchPlaceholder="Search by code, type, or zone"
                    formControlName="seatId">
                </lms-searchable-select>
              </div>
            </div>

            <div class="form-control mt-2">
              <div class="label py-1"><span class="label-text">Shift *</span></div>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                <label *ngFor="let sh of shifts"
                       class="border rounded-lg p-2 cursor-pointer transition-all hover:border-primary"
                       [class.border-primary]="allocateForm.value.shift === sh"
                       [class.bg-primary]="allocateForm.value.shift === sh"
                       [class.bg-opacity-10]="allocateForm.value.shift === sh"
                       [class.border-base-300]="allocateForm.value.shift !== sh">
                  <input type="radio" class="hidden" formControlName="shift" [value]="sh" />
                  <div class="text-sm font-medium">{{ sh }}</div>
                  <div class="text-xs opacity-60">{{ shiftLabel(sh) }}</div>
                  <div *ngIf="rateForSelectedSeat(sh) as r" class="text-xs mt-1">₹{{ r | number }}/mo</div>
                </label>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <label class="form-control">
                <div class="label py-1"><span class="label-text">Start date *</span></div>
                <input class="input input-bordered" type="date" formControlName="startDate" />
              </label>
              <label class="form-control">
                <div class="label py-1"><span class="label-text">End date (optional)</span></div>
                <input class="input input-bordered" type="date" formControlName="endDate" />
              </label>
            </div>

            <div class="mt-3" *ngIf="conflictInfo() as info">
              <div class="alert" [class.alert-success]="info.kind==='free'" [class.alert-error]="info.kind==='conflict'">
                <span class="text-sm">{{ info.message }}</span>
              </div>
            </div>

            <div class="card-actions justify-end mt-3">
              <button class="btn btn-ghost" type="button" (click)="resetAllocate()">Reset</button>
              <button class="btn btn-primary" type="submit" [disabled]="allocateForm.invalid || allocateSaving() || conflictInfo()?.kind === 'conflict'">
                <span *ngIf="allocateSaving()" class="loading loading-spinner loading-sm"></span>
                Allocate seat
              </button>
            </div>
          </div>
        </form>

        <div class="card bg-base-100 border border-base-300">
          <div class="card-body">
            <h3 class="card-title text-base">Seat preview</h3>
            <ng-container *ngIf="selectedSeat() as s; else pickSeat">
              <div class="text-3xl font-bold mt-1">{{ s.code }}</div>
              <div class="text-sm opacity-60">{{ s.type }}{{ s.floor ? ' · Floor ' + s.floor : '' }}{{ s.zone ? ' · ' + s.zone : '' }}</div>
              <div class="flex flex-wrap gap-1 mt-2">
                <span *ngFor="let a of s.amenities" class="badge badge-outline badge-sm">{{ a }}</span>
              </div>
              <div class="divider my-2"></div>
              <div class="text-xs uppercase tracking-wider opacity-60 mb-1">Rates / month</div>
              <div class="space-y-1 text-sm">
                <div *ngFor="let sh of shifts" class="flex justify-between">
                  <span class="opacity-70">{{ sh }}</span>
                  <span>{{ s.monthlyRates?.[sh] != null ? '₹' + (s.monthlyRates![sh] | number) : '—' }}</span>
                </div>
              </div>
              <div *ngIf="s.assignments.length" class="divider my-2"></div>
              <div *ngIf="s.assignments.length" class="text-xs uppercase tracking-wider opacity-60 mb-1">Current occupants</div>
              <div class="space-y-1">
                <div *ngFor="let a of s.assignments" class="text-sm flex items-center justify-between gap-2">
                  <span class="flex items-center gap-1">
                    <span class="badge badge-sm"
                          [class.badge-warning]="a.status === 'TEMPORARY'"
                          [class.badge-success]="a.status === 'CONFIRMED'">
                      {{ shortShift(a.shift) }}
                    </span>
                    {{ a.student.fullName }}
                  </span>
                  <span class="opacity-60 text-xs">{{ a.student.code }}</span>
                </div>
              </div>
            </ng-container>
            <ng-template #pickSeat>
              <p class="text-sm opacity-60">Select a seat to preview rates, amenities, and current occupancy.</p>
            </ng-template>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- ============================================ SEAT FORM MODAL ====================================== -->
    <dialog class="modal" [class.modal-open]="seatModal()">
      <div class="modal-box max-w-2xl">
        <form method="dialog"><button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="closeSeatModal()">✕</button></form>
        <h3 class="font-bold text-lg">{{ editingSeat() ? 'Edit seat ' + editingSeat()!.code : 'Add seat' }}</h3>

        <form [formGroup]="seatForm" (ngSubmit)="submitSeat()" class="space-y-3 mt-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Branch *</span></div>
              <select class="select select-bordered" formControlName="branchId">
                <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }} ({{ b.code }})</option>
              </select>
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Seat code *</span></div>
              <input class="input input-bordered" formControlName="code" placeholder="e.g. A-12" />
            </label>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Type *</span></div>
              <select class="select select-bordered" formControlName="type">
                <option value="SEAT">Seat</option>
                <option value="CABIN">Cabin</option>
                <option value="HOT_DESK">Hot desk</option>
              </select>
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Floor</span></div>
              <input class="input input-bordered" formControlName="floor" placeholder="e.g. 1, G" />
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Zone / section</span></div>
              <input class="input input-bordered" formControlName="zone" placeholder="e.g. Reading hall" />
            </label>
          </div>

          <div class="form-control">
            <div class="label py-1"><span class="label-text">Amenities</span></div>
            <div class="flex flex-wrap gap-2">
              <label *ngFor="let a of amenityOptions" class="cursor-pointer">
                <input type="checkbox" class="hidden" [checked]="hasAmenity(a)" (change)="toggleAmenity(a)" />
                <span class="badge p-3" [class.badge-primary]="hasAmenity(a)" [class.badge-outline]="!hasAmenity(a)">
                  {{ a }}
                </span>
              </label>
            </div>
            <div class="join mt-2">
              <input class="input input-bordered input-sm join-item" [(ngModel)]="customAmenity" [ngModelOptions]="{standalone: true}" placeholder="Add custom amenity" />
              <button type="button" class="btn btn-sm join-item" (click)="addCustomAmenity()">Add</button>
            </div>
          </div>

          <div class="form-control">
            <div class="label py-1"><span class="label-text">Monthly rates (INR) by shift</span></div>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              <label *ngFor="let sh of shifts" class="form-control">
                <div class="label py-0"><span class="label-text-alt">{{ sh }}</span></div>
                <input class="input input-bordered input-sm" type="number" min="0" [value]="rateInputs[sh]" (input)="setRate(sh, $event)" placeholder="₹" />
              </label>
            </div>
          </div>

          <label class="form-control">
            <div class="label py-1"><span class="label-text">Notes</span></div>
            <textarea class="textarea textarea-bordered" rows="2" formControlName="notes" placeholder="Anything special about this seat"></textarea>
          </label>

          <label class="cursor-pointer label justify-start gap-2">
            <input type="checkbox" class="toggle toggle-primary toggle-sm" formControlName="isActive" />
            <span class="label-text">Active (available for allocation)</span>
          </label>

          <div class="modal-action flex-wrap">
            <button *ngIf="editingSeat()" type="button" class="btn btn-error btn-outline mr-auto" (click)="deleteSeat()">Delete seat</button>
            <button type="button" class="btn btn-ghost" (click)="closeSeatModal()">Cancel</button>
            <button class="btn btn-primary" type="submit" [disabled]="seatForm.invalid || seatSaving()">
              <span *ngIf="seatSaving()" class="loading loading-spinner loading-sm"></span>
              {{ editingSeat() ? 'Save changes' : 'Create seat' }}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="closeSeatModal()">close</button></form>
    </dialog>

    <!-- ============================================ ALLOCATION VIEW MODAL ================================ -->
    <dialog class="modal" [class.modal-open]="!!viewing()">
      <div class="modal-box max-w-2xl" *ngIf="viewing() as v">
        <form method="dialog"><button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="viewing.set(null)">✕</button></form>
        <h3 class="font-bold text-lg flex items-center gap-2">
          Allocation
          <span class="badge"
            [class.badge-warning]="v.status === 'TEMPORARY'"
            [class.badge-success]="v.status === 'CONFIRMED'"
            [class.badge-ghost]="v.status === 'ENDED'">
            {{ v.status }}
          </span>
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <div>
            <div class="text-xs uppercase tracking-wider opacity-60 mb-2">Student</div>
            <div class="font-medium">{{ v.student?.fullName }}</div>
            <div class="text-sm opacity-70">{{ v.student?.code }} · {{ v.student?.phone }}</div>
          </div>
          <div>
            <div class="text-xs uppercase tracking-wider opacity-60 mb-2">Seat</div>
            <div class="font-medium">{{ v.seat?.code }} <span class="opacity-60">({{ v.seat?.type }})</span></div>
            <div class="text-sm opacity-70">{{ v.seat?.floor ? 'Floor ' + v.seat?.floor : '' }}{{ v.seat?.zone ? ' · ' + v.seat?.zone : '' }}</div>
          </div>
          <div>
            <div class="text-xs uppercase tracking-wider opacity-60 mb-2">Shift</div>
            <div class="badge badge-outline">{{ v.shift }}</div>
          </div>
          <div>
            <div class="text-xs uppercase tracking-wider opacity-60 mb-2">Period</div>
            <div class="text-sm">{{ v.startDate | date:'mediumDate' }} → {{ v.endDate ? (v.endDate | date:'mediumDate') : 'ongoing' }}</div>
          </div>
        </div>

        <div class="divider mt-4 mb-2">Payment progress</div>
        <div class="text-sm">
          <div class="flex justify-between mb-1">
            <span>Paid: <span class="font-medium">₹{{ v.paidAmount | number }}</span></span>
            <span>Monthly rate: {{ v.monthlyRate ? '₹' + (v.monthlyRate | number) : '—' }}</span>
          </div>
          <progress class="progress w-full"
            [class.progress-success]="(v.paidPct ?? 0) >= 50"
            [class.progress-warning]="(v.paidPct ?? 0) < 50"
            [value]="v.paidPct ?? 0" max="100"></progress>
          <div class="text-xs opacity-60 mt-1">
            {{ v.paidPct ?? 0 }}% of monthly rate
            <span *ngIf="(v.paidPct ?? 0) < 50 && v.status === 'TEMPORARY'"> · ≥ 50% needed to confirm</span>
            <span *ngIf="(v.paidPct ?? 0) >= 50 && v.status === 'CONFIRMED'"> · confirmed</span>
          </div>
        </div>

        <div class="modal-action">
          <button *ngIf="v.status !== 'ENDED'" type="button" class="btn btn-error btn-outline" (click)="endAllocation(v)">End allocation</button>
          <button type="button" class="btn" (click)="viewing.set(null)">Close</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="viewing.set(null)">close</button></form>
    </dialog>

    <!-- ============================================ FLOOR-PLAN DETAIL MODAL ============================== -->
    <dialog class="modal" [class.modal-open]="!!floorSeat()">
      <div class="modal-box max-w-xl" *ngIf="floorSeat() as s">
        <form method="dialog">
          <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="floorSeat.set(null)">✕</button>
        </form>

        <div class="flex items-center gap-3 mb-3">
          <div class="px-3 py-2 rounded-lg border-2 font-bold text-xl"
               [class.border-success]="s.isActive && occupiedSlots(s) === 0"
               [class.border-warning]="s.isActive && occupiedSlots(s) > 0 && !isFullyBooked(s)"
               [class.border-error]="s.isActive && isFullyBooked(s)"
               [class.border-base-300]="!s.isActive">
            {{ s.code }}
          </div>
          <div class="flex-1">
            <h3 class="font-bold text-lg flex items-center gap-2">
              {{ s.type | titlecase }}
              <span *ngIf="seatHasOverdue(s)" class="badge badge-error badge-sm animate-pulse">⚠ Overdue</span>
              <span *ngIf="!s.isActive" class="badge badge-ghost badge-sm">inactive</span>
            </h3>
            <p class="text-sm opacity-60">
              {{ s.floor ? 'Floor ' + s.floor : 'No floor' }}<span *ngIf="s.zone"> · {{ s.zone }}</span>
              · <span [class.text-success]="occupiedSlots(s) === 0"
                      [class.text-warning]="occupiedSlots(s) > 0 && !isFullyBooked(s)"
                      [class.text-error]="isFullyBooked(s)">
                {{ occupiedSlots(s) }}/{{ shifts.length }} shifts taken
              </span>
            </p>
          </div>
        </div>

        <div *ngIf="s.amenities.length > 0" class="flex flex-wrap gap-1 mb-3">
          <span *ngFor="let a of s.amenities" class="badge badge-outline badge-sm">{{ a }}</span>
        </div>

        <div class="divider my-2 text-xs">Shift occupancy</div>
        <div class="space-y-2">
          <div *ngFor="let sh of shifts"
               class="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-base-200">
            <div class="flex items-center gap-2 min-w-[110px]">
              <span class="badge badge-outline badge-sm">{{ shiftLabel(sh) }}</span>
            </div>
            <ng-container *ngIf="assignmentForShift(s, sh) as a; else freeShift">
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{{ a.student.fullName }}</div>
                <div class="text-xs opacity-60 truncate">{{ a.student.code }} · {{ a.student.phone }}</div>
              </div>
              <span class="badge badge-sm shrink-0"
                [class.badge-warning]="a.status === 'TEMPORARY'"
                [class.badge-success]="a.status === 'CONFIRMED'">
                {{ a.status }}
              </span>
              <button type="button" class="btn btn-ghost btn-xs text-error" (click)="endAllocationFromDetail(a)">End</button>
            </ng-container>
            <ng-template #freeShift>
              <div class="flex-1 text-sm opacity-50 italic">Free</div>
              <span class="text-xs opacity-60">{{ rateForShift(s, sh) }}</span>
              <button type="button" class="btn btn-ghost btn-xs text-primary" (click)="allocateFromDetail(s, sh)">Allocate</button>
            </ng-template>
          </div>
        </div>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost" (click)="editFromDetail(s)">Edit cabin</button>
          <button type="button" class="btn" (click)="floorSeat.set(null)">Close</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="floorSeat.set(null)">close</button></form>
    </dialog>
  `,
})
export class SeatsListComponent implements OnInit {
  private seatsApi = inject(SeatsApiService);
  private allocApi = inject(SeatAssignmentsApiService);
  private branchesApi = inject(BranchesApiService);
  private studentsApi = inject(StudentsApiService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  tab = signal<TabKey>('manage');
  seats = signal<SeatWithAssignments[]>([]);
  branches = signal<Branch[]>([]);
  branchFilter: string | undefined = undefined;

  // Manage-tab filters + view mode + pagination
  manageFilter = signal<'all' | 'vacant' | 'partial' | 'full' | 'overdue'>('all');
  manageSearch = signal('');
  viewMode = signal<'card' | 'list' | 'floor'>('card');
  seatPage = signal(1);
  seatPageSize = 12;

  shifts = ALL_SHIFTS;
  amenityOptions: string[] = [...COMMON_AMENITIES];
  shiftLabel = (s: Shift) => SHIFT_LABELS[s];
  shortShift = (s: string) => s === 'FULL_DAY' ? 'FULL' : s.slice(0, 3);

  // Allocations tab
  allocations = signal<SeatAssignment[]>([]);
  allocTotal = signal(0);
  allocPage = signal(1);
  allocLimit = 25;
  allocLoading = signal(false);
  allocSearch = '';
  allocStatus: 'TEMPORARY' | 'CONFIRMED' | 'ENDED' | 'ACTIVE' | 'ALL' = 'ACTIVE';
  private allocSearch$ = new Subject<void>();
  viewing = signal<SeatAssignment | null>(null);

  // Allocate tab
  allocatableStudents = signal<StudentLite[]>([]);
  allocateSaving = signal(false);
  allocateForm = this.fb.group({
    studentId: ['', Validators.required],
    seatId: ['', Validators.required],
    shift: [Shift.FULL_DAY, Validators.required],
    startDate: [new Date().toISOString().slice(0, 10), Validators.required],
    endDate: [''],
  });

  studentItems = computed<ComboItem[]>(() =>
    this.allocatableStudents().map((s) => ({
      id: s.id,
      label: s.fullName,
      sublabel: `${s.code} · ${s.phone}`,
    })),
  );

  seatItems = computed<ComboItem[]>(() =>
    this.seats().map((s) => {
      const fullyBooked = this.isFullyBooked(s);
      const occText = this.occupiedSlots(s) === 0
        ? 'All shifts free'
        : `${this.occupiedSlots(s)}/${this.shifts.length} taken${fullyBooked ? ' (full)' : ''}`;
      const sublabel = `${s.type}${s.zone ? ' · ' + s.zone : ''} · ${occText}`;
      const disabled = !s.isActive || fullyBooked;
      return {
        id: s.id,
        label: s.code,
        sublabel,
        badge: !s.isActive ? 'inactive' : (fullyBooked ? 'fully booked' : undefined),
        disabled,
        disabledReason: !s.isActive ? 'Seat is inactive' : (fullyBooked ? 'All shifts already booked' : undefined),
      };
    }),
  );

  availableSeatCount = computed(() =>
    this.seats().filter((s) => s.isActive && !this.isFullyBooked(s)).length,
  );

  filteredSeats = computed(() => {
    const filter = this.manageFilter();
    const q = this.manageSearch().trim().toLowerCase();
    return this.seats().filter((s) => {
      // Status bucket
      const occ = this.occupiedSlots(s);
      switch (filter) {
        case 'vacant': if (occ !== 0) return false; break;
        case 'full': if (!this.isFullyBooked(s)) return false; break;
        case 'partial': if (occ === 0 || this.isFullyBooked(s)) return false; break;
        case 'overdue': if (!this.seatHasOverdue(s)) return false; break;
        case 'all': default: break;
      }
      if (!q) return true;
      const rateMatches = s.monthlyRates &&
        Object.values(s.monthlyRates).some((v) => typeof v === 'number' && String(v).includes(q));
      return s.code.toLowerCase().includes(q)
          || (s.zone?.toLowerCase().includes(q) ?? false)
          || (s.floor?.toLowerCase().includes(q) ?? false)
          || s.type.toLowerCase().includes(q)
          || s.assignments.some((a) =>
                a.student.fullName.toLowerCase().includes(q) ||
                a.student.code.toLowerCase().includes(q))
          || !!rateMatches;
    });
  });

  pagedSeats = computed(() => {
    const all = this.filteredSeats();
    const start = (this.seatPage() - 1) * this.seatPageSize;
    return all.slice(start, start + this.seatPageSize);
  });

  seatTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredSeats().length / this.seatPageSize));
  }
  seatRangeEnd(): number {
    return Math.min(this.seatPage() * this.seatPageSize, this.filteredSeats().length);
  }
  seatGoTo(p: number) {
    const tp = this.seatTotalPages();
    if (p < 1 || p > tp || p === this.seatPage()) return;
    this.seatPage.set(p);
  }
  onSeatPageSizeChange() {
    this.seatPage.set(1);
  }
  setManageFilter(f: 'all' | 'vacant' | 'partial' | 'full' | 'overdue') {
    this.manageFilter.set(f);
    this.seatPage.set(1);
  }

  countByFilter(f: 'vacant' | 'partial' | 'full' | 'overdue'): number {
    return this.seats().filter((s) => {
      switch (f) {
        case 'vacant': return this.occupiedSlots(s) === 0;
        case 'full': return this.isFullyBooked(s);
        case 'partial': return this.occupiedSlots(s) > 0 && !this.isFullyBooked(s);
        case 'overdue': return this.seatHasOverdue(s);
      }
    }).length;
  }

  seatHasOverdue(s: SeatWithAssignments): boolean {
    const today = new Date().toISOString().slice(0, 10);
    return s.assignments.some((a) =>
      a.nextDueDate != null && a.nextDueDate.slice(0, 10) < today,
    );
  }

  selectedSeat = computed(() => this.seats().find((s) => s.id === this.allocateForm.value.seatId) ?? null);

  conflictInfo = computed(() => {
    const seat = this.selectedSeat();
    const shift = this.allocateForm.value.shift as Shift | undefined;
    if (!seat || !shift) return null;
    const conflicting = this.conflictingShifts(shift);
    const conflict = seat.assignments.find((a) => conflicting.includes(a.shift as Shift));
    if (conflict) {
      return {
        kind: 'conflict' as const,
        message: `${seat.code} is already booked for ${conflict.shift} by ${conflict.student.fullName} (${conflict.student.code}).`,
      };
    }
    const rate = seat.monthlyRates?.[shift];
    return {
      kind: 'free' as const,
      message: `${seat.code} is FREE for ${shift}.` + (rate != null ? ` Rate ₹${rate}/month. Starts as TEMPORARY until ≥50% paid.` : ''),
    };
  });

  rateForSelectedSeat(sh: Shift): number | null {
    return this.selectedSeat()?.monthlyRates?.[sh] ?? null;
  }

  // Seat add/edit modal
  seatModal = signal(false);
  editingSeat = signal<SeatWithAssignments | null>(null);
  seatSaving = signal(false);
  customAmenity = '';
  rateInputs: Record<Shift, string> = { MORNING: '', AFTERNOON: '', EVENING: '', NIGHT: '', FULL_DAY: '' } as any;
  seatForm = this.fb.group({
    branchId: ['', Validators.required],
    code: ['', Validators.required],
    type: [SeatType.SEAT, Validators.required],
    floor: [''],
    zone: [''],
    amenities: [[] as string[]],
    notes: [''],
    isActive: [true],
  });

  ngOnInit() {
    this.branchesApi.list().subscribe((bs) => this.branches.set(bs));
    this.reloadSeats();
    this.allocSearch$.pipe(debounceTime(250)).subscribe(() => {
      this.allocPage.set(1);
      this.reloadAllocations();
    });
  }

  onBranchChange() {
    this.seatPage.set(1);
    this.reloadSeats();
    if (this.tab() === 'allocations') this.reloadAllocations();
    if (this.tab() === 'allocate') this.loadAllocatableStudents();
  }

  onTabAllocations() {
    this.tab.set('allocations');
    this.reloadAllocations();
  }
  onTabAllocate() {
    this.tab.set('allocate');
    this.loadAllocatableStudents();
  }

  reloadSeats() {
    this.seatsApi.list(this.branchFilter).subscribe({
      next: (rows) => this.seats.set(rows),
      error: () => this.toast.error('Could not load seats'),
    });
  }

  loadAllocatableStudents() {
    this.studentsApi.list({
      limit: 200, sortBy: 'fullName', sortOrder: 'asc',
      status: 'ACTIVE',
      notAllocated: true,
    } as any).subscribe({
      next: (r) => this.allocatableStudents.set(r.data as any),
      error: () => this.toast.error('Could not load students'),
    });
  }

  reloadAllocations() {
    this.allocLoading.set(true);
    this.allocApi.list({
      branchId: this.branchFilter,
      search: this.allocSearch || undefined,
      status: this.allocStatus,
      page: this.allocPage(),
      limit: this.allocLimit,
    }).subscribe({
      next: (res) => {
        this.allocations.set(res.data);
        this.allocTotal.set(res.total);
        this.allocLoading.set(false);
      },
      error: () => {
        this.allocLoading.set(false);
        this.toast.error('Could not load allocations');
      },
    });
  }

  onAllocSearch() { this.allocSearch$.next(); }
  onAllocFilterChange() { this.allocPage.set(1); this.reloadAllocations(); }
  onAllocPageSize() { this.allocPage.set(1); this.reloadAllocations(); }
  allocGoTo(p: number) {
    const tp = this.allocTotalPages();
    if (p < 1 || p > tp || p === this.allocPage()) return;
    this.allocPage.set(p);
    this.reloadAllocations();
  }
  allocTotalPages(): number { return Math.max(1, Math.ceil(this.allocTotal() / this.allocLimit)); }
  allocRangeEnd(): number { return Math.min(this.allocPage() * this.allocLimit, this.allocTotal()); }

  // ---- Seat card helpers ----
  bestRate(s: SeatWithAssignments): string {
    const rates = s.monthlyRates;
    if (!rates) return '—';
    const v = rates.FULL_DAY ?? Math.min(...Object.values(rates).filter((x): x is number => typeof x === 'number'));
    return v ? `₹${v}/mo` : '—';
  }
  shiftTaken(s: SeatWithAssignments, shift: Shift): boolean {
    return s.assignments.some((a) => a.shift === shift || a.shift === Shift.FULL_DAY)
        || (shift === Shift.FULL_DAY && s.assignments.length > 0);
  }
  shiftStatus(s: SeatWithAssignments, shift: Shift): SeatAssignmentStatus | null {
    const a = s.assignments.find((x) => x.shift === shift || x.shift === Shift.FULL_DAY);
    return a ? (a.status as SeatAssignmentStatus) : null;
  }
  shiftBarTitle(s: SeatWithAssignments, sh: Shift): string {
    const a = s.assignments.find((x) => x.shift === sh || x.shift === Shift.FULL_DAY);
    if (!a) return `Free — ${this.shiftLabel(sh)}`;
    return `${a.student.fullName} (${a.shift}, ${a.status})`;
  }
  occupiedSlots(s: SeatWithAssignments): number {
    if (s.assignments.some((a) => a.shift === Shift.FULL_DAY)) return this.shifts.length;
    return s.assignments.length;
  }
  isFullyBooked(s: SeatWithAssignments): boolean {
    if (s.assignments.some((a) => a.shift === Shift.FULL_DAY)) return true;
    // Partial shifts: 4 of them = full (since FULL_DAY isn't a real slot once you have all 4 partials).
    const partialShifts = this.shifts.filter((sh) => sh !== Shift.FULL_DAY);
    return s.assignments.length >= partialShifts.length;
  }

  // ---- Floor-plan view ----
  floorSeat = signal<SeatWithAssignments | null>(null);

  floorGroups = computed(() => {
    const out = new Map<string, SeatWithAssignments[]>();
    for (const s of this.filteredSeats()) {
      const key = (s.floor || '').trim() || 'Unassigned';
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(s);
    }
    return [...out.entries()]
      .map(([floor, seats]) => ({
        floor,
        seats: [...seats].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
      }))
      .sort((a, b) => {
        if (a.floor === 'Unassigned') return 1;
        if (b.floor === 'Unassigned') return -1;
        return a.floor.localeCompare(b.floor, undefined, { numeric: true });
      });
  });

  floorCount(seats: SeatWithAssignments[], bucket: 'vacant' | 'partial' | 'full'): number {
    return seats.filter((s) => {
      if (!s.isActive) return false;
      const occ = this.occupiedSlots(s);
      if (bucket === 'vacant') return occ === 0;
      if (bucket === 'full') return this.isFullyBooked(s);
      return occ > 0 && !this.isFullyBooked(s);
    }).length;
  }

  floorTileTitle(s: SeatWithAssignments): string {
    if (!s.isActive) return `${s.code} — inactive`;
    const occ = this.occupiedSlots(s);
    if (occ === 0)                     return `${s.code} — all shifts free`;
    if (this.isFullyBooked(s))         return `${s.code} — fully booked`;
    return `${s.code} — ${occ}/${this.shifts.length} shifts taken`;
  }

  openFloorDetail(s: SeatWithAssignments) {
    this.floorSeat.set(s);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  /** Returns the assignment occupying the given shift, accounting for FULL_DAY. */
  assignmentForShift(s: SeatWithAssignments, sh: Shift): SeatWithAssignments['assignments'][number] | null {
    const exact = s.assignments.find((a) => a.shift === sh);
    if (exact) return exact;
    if (sh !== Shift.FULL_DAY) {
      // a FULL_DAY booking blocks every individual shift
      const fullDay = s.assignments.find((a) => a.shift === Shift.FULL_DAY);
      if (fullDay) return fullDay;
    }
    return null;
  }

  rateForShift(s: SeatWithAssignments, sh: Shift): string {
    const rates = (s.monthlyRates ?? {}) as Partial<MonthlyRates>;
    const v = rates[sh];
    return typeof v === 'number' ? `₹${v.toLocaleString('en-IN')}` : '—';
  }

  endAllocationFromDetail(a: SeatWithAssignments['assignments'][number]) {
    const seat = this.floorSeat();
    if (!seat) return;
    if (!confirm(`End allocation of ${seat.code} for ${a.student.fullName}?`)) return;
    this.allocApi.end(a.id).subscribe({
      next: () => {
        this.toast.success('Allocation ended');
        this.floorSeat.set(null);
        this.reloadSeats();
        if (this.tab() === 'allocations') this.reloadAllocations();
        this.loadAllocatableStudents();
      },
      error: (err) => this.toast.error(err.error?.message ?? 'Failed to end'),
    });
  }

  allocateFromDetail(s: SeatWithAssignments, sh: Shift) {
    this.floorSeat.set(null);
    this.onTabAllocate();
    // Pre-fill the allocate form with the cabin + shift the user picked.
    this.allocateForm.patchValue({ seatId: s.id, shift: sh });
  }

  editFromDetail(s: SeatWithAssignments) {
    this.floorSeat.set(null);
    this.openEditSeat(s);
  }

  // ---- Seat modal ----
  openAddSeat() {
    this.editingSeat.set(null);
    this.seatForm.reset({
      branchId: this.branches()[0]?.id ?? '',
      code: '',
      type: SeatType.SEAT,
      floor: '',
      zone: '',
      amenities: [],
      notes: '',
      isActive: true,
    });
    this.rateInputs = { MORNING: '', AFTERNOON: '', EVENING: '', NIGHT: '', FULL_DAY: '' } as any;
    this.seatModal.set(true);
  }
  openEditSeat(s: SeatWithAssignments) {
    this.editingSeat.set(s);
    this.seatForm.reset({
      branchId: s.branchId,
      code: s.code,
      type: s.type,
      floor: s.floor ?? '',
      zone: s.zone ?? '',
      amenities: [...s.amenities],
      notes: s.notes ?? '',
      isActive: s.isActive,
    });
    this.rateInputs = { MORNING: '', AFTERNOON: '', EVENING: '', NIGHT: '', FULL_DAY: '' } as any;
    for (const sh of this.shifts) {
      const v = s.monthlyRates?.[sh];
      if (v != null) this.rateInputs[sh] = String(v);
    }
    this.seatModal.set(true);
  }
  closeSeatModal() {
    this.seatModal.set(false);
    this.seatSaving.set(false);
  }

  hasAmenity(a: string): boolean {
    return (this.seatForm.value.amenities ?? []).includes(a);
  }
  toggleAmenity(a: string) {
    const cur = this.seatForm.value.amenities ?? [];
    const next = cur.includes(a) ? cur.filter((x: string) => x !== a) : [...cur, a];
    this.seatForm.patchValue({ amenities: next });
  }
  addCustomAmenity() {
    const v = this.customAmenity.trim();
    if (!v) return;
    if (!this.hasAmenity(v)) this.toggleAmenity(v);
    if (!this.amenityOptions.includes(v)) this.amenityOptions = [...this.amenityOptions, v];
    this.customAmenity = '';
  }
  setRate(sh: Shift, ev: Event) {
    this.rateInputs[sh] = (ev.target as HTMLInputElement).value;
  }

  submitSeat() {
    if (this.seatForm.invalid) return;
    this.seatSaving.set(true);
    const v = this.seatForm.getRawValue();
    const monthlyRates: MonthlyRates = {};
    for (const sh of this.shifts) {
      const n = parseFloat(this.rateInputs[sh]);
      if (!isNaN(n) && n >= 0) monthlyRates[sh] = n;
    }
    const payload: any = {
      branchId: v.branchId,
      code: v.code,
      type: v.type,
      floor: v.floor || undefined,
      zone: v.zone || undefined,
      amenities: v.amenities ?? [],
      monthlyRates: Object.keys(monthlyRates).length ? monthlyRates : undefined,
      notes: v.notes || undefined,
      isActive: v.isActive,
    };
    const existing = this.editingSeat();
    const obs = existing ? this.seatsApi.update(existing.id, payload) : this.seatsApi.create(payload);
    obs.subscribe({
      next: (s) => {
        this.toast.success(existing ? `Updated ${s.code}` : `Created ${s.code}`);
        this.closeSeatModal();
        this.reloadSeats();
      },
      error: (err) => {
        const msg = err.error?.message ?? 'Save failed';
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : msg);
        this.seatSaving.set(false);
      },
    });
  }

  deleteSeat() {
    const s = this.editingSeat();
    if (!s || !confirm(`Delete seat ${s.code}? Active allocations will be cascaded.`)) return;
    this.seatsApi.remove(s.id).subscribe({
      next: () => {
        this.toast.success(`Deleted ${s.code}`);
        this.closeSeatModal();
        this.reloadSeats();
        if (this.tab() === 'allocations') this.reloadAllocations();
      },
      error: (err) => this.toast.error(err.error?.message ?? 'Delete failed'),
    });
  }

  // ---- Allocate ----
  submitAllocation() {
    if (this.allocateForm.invalid) return;
    this.allocateSaving.set(true);
    const v = this.allocateForm.getRawValue();
    const payload = {
      studentId: v.studentId!,
      seatId: v.seatId!,
      shift: v.shift!,
      startDate: v.startDate!,
      endDate: v.endDate || undefined,
    };
    this.allocApi.create(payload).subscribe({
      next: (a) => {
        const statusLabel = a.status === 'CONFIRMED' ? 'CONFIRMED (≥50% paid)' : 'TEMPORARY';
        this.toast.success(`Allocated ${a.seat?.code} to ${a.student?.fullName} as ${statusLabel}`);
        this.allocateSaving.set(false);
        this.resetAllocate();
        this.reloadSeats();
        this.loadAllocatableStudents();
        this.onTabAllocations();
      },
      error: (err) => {
        const msg = err.error?.message ?? 'Allocation failed';
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : msg);
        this.allocateSaving.set(false);
      },
    });
  }

  resetAllocate() {
    this.allocateForm.reset({
      studentId: '',
      seatId: '',
      shift: Shift.FULL_DAY,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
    });
  }

  endAllocation(a: SeatAssignment) {
    if (!confirm(`End allocation of ${a.seat?.code} for ${a.student?.fullName}?`)) return;
    this.allocApi.end(a.id).subscribe({
      next: () => {
        this.toast.success('Allocation ended');
        this.viewing.set(null);
        this.reloadSeats();
        if (this.tab() === 'allocations') this.reloadAllocations();
        this.loadAllocatableStudents();
      },
      error: (err) => this.toast.error(err.error?.message ?? 'Failed to end'),
    });
  }

  private conflictingShifts(s: Shift): Shift[] {
    if (s === Shift.FULL_DAY) return [...this.shifts];
    return [s, Shift.FULL_DAY];
  }
}
