import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  Availability, AssignBedDto, BedAssignment, CreatePgRoomDto, PgRoom, PgRoomStats,
  PgRoomType, PgRoomsApiService, RoomBed, PgRoomHistoryRow,
} from './pg-rooms.service';
import { BranchesApiService, Branch } from '../students/branches.service';
import { StudentsApiService } from '../students/students.service';
import { Student } from '@lms/shared';
import { ToastService } from '../../core/services/toast.service';
import { SearchableSelectComponent, ComboItem } from '../../shared/components/searchable-select.component';

type SortField = 'number' | 'price' | 'occupancy';

@Component({
  selector: 'lms-pg-rooms',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent],
  template: `
    <!-- =============================== HEADER =============================== -->
    <div class="flex items-end justify-between mb-4 flex-wrap gap-2">
      <div>
        <h1 class="text-2xl font-bold">PG Rooms</h1>
        <p class="text-sm opacity-60 mt-1">Manage multi-bed accommodations and assignments</p>
      </div>
      <div class="flex items-center gap-2">
        <div class="join">
          <button class="join-item btn btn-md btn-square" [class.btn-active]="view() === 'grid'" (click)="view.set('grid')" title="Grid view">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h6v6H4zM14 6h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
            </svg>
          </button>
          <button class="join-item btn btn-md btn-square" [class.btn-active]="view() === 'list'" (click)="view.set('list')" title="List view">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        <button class="btn btn-primary btn-sm" (click)="openCreate()">+ Add room</button>
      </div>
    </div>

    <!-- =============================== KPI STRIP =============================== -->
    <div class="card bg-base-100 border border-base-300 shadow-sm mb-4">
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-base-200">
        <div class="px-5 py-4">
          <div class="text-[11px] uppercase tracking-wider opacity-60 mb-1">Total Rooms</div>
          <div class="text-3xl font-bold leading-none">{{ stats()?.totalRooms ?? 0 }}</div>
        </div>
        <div class="px-5 py-4">
          <div class="text-[11px] uppercase tracking-wider opacity-60 mb-1">Total Beds</div>
          <div class="text-3xl font-bold leading-none">{{ stats()?.totalBeds ?? 0 }}</div>
        </div>
        <div class="px-5 py-4">
          <div class="text-[11px] uppercase tracking-wider opacity-60 mb-1">Occupied Beds</div>
          <div class="text-3xl font-bold leading-none text-error">{{ stats()?.occupiedBeds ?? 0 }}</div>
        </div>
        <div class="px-5 py-4">
          <div class="text-[11px] uppercase tracking-wider opacity-60 mb-1">Available Beds</div>
          <div class="text-3xl font-bold leading-none text-success">{{ stats()?.availableBeds ?? 0 }}</div>
        </div>
        <div class="px-5 py-4">
          <div class="text-[11px] uppercase tracking-wider opacity-60 mb-1">Single / Double</div>
          <div class="text-3xl font-bold leading-none">{{ stats()?.singleRooms ?? 0 }}<span class="opacity-40 text-2xl"> / </span>{{ stats()?.doubleRooms ?? 0 }}</div>
        </div>
        <div class="px-5 py-4">
          <div class="text-[11px] uppercase tracking-wider opacity-60 mb-1">Triple Rooms</div>
          <div class="text-3xl font-bold leading-none">{{ stats()?.tripleRooms ?? 0 }}</div>
        </div>
      </div>
    </div>

    <!-- =============================== FILTER BAR =============================== -->
    <div class="card bg-base-100 border border-base-300 shadow-sm mb-4">
      <div class="p-3 flex flex-row flex-wrap items-center gap-2">
        <label class="input input-bordered flex items-center gap-2 flex-1 min-w-[260px]">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input class="grow" [(ngModel)]="search" (ngModelChange)="reload()"
                 placeholder="Search by room number or student name…" />
          <button *ngIf="search" class="opacity-60 hover:opacity-100 px-1" (click)="search=''; reload()">✕</button>
        </label>
        <button class="btn btn-square btn-ghost" title="Filters">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h18M6 8h12M9 12h6M11 16h2" />
          </svg>
        </button>
        <select class="select select-bordered" [(ngModel)]="typeFilter" (ngModelChange)="reload()">
          <option [ngValue]="undefined">All Types</option>
          <option value="SINGLE">Single</option>
          <option value="DOUBLE">Double</option>
          <option value="TRIPLE">Triple</option>
        </select>
        <select class="select select-bordered" [(ngModel)]="availability" (ngModelChange)="reload()">
          <option value="ALL">All Availability</option>
          <option value="AVAILABLE">Available</option>
          <option value="PARTIAL">Partial</option>
          <option value="FULL">Full</option>
        </select>
        <select class="select select-bordered" [ngModel]="sortField()" (ngModelChange)="setSort($event)">
          <option value="number">Sort by Number</option>
          <option value="price">Sort by Price</option>
          <option value="occupancy">Sort by Occupancy</option>
        </select>
      </div>
    </div>

    <!-- =============================== ROOM CARDS =============================== -->
    <div *ngIf="loading()" class="text-center py-10"><span class="loading loading-spinner loading-md"></span></div>

    <div *ngIf="!loading() && sortedRooms().length === 0" class="text-center opacity-60 py-12 card bg-base-100 border border-base-300">
      <div class="text-base mb-1">No PG rooms match your filters.</div>
      <button class="link link-primary text-sm" (click)="openCreate()">Add the first room →</button>
    </div>

    <!-- GRID VIEW -->
    <div *ngIf="view() === 'grid' && sortedRooms().length > 0" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div *ngFor="let r of sortedRooms()" class="card bg-base-100 border border-base-300 shadow-sm hover:shadow-md transition-shadow">
        <div class="card-body p-5">
          <!-- Top row -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <span class="text-2xl font-bold leading-none">{{ r.roomNumber }}</span>
              <button class="btn btn-ghost btn-xs btn-square opacity-40 hover:opacity-100 hover:text-error"
                      (click)="confirmDelete(r)" title="Delete room">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
                </svg>
              </button>
            </div>
            <span class="badge badge-outline" [class]="typeBadgeClass(r.type)">{{ typeLabel(r.type) }}</span>
          </div>

          <div class="text-sm opacity-70 mt-2">₹{{ r.monthlyRate | number }}/mo per bed</div>

          <!-- Occupancy summary + progress -->
          <div class="mt-2">
            <div class="flex items-center justify-between text-sm">
              <span class="opacity-70">{{ r.occupiedBeds }}/{{ r.bedCount }} beds occupied</span>
              <span class="text-xs font-medium"
                    [class.text-success]="r.occupiedBeds === 0"
                    [class.text-warning]="r.occupiedBeds > 0 && r.occupiedBeds < r.bedCount"
                    [class.text-error]="r.occupiedBeds === r.bedCount">
                {{ r.occupiedBeds === 0 ? 'Available' : r.occupiedBeds === r.bedCount ? 'Full' : 'Partial' }}
              </span>
            </div>
            <div class="h-1.5 mt-1.5 rounded-full bg-base-200 overflow-hidden">
              <div class="h-full transition-all"
                   [class.bg-success]="r.occupiedBeds === 0"
                   [class.bg-warning]="r.occupiedBeds > 0 && r.occupiedBeds < r.bedCount"
                   [class.bg-error]="r.occupiedBeds === r.bedCount"
                   [style.width.%]="(r.occupiedBeds / r.bedCount) * 100"></div>
            </div>
          </div>

          <!-- Bed slot grid -->
          <div class="grid gap-2 mt-4" [class]="bedGridClass(r.bedCount)">
            <div *ngFor="let b of r.beds"
                 class="rounded-xl p-3 text-center transition-all"
                 [class.border]="b.status === 'AVAILABLE'"
                 [class.border-dashed]="b.status === 'AVAILABLE'"
                 [class.border-base-300]="b.status === 'AVAILABLE'"
                 [class.bg-base-200]="b.status === 'OCCUPIED'">
              <div class="text-[10px] uppercase tracking-wider opacity-50 font-semibold mb-2">BED {{ b.bedNumber }}</div>

              <ng-container *ngIf="b.status === 'AVAILABLE'">
                <div class="w-10 h-10 rounded-full bg-base-100 border border-base-200 grid place-items-center mx-auto">
                  <span class="text-lg opacity-40">+</span>
                </div>
                <div class="text-xs opacity-60 mt-2">Available</div>
                <button class="btn btn-outline btn-xs mt-2 w-full"
                        (click)="openAssign(r, b.bedNumber)">Assign</button>
              </ng-container>

              <ng-container *ngIf="b.status === 'OCCUPIED' && b.assignment as a">
                <div class="w-10 h-10 rounded-full grid place-items-center mx-auto text-white text-xs font-semibold"
                     [class]="avatarHueClass(a.student.id)">
                  {{ initials(a.student.fullName) }}
                </div>
                <div class="text-xs font-semibold truncate mt-1.5" [title]="a.student.fullName">{{ a.student.fullName }}</div>
                <div class="text-[10px] opacity-60 truncate">{{ a.student.code }}</div>
                <div class="text-[10px] opacity-70 mt-1" *ngIf="a.nextDueDate">
                  Due: <span class="font-medium">{{ a.nextDueDate | date:'dd MMM yy' }}</span>
                </div>
                <button class="btn btn-ghost btn-xs mt-1.5 text-error hover:bg-error hover:bg-opacity-10"
                        (click)="confirmUnassign(r, a)">Unassign</button>
              </ng-container>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between mt-4 pt-3 border-t border-base-200">
            <button class="link link-primary text-xs font-medium" (click)="openDetails(r)">View Details</button>
            <div class="dropdown dropdown-end">
              <div tabindex="0" role="button" class="btn btn-ghost btn-xs btn-square opacity-60 hover:opacity-100">⋯</div>
              <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 w-44 p-2 border border-base-300">
                <li><a (click)="openDetails(r)"><span>👁</span> View details</a></li>
                <li><a (click)="openHistory(r)"><span>🕓</span> Assignment history</a></li>
                <li><a class="text-error" (click)="confirmDelete(r)"><span>🗑</span> Delete room</a></li>
              </ul>
            </div>
          </div>
          <div class="text-[10px] uppercase tracking-wider opacity-40 mt-2 flex items-center gap-1">
            🕓 {{ r.historyCount }} student{{ r.historyCount === 1 ? '' : 's' }} in history
          </div>
        </div>
      </div>
    </div>

    <!-- LIST VIEW -->
    <div *ngIf="view() === 'list' && sortedRooms().length > 0" class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="table">
          <thead class="bg-base-200">
            <tr class="text-xs uppercase tracking-wider">
              <th>Room</th>
              <th>Type</th>
              <th>Rate</th>
              <th>Occupancy</th>
              <th>Beds</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of sortedRooms()" class="hover">
              <td>
                <div class="font-semibold text-lg">{{ r.roomNumber }}</div>
                <div class="text-xs opacity-60" *ngIf="r.floor">Floor: {{ r.floor }}</div>
              </td>
              <td><span class="badge badge-outline" [class]="typeBadgeClass(r.type)">{{ typeLabel(r.type) }}</span></td>
              <td>₹{{ r.monthlyRate | number }}<span class="opacity-50 text-xs">/mo per bed</span></td>
              <td>
                <div class="flex items-center gap-2 text-sm">
                  <span>{{ r.occupiedBeds }}/{{ r.bedCount }}</span>
                  <div class="h-1.5 w-20 rounded-full bg-base-200 overflow-hidden">
                    <div class="h-full"
                         [class.bg-success]="r.occupiedBeds === 0"
                         [class.bg-warning]="r.occupiedBeds > 0 && r.occupiedBeds < r.bedCount"
                         [class.bg-error]="r.occupiedBeds === r.bedCount"
                         [style.width.%]="(r.occupiedBeds / r.bedCount) * 100"></div>
                  </div>
                </div>
              </td>
              <td>
                <div class="flex flex-wrap gap-1">
                  <ng-container *ngFor="let b of r.beds">
                    <span *ngIf="b.status === 'AVAILABLE'"
                          class="badge badge-sm badge-ghost cursor-pointer hover:bg-primary hover:text-primary-content"
                          (click)="openAssign(r, b.bedNumber)" title="Click to assign">
                      Bed {{ b.bedNumber }} +
                    </span>
                    <span *ngIf="b.status === 'OCCUPIED' && b.assignment as a"
                          class="badge badge-sm badge-success badge-outline gap-1"
                          [title]="a.student.fullName + ' · ' + a.student.code">
                      Bed {{ b.bedNumber }} · {{ shortName(a.student.fullName) }}
                    </span>
                  </ng-container>
                </div>
              </td>
              <td class="text-right">
                <div class="dropdown dropdown-end">
                  <div tabindex="0" role="button" class="btn btn-ghost btn-sm btn-square">⋯</div>
                  <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 w-44 p-2 border border-base-300">
                    <li><a (click)="openDetails(r)"><span>👁</span> View details</a></li>
                    <li><a (click)="openHistory(r)"><span>🕓</span> History</a></li>
                    <li><a class="text-error" (click)="confirmDelete(r)"><span>🗑</span> Delete room</a></li>
                  </ul>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- =============================== CREATE ROOM MODAL =============================== -->
    <dialog class="modal" [class.modal-open]="createOpen()">
      <div class="modal-box max-w-lg">
        <form method="dialog"><button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="createOpen.set(false)">✕</button></form>
        <h3 class="font-bold text-lg">Add PG Room</h3>
        <form [formGroup]="createForm" (ngSubmit)="submitCreate()" class="space-y-3 mt-3">
          <div class="grid grid-cols-2 gap-3">
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Branch *</span></div>
              <select class="select select-bordered" formControlName="branchId">
                <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }} ({{ b.code }})</option>
              </select>
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Room number *</span></div>
              <input class="input input-bordered" formControlName="roomNumber" placeholder="e.g. F-25" />
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Type *</span></div>
              <select class="select select-bordered" formControlName="type" (change)="onTypeChange()">
                <option value="SINGLE">Single (1 bed)</option>
                <option value="DOUBLE">Double (2 beds)</option>
                <option value="TRIPLE">Triple (3 beds)</option>
              </select>
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Beds *</span></div>
              <input class="input input-bordered" type="number" min="1" max="8" formControlName="bedCount" />
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Monthly rate per bed (₹) *</span></div>
              <input class="input input-bordered" type="number" min="0" formControlName="monthlyRate" placeholder="0" />
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Floor</span></div>
              <input class="input input-bordered" formControlName="floor" placeholder="(optional)" />
            </label>
          </div>
          <label class="form-control">
            <div class="label py-1"><span class="label-text">Notes</span></div>
            <input class="input input-bordered" formControlName="notes" placeholder="Amenities, restrictions, etc." />
          </label>
          <div class="modal-action">
            <button type="button" class="btn btn-ghost" (click)="createOpen.set(false)">Cancel</button>
            <button class="btn btn-primary" type="submit" [disabled]="createForm.invalid || saving()">
              <span *ngIf="saving()" class="loading loading-spinner loading-sm"></span>
              Add Room
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="createOpen.set(false)">close</button></form>
    </dialog>

    <!-- =============================== ASSIGN BED MODAL =============================== -->
    <dialog class="modal" [class.modal-open]="!!assignTarget()">
      <div class="modal-box max-w-md" *ngIf="assignTarget() as ctx">
        <form method="dialog"><button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="closeAssign()">✕</button></form>
        <h3 class="font-bold text-lg">Assign student to Room {{ ctx.room.roomNumber }} · Bed {{ ctx.bedNumber }}</h3>
        <p class="text-sm opacity-60">{{ typeLabel(ctx.room.type) }} · ₹{{ ctx.room.monthlyRate | number }}/mo per bed</p>

        <form [formGroup]="assignForm" (ngSubmit)="submitAssign()" class="space-y-3 mt-3">
          <div class="form-control">
            <div class="label py-1"><span class="label-text">Student *</span></div>
            <lms-searchable-select
                [items]="studentItems()"
                placeholder="Pick a student"
                searchPlaceholder="Search name, code, or phone"
                formControlName="studentId">
            </lms-searchable-select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Monthly rate (₹)</span></div>
              <input class="input input-bordered" type="number" min="0" formControlName="monthlyRate" />
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Next due date</span></div>
              <input class="input input-bordered" type="date" formControlName="nextDueDate" />
            </label>
          </div>
          <label class="form-control">
            <div class="label py-1"><span class="label-text">Notes</span></div>
            <input class="input input-bordered" formControlName="notes" placeholder="(optional)" />
          </label>
          <div class="modal-action">
            <button type="button" class="btn btn-ghost" (click)="closeAssign()">Cancel</button>
            <button class="btn btn-primary" type="submit" [disabled]="assignForm.invalid || saving()">
              <span *ngIf="saving()" class="loading loading-spinner loading-sm"></span>
              Assign
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="closeAssign()">close</button></form>
    </dialog>

    <!-- =============================== UNASSIGN CONFIRM =============================== -->
    <dialog class="modal" [class.modal-open]="!!unassignTarget()">
      <div class="modal-box" *ngIf="unassignTarget() as ctx">
        <h3 class="font-bold text-lg">End assignment?</h3>
        <p class="py-2">
          Release <strong>{{ ctx.assignment.student.fullName }}</strong> ({{ ctx.assignment.student.code }})
          from room <strong>{{ ctx.room.roomNumber }}</strong>?
          The assignment will be moved to history.
        </p>
        <div class="modal-action">
          <button class="btn btn-ghost" (click)="unassignTarget.set(null)">Cancel</button>
          <button class="btn btn-error" (click)="doUnassign()">End assignment</button>
        </div>
      </div>
    </dialog>

    <!-- =============================== DELETE CONFIRM =============================== -->
    <dialog class="modal" [class.modal-open]="!!deleting()">
      <div class="modal-box" *ngIf="deleting() as d">
        <h3 class="font-bold text-lg">Delete room {{ d.roomNumber }}?</h3>
        <p class="py-2" *ngIf="d.occupiedBeds === 0">
          The room will be deactivated. Past assignments remain in history.
        </p>
        <p class="py-2 text-error" *ngIf="d.occupiedBeds > 0">
          ⚠ Cannot delete — {{ d.occupiedBeds }} bed{{ d.occupiedBeds === 1 ? ' is' : 's are' }} currently assigned. Unassign them first.
        </p>
        <div class="modal-action">
          <button class="btn btn-ghost" (click)="deleting.set(null)">Cancel</button>
          <button class="btn btn-error" (click)="doDelete()" [disabled]="d.occupiedBeds > 0">Delete room</button>
        </div>
      </div>
    </dialog>

    <!-- =============================== DETAILS / HISTORY MODAL =============================== -->
    <dialog class="modal" [class.modal-open]="!!detailsRoom()">
      <div class="modal-box max-w-2xl" *ngIf="detailsRoom() as r">
        <form method="dialog"><button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="detailsRoom.set(null)">✕</button></form>
        <h3 class="font-bold text-lg flex items-center gap-2">
          Room {{ r.roomNumber }}
          <span class="badge" [class]="typeBadgeClass(r.type)">{{ typeLabel(r.type) }}</span>
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
          <div><div class="opacity-60 text-xs">Beds</div><div class="font-medium">{{ r.bedCount }}</div></div>
          <div><div class="opacity-60 text-xs">Rate/bed</div><div class="font-medium">₹{{ r.monthlyRate | number }}</div></div>
          <div><div class="opacity-60 text-xs">Floor</div><div class="font-medium">{{ r.floor || '—' }}</div></div>
          <div><div class="opacity-60 text-xs">Occupancy</div><div class="font-medium">{{ r.occupiedBeds }} / {{ r.bedCount }}</div></div>
        </div>
        <div *ngIf="r.amenities.length > 0" class="mt-3">
          <div class="opacity-60 text-xs mb-1">Amenities</div>
          <div class="flex flex-wrap gap-1">
            <span *ngFor="let a of r.amenities" class="badge badge-outline badge-sm">{{ a }}</span>
          </div>
        </div>
        <div *ngIf="r.notes" class="mt-3">
          <div class="opacity-60 text-xs">Notes</div>
          <div class="text-sm">{{ r.notes }}</div>
        </div>

        <div class="divider my-3 text-xs">Assignment history ({{ history().length }})</div>
        <div *ngIf="history().length === 0" class="text-center opacity-60 py-4 text-sm">No past assignments.</div>
        <div class="overflow-x-auto max-h-72" *ngIf="history().length > 0">
          <table class="table table-sm">
            <thead><tr><th>Student</th><th>Bed</th><th>Period</th><th>Rate</th><th>Status</th></tr></thead>
            <tbody>
              <tr *ngFor="let h of history()">
                <td>
                  <div class="font-medium">{{ h.student.fullName }}</div>
                  <div class="opacity-60 text-xs">{{ h.student.code }}</div>
                </td>
                <td>{{ h.bedNumber }}</td>
                <td class="text-xs">
                  {{ h.startDate | date:'dd MMM yy' }} → {{ h.endDate ? (h.endDate | date:'dd MMM yy') : 'present' }}
                </td>
                <td class="text-xs">{{ h.monthlyRate ? '₹' + (h.monthlyRate | number) : '—' }}</td>
                <td><span class="badge badge-sm" [class.badge-success]="h.status === 'ACTIVE'" [class.badge-ghost]="h.status === 'ENDED'">{{ h.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="detailsRoom.set(null)">close</button></form>
    </dialog>
  `,
})
export class PgRoomsComponent implements OnInit {
  private api = inject(PgRoomsApiService);
  private branchesApi = inject(BranchesApiService);
  private studentsApi = inject(StudentsApiService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  rooms = signal<PgRoom[]>([]);
  stats = signal<PgRoomStats | null>(null);
  branches = signal<Branch[]>([]);
  students = signal<Student[]>([]);
  history = signal<PgRoomHistoryRow[]>([]);
  loading = signal(false);
  saving = signal(false);

  search = '';
  typeFilter: PgRoomType | undefined = undefined;
  availability: Availability = 'ALL';
  sortField = signal<SortField>('number');
  view = signal<'grid' | 'list'>('grid');

  createOpen = signal(false);
  assignTarget = signal<{ room: PgRoom; bedNumber: number } | null>(null);
  unassignTarget = signal<{ room: PgRoom; assignment: { id: string; student: { fullName: string; code: string } } } | null>(null);
  deleting = signal<PgRoom | null>(null);
  detailsRoom = signal<PgRoom | null>(null);

  createForm = this.fb.group({
    branchId: ['', Validators.required],
    roomNumber: ['', Validators.required],
    type: ['SINGLE' as PgRoomType, Validators.required],
    bedCount: [1, [Validators.required, Validators.min(1), Validators.max(8)]],
    monthlyRate: [null as number | null, [Validators.required, Validators.min(0)]],
    floor: [''],
    notes: [''],
  });

  assignForm = this.fb.group({
    studentId: ['', Validators.required],
    monthlyRate: [null as number | null, [Validators.min(0)]],
    nextDueDate: [''],
    notes: [''],
  });

  studentItems = computed<ComboItem[]>(() =>
    this.students().map((s) => ({
      id: s.id,
      label: s.fullName,
      sublabel: `${s.code} · ${s.phone}`,
    })),
  );

  sortLabel = computed(() => {
    const f = this.sortField();
    return f === 'number' ? 'Number' : f === 'price' ? 'Price' : 'Occupancy';
  });

  sortedRooms = computed(() => {
    const list = [...this.rooms()];
    const f = this.sortField();
    if (f === 'number')      list.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
    else if (f === 'price')  list.sort((a, b) => b.monthlyRate - a.monthlyRate);
    else                     list.sort((a, b) => b.occupiedBeds / Math.max(1, b.bedCount) - a.occupiedBeds / Math.max(1, a.bedCount));
    return list;
  });

  ngOnInit() {
    this.branchesApi.list().subscribe((bs) => {
      this.branches.set(bs);
      if (!this.createForm.value.branchId && bs[0]) this.createForm.patchValue({ branchId: bs[0].id });
    });
    this.studentsApi.list({ limit: 500, sortBy: 'fullName', sortOrder: 'asc', status: 'ACTIVE' })
      .subscribe((r) => this.students.set(r.data));
    this.reload();
  }

  reload() {
    this.loading.set(true);
    forkJoin({
      rooms: this.api.list({ search: this.search || undefined, type: this.typeFilter, availability: this.availability }),
      stats: this.api.stats(),
    }).subscribe({
      next: (r) => {
        this.rooms.set(r.rooms);
        this.stats.set(r.stats);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Could not load PG rooms');
        this.loading.set(false);
      },
    });
  }

  setSort(f: SortField) {
    this.sortField.set(f);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  // ----- Create -----
  openCreate() {
    const defaultBranch = this.branches()[0]?.id ?? '';
    this.createForm.reset({
      branchId: defaultBranch,
      roomNumber: '',
      type: 'SINGLE',
      bedCount: 1,
      monthlyRate: null,
      floor: '',
      notes: '',
    });
    this.createOpen.set(true);
  }
  onTypeChange() {
    const t = this.createForm.value.type as PgRoomType;
    const beds = t === 'SINGLE' ? 1 : t === 'DOUBLE' ? 2 : 3;
    this.createForm.patchValue({ bedCount: beds });
  }
  submitCreate() {
    if (this.createForm.invalid) return;
    this.saving.set(true);
    const v = this.createForm.getRawValue();
    const dto: CreatePgRoomDto = {
      branchId: v.branchId!,
      roomNumber: v.roomNumber!.trim(),
      type: v.type!,
      bedCount: Number(v.bedCount),
      monthlyRate: Number(v.monthlyRate),
      floor: v.floor || undefined,
      notes: v.notes || undefined,
    };
    this.api.create(dto).subscribe({
      next: () => {
        this.toast.success(`Room ${dto.roomNumber} added`);
        this.createOpen.set(false);
        this.saving.set(false);
        this.reload();
      },
      error: (err) => {
        this.toast.error(this.errMsg(err) ?? 'Could not create room');
        this.saving.set(false);
      },
    });
  }

  // ----- Assign -----
  openAssign(room: PgRoom, bedNumber: number) {
    this.assignForm.reset({
      studentId: '',
      monthlyRate: room.monthlyRate,
      nextDueDate: this.nextMonthIso(),
      notes: '',
    });
    this.assignTarget.set({ room, bedNumber });
    // Refresh the student list each time so newly-added students appear and
    // any earlier fetch failure on init is recovered from.
    this.studentsApi.list({ limit: 500, sortBy: 'fullName', sortOrder: 'asc', status: 'ACTIVE' })
      .subscribe({
        next: (r) => this.students.set(r.data),
        error: () => this.toast.error('Could not load student list'),
      });
  }
  closeAssign() {
    this.assignTarget.set(null);
    this.saving.set(false);
  }
  submitAssign() {
    const ctx = this.assignTarget();
    if (!ctx || this.assignForm.invalid) return;
    this.saving.set(true);
    const v = this.assignForm.getRawValue();
    const dto: AssignBedDto = {
      studentId: v.studentId!,
      bedNumber: ctx.bedNumber,
      monthlyRate: v.monthlyRate != null ? Number(v.monthlyRate) : undefined,
      nextDueDate: v.nextDueDate || undefined,
      notes: v.notes || undefined,
    };
    this.api.assign(ctx.room.id, dto).subscribe({
      next: () => {
        this.toast.success(`Assigned to Room ${ctx.room.roomNumber} · Bed ${ctx.bedNumber}`);
        this.closeAssign();
        this.reload();
      },
      error: (err) => {
        this.toast.error(this.errMsg(err) ?? 'Could not assign');
        this.saving.set(false);
      },
    });
  }

  // ----- Unassign -----
  confirmUnassign(room: PgRoom, assignment: BedAssignment) {
    this.unassignTarget.set({ room, assignment });
    (document.activeElement as HTMLElement | null)?.blur();
  }
  doUnassign() {
    const ctx = this.unassignTarget();
    if (!ctx) return;
    this.api.unassign(ctx.assignment.id).subscribe({
      next: () => {
        this.toast.success(`Ended assignment for ${ctx.assignment.student.fullName}`);
        this.unassignTarget.set(null);
        this.reload();
      },
      error: (err) => this.toast.error(this.errMsg(err) ?? 'Could not end assignment'),
    });
  }

  // ----- Delete -----
  confirmDelete(room: PgRoom) {
    this.deleting.set(room);
    (document.activeElement as HTMLElement | null)?.blur();
  }
  doDelete() {
    const r = this.deleting();
    if (!r || r.occupiedBeds > 0) return;
    this.api.remove(r.id).subscribe({
      next: () => {
        this.toast.success(`Deleted room ${r.roomNumber}`);
        this.deleting.set(null);
        this.reload();
      },
      error: (err) => this.toast.error(this.errMsg(err) ?? 'Could not delete'),
    });
  }

  // ----- Details / History -----
  openDetails(r: PgRoom) {
    this.detailsRoom.set(r);
    this.history.set([]);
    this.api.history(r.id).subscribe((h) => this.history.set(h));
    (document.activeElement as HTMLElement | null)?.blur();
  }
  openHistory(r: PgRoom) { this.openDetails(r); }

  // ----- Helpers -----
  typeLabel(t: PgRoomType): string {
    return t === 'SINGLE' ? 'Single Room' : t === 'DOUBLE' ? 'Double Room' : 'Triple Room';
  }
  typeBadgeClass(t: PgRoomType): string {
    switch (t) {
      case 'SINGLE': return 'badge-info';
      case 'DOUBLE': return 'badge-success';
      case 'TRIPLE': return 'badge-warning';
    }
  }
  bedGridClass(n: number): string {
    return n === 1 ? 'grid-cols-1' : n === 2 ? 'grid-cols-2' : 'grid-cols-3';
  }
  initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }
  shortName(name: string): string {
    // First word + initial of second, e.g. "Sumaaira Khan" -> "Sumaaira K."
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return parts[0] ?? name;
    return `${parts[0]} ${parts[1][0]}.`;
  }
  private readonly avatarHues = [
    'bg-rose-500', 'bg-amber-500', 'bg-emerald-500',
    'bg-sky-500', 'bg-indigo-500', 'bg-fuchsia-500', 'bg-teal-500',
  ];
  avatarHueClass(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return this.avatarHues[h % this.avatarHues.length];
  }
  private nextMonthIso(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }
  private errMsg(err: any): string | null {
    const m = err?.error?.message;
    if (!m) return null;
    return Array.isArray(m) ? m.join(' · ') : String(m);
  }
}
