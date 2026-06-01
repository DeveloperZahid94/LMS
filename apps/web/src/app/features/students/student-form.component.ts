import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { StudentsApiService } from './students.service';
import { BranchesApiService, Branch } from './branches.service';
import { ExamTargetsApiService, ExamTarget } from './exam-targets.service';
import { Gender, PaymentMethod, Shift, StudentStatus } from '@lms/shared';
import { SeatsApiService, SeatAssignmentsApiService, SeatWithAssignments } from '../seats/seats.service';
import { PgRoomsApiService, PgRoom } from '../pg-rooms/pg-rooms.service';
import { PaymentsApiService } from '../payments/payments.service';
import { ToastService } from '../../core/services/toast.service';

type AccomType = 'CABIN_ONLY' | 'PG_ONLY' | 'BOTH';
type PayMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER';

interface StepDef {
  key: string;
  label: string;
  hint: string;
  icon: string;
}

@Component({
  selector: 'lms-student-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">{{ id() ? 'Edit student' : 'New student' }}</h1>
          <p class="text-sm opacity-60" *ngIf="id()">Code: <code class="bg-base-200 px-1.5 py-0.5 rounded">{{ code() }}</code></p>
          <p class="text-sm opacity-60" *ngIf="!id()">Complete {{ steps().length }} steps to register a new student</p>
        </div>
        <button class="btn btn-ghost btn-sm" (click)="cancel()">Cancel</button>
      </div>

      <!-- Stepper (hidden in edit mode) -->
      <div *ngIf="!id()" class="card bg-base-100 border border-base-300 shadow-sm mb-4 overflow-hidden">
        <div class="lms-stepper">
          <div class="lms-stepper-track"></div>
          <div class="lms-stepper-progress" [style.width.%]="progressPct()"></div>

          <button *ngFor="let s of steps(); let i = index; trackBy: trackStep"
                  type="button"
                  class="lms-step"
                  [class.is-active]="i === currentStep()"
                  [class.is-done]="i < currentStep()"
                  [disabled]="i > currentStep()"
                  (click)="jumpTo(i)">
            <span class="lms-step-circle">
              <span *ngIf="i < currentStep()" class="lms-check">✓</span>
              <span *ngIf="i >= currentStep()" class="lms-step-icon">{{ s.icon }}</span>
            </span>
            <span class="lms-step-label">{{ s.label }}</span>
          </button>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body">
          <div class="mb-4">
            <div class="text-xs uppercase tracking-wider opacity-50" *ngIf="!id()">Step {{ currentStep() + 1 }} of {{ steps().length }}</div>
            <h2 class="text-xl font-semibold mt-1">{{ steps()[currentStep()].label }}</h2>
            <p class="text-sm opacity-60">{{ steps()[currentStep()].hint }}</p>
          </div>

          <!-- ============================== STEP 1: PERSONAL INFO ============================== -->
          <ng-container *ngIf="currentStep() === 0">
            <div formGroupName="personal" class="space-y-5">

              <!-- Basics -->
              <div>
                <div class="text-xs uppercase tracking-wider opacity-60 font-semibold mb-2">Basics</div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Full name *</span></div>
                    <input class="input input-bordered" formControlName="fullName" placeholder="Aarav Kumar" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Phone *</span></div>
                    <input class="input input-bordered" formControlName="phone" placeholder="+919xxxxxxxxx" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Email</span></div>
                    <input class="input input-bordered" type="email" formControlName="email" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Date of birth</span></div>
                    <input class="input input-bordered" type="date" formControlName="dateOfBirth" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Gender</span></div>
                    <select class="select select-bordered" formControlName="gender">
                      <option [ngValue]="null">—</option>
                      <option *ngFor="let g of genders" [value]="g">{{ g }}</option>
                    </select>
                  </label>
                  <label class="form-control" *ngIf="id()">
                    <div class="label py-1"><span class="label-text">Status</span></div>
                    <select class="select select-bordered" formControlName="status">
                      <option *ngFor="let s of statuses" [value]="s">{{ s }}</option>
                    </select>
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Branch *</span></div>
                    <select class="select select-bordered" formControlName="branchId">
                      <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }} ({{ b.code }})</option>
                    </select>
                  </label>
                  <label class="form-control">
                    <div class="label py-1 justify-between">
                      <span class="label-text">Studying for which exam</span>
                      <button type="button" class="btn btn-ghost btn-xs" (click)="openAddExam()">+ Add new</button>
                    </div>
                    <select class="select select-bordered" formControlName="examTarget">
                      <option [ngValue]="null">—</option>
                      <option *ngFor="let e of examTargets()" [value]="e.name">
                        {{ e.name }}{{ e.isCustom ? ' (custom)' : '' }}
                      </option>
                    </select>
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Membership expires on</span></div>
                    <input class="input input-bordered" type="date" formControlName="expiresAt" />
                  </label>
                </div>
              </div>

              <!-- KYC -->
              <div>
                <div class="text-xs uppercase tracking-wider opacity-60 font-semibold mb-2">KYC</div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Aadhaar number</span></div>
                    <input class="input input-bordered" formControlName="aadhaarNumber" placeholder="12 digits" maxlength="12" inputmode="numeric" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Voter ID (EPIC)</span></div>
                    <input class="input input-bordered" formControlName="voterId" placeholder="ABC1234567" maxlength="20" />
                  </label>
                </div>
              </div>

              <!-- Family / emergency -->
              <div>
                <div class="text-xs uppercase tracking-wider opacity-60 font-semibold mb-2">Family &amp; emergency</div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Father's name</span></div>
                    <input class="input input-bordered" formControlName="fatherName" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Mother's name</span></div>
                    <input class="input input-bordered" formControlName="motherName" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Emergency contact</span></div>
                    <input class="input input-bordered" formControlName="emergencyContact" placeholder="+91xxxxxxxxxx" />
                  </label>
                </div>
              </div>

              <!-- Address -->
              <div>
                <div class="text-xs uppercase tracking-wider opacity-60 font-semibold mb-2">Address</div>
                <div class="space-y-3">
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text">Permanent address</span></div>
                    <textarea class="textarea textarea-bordered" formControlName="permanentAddress" rows="2" placeholder="House, street, city, state, PIN"></textarea>
                  </label>
                  <div class="flex items-center gap-2">
                    <input id="sameAddr" type="checkbox" class="checkbox checkbox-primary checkbox-sm" [checked]="sameAddress()" (change)="toggleSameAddress($event)" />
                    <label for="sameAddr" class="text-sm">Temporary address is the same as permanent</label>
                  </div>
                  <label class="form-control" *ngIf="!sameAddress()">
                    <div class="label py-1"><span class="label-text">Temporary address</span></div>
                    <textarea class="textarea textarea-bordered" formControlName="temporaryAddress" rows="2" placeholder="Current residence"></textarea>
                  </label>
                </div>
              </div>
            </div>
          </ng-container>

          <!-- ============================== STEP 2: ACCOMMODATION ============================== -->
          <ng-container *ngIf="currentStep() === 1 && !id()">
            <div class="space-y-5">
              <!-- Type chooser — bigger, richer cards -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <!-- CABIN -->
                <button type="button"
                        class="relative overflow-hidden rounded-2xl p-5 text-left border-2 transition-all hover:shadow-lg hover:-translate-y-0.5"
                        [class.border-primary]="accomType() === 'CABIN_ONLY'"
                        [class.shadow-md]="accomType() === 'CABIN_ONLY'"
                        [class.bg-gradient-to-br]="accomType() === 'CABIN_ONLY'"
                        [class.from-primary]="accomType() === 'CABIN_ONLY'"
                        [class.to-secondary]="accomType() === 'CABIN_ONLY'"
                        [class.text-primary-content]="accomType() === 'CABIN_ONLY'"
                        [class.border-base-300]="accomType() !== 'CABIN_ONLY'"
                        [class.bg-base-100]="accomType() !== 'CABIN_ONLY'"
                        (click)="setAccomType('CABIN_ONLY')">
                  <span *ngIf="accomType() === 'CABIN_ONLY'" class="absolute top-3 right-3 w-6 h-6 rounded-full bg-white text-primary grid place-items-center text-sm font-bold">✓</span>
                  <div class="w-12 h-12 rounded-xl grid place-items-center text-2xl mb-3"
                       [class.bg-white]="accomType() === 'CABIN_ONLY'"
                       [class.bg-opacity-20]="accomType() === 'CABIN_ONLY'"
                       [class.bg-primary]="accomType() !== 'CABIN_ONLY'"
                       [class.bg-opacity-10]="accomType() !== 'CABIN_ONLY'"
                       [class.text-primary]="accomType() !== 'CABIN_ONLY'">📚</div>
                  <div class="font-bold text-base">Library Cabin Only</div>
                  <div class="text-xs opacity-80 mt-1">Study cabin / seat with a shift.</div>
                  <div class="text-[11px] mt-3 inline-flex items-center gap-1"
                       [class.bg-white]="accomType() === 'CABIN_ONLY'"
                       [class.bg-opacity-25]="accomType() === 'CABIN_ONLY'"
                       [class.bg-base-200]="accomType() !== 'CABIN_ONLY'"
                       style="padding: 2px 8px; border-radius: 999px;">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-success"></span>
                    {{ availableSeats().length }} cabin{{ availableSeats().length === 1 ? '' : 's' }} available
                  </div>
                </button>

                <!-- PG -->
                <button type="button"
                        class="relative overflow-hidden rounded-2xl p-5 text-left border-2 transition-all hover:shadow-lg hover:-translate-y-0.5"
                        [class.border-success]="accomType() === 'PG_ONLY'"
                        [class.shadow-md]="accomType() === 'PG_ONLY'"
                        [class.bg-gradient-to-br]="accomType() === 'PG_ONLY'"
                        [class.from-success]="accomType() === 'PG_ONLY'"
                        [class.to-emerald-600]="accomType() === 'PG_ONLY'"
                        [class.text-success-content]="accomType() === 'PG_ONLY'"
                        [class.border-base-300]="accomType() !== 'PG_ONLY'"
                        [class.bg-base-100]="accomType() !== 'PG_ONLY'"
                        (click)="setAccomType('PG_ONLY')">
                  <span *ngIf="accomType() === 'PG_ONLY'" class="absolute top-3 right-3 w-6 h-6 rounded-full bg-white text-success grid place-items-center text-sm font-bold">✓</span>
                  <div class="w-12 h-12 rounded-xl grid place-items-center text-2xl mb-3"
                       [class.bg-white]="accomType() === 'PG_ONLY'"
                       [class.bg-opacity-20]="accomType() === 'PG_ONLY'"
                       [class.bg-success]="accomType() !== 'PG_ONLY'"
                       [class.bg-opacity-10]="accomType() !== 'PG_ONLY'"
                       [class.text-success]="accomType() !== 'PG_ONLY'">🛏</div>
                  <div class="font-bold text-base">PG Room Only</div>
                  <div class="text-xs opacity-80 mt-1">Bed in a single / double / triple room.</div>
                  <div class="text-[11px] mt-3 inline-flex items-center gap-1"
                       [class.bg-white]="accomType() === 'PG_ONLY'"
                       [class.bg-opacity-25]="accomType() === 'PG_ONLY'"
                       [class.bg-base-200]="accomType() !== 'PG_ONLY'"
                       style="padding: 2px 8px; border-radius: 999px;">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-success"></span>
                    {{ totalFreeBeds() }} bed{{ totalFreeBeds() === 1 ? '' : 's' }} free
                    in {{ availablePgRooms().length }} room{{ availablePgRooms().length === 1 ? '' : 's' }}
                  </div>
                </button>

                <!-- BOTH -->
                <button type="button"
                        class="relative overflow-hidden rounded-2xl p-5 text-left border-2 transition-all hover:shadow-lg hover:-translate-y-0.5"
                        [class.border-warning]="accomType() === 'BOTH'"
                        [class.shadow-md]="accomType() === 'BOTH'"
                        [class.bg-gradient-to-br]="accomType() === 'BOTH'"
                        [class.from-warning]="accomType() === 'BOTH'"
                        [class.to-amber-600]="accomType() === 'BOTH'"
                        [class.text-warning-content]="accomType() === 'BOTH'"
                        [class.border-base-300]="accomType() !== 'BOTH'"
                        [class.bg-base-100]="accomType() !== 'BOTH'"
                        (click)="setAccomType('BOTH')">
                  <span *ngIf="accomType() === 'BOTH'" class="absolute top-3 right-3 w-6 h-6 rounded-full bg-white text-warning grid place-items-center text-sm font-bold">✓</span>
                  <div class="w-12 h-12 rounded-xl grid place-items-center text-2xl mb-3"
                       [class.bg-white]="accomType() === 'BOTH'"
                       [class.bg-opacity-20]="accomType() === 'BOTH'"
                       [class.bg-warning]="accomType() !== 'BOTH'"
                       [class.bg-opacity-10]="accomType() !== 'BOTH'"
                       [class.text-warning]="accomType() !== 'BOTH'">🏢</div>
                  <div class="font-bold text-base">Both (Cabin + PG)</div>
                  <div class="text-xs opacity-80 mt-1">Full package — cabin and a PG bed.</div>
                  <div class="text-[11px] mt-3 inline-flex items-center gap-1"
                       [class.bg-white]="accomType() === 'BOTH'"
                       [class.bg-opacity-25]="accomType() === 'BOTH'"
                       [class.bg-base-200]="accomType() !== 'BOTH'"
                       style="padding: 2px 8px; border-radius: 999px;">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-success"></span>
                    Bundled allocation
                  </div>
                </button>
              </div>

              <p *ngIf="!accomType()" class="text-sm opacity-60 italic flex items-center gap-2">
                <span class="text-base">👆</span>Pick an option above to continue.
              </p>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4" *ngIf="accomType()">
                <!-- ===== CABIN SECTION ===== -->
                <div *ngIf="hasCabin()" formGroupName="cabin"
                     class="rounded-2xl border-2 border-primary border-opacity-40 bg-base-100 overflow-hidden shadow-sm">
                  <div class="px-5 py-3 bg-gradient-to-r from-primary to-secondary text-primary-content flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="w-7 h-7 rounded-lg bg-white bg-opacity-20 grid place-items-center">📚</span>
                      <div>
                        <div class="font-bold text-sm">Section A · Library Cabin</div>
                        <div class="text-[11px] opacity-80">Pick a seat & shift</div>
                      </div>
                    </div>
                    <span class="badge badge-sm bg-white bg-opacity-25 text-primary-content border-0">
                      {{ availableSeats().length }} free
                    </span>
                  </div>

                  <div class="p-5 space-y-3">
                    <!-- No cabins available state -->
                    <div *ngIf="availableSeats().length === 0" class="text-sm opacity-70 bg-base-200 rounded-lg p-3 text-center">
                      No cabins available in this branch.
                    </div>

                    <label class="form-control" *ngIf="availableSeats().length > 0">
                      <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Select cabin *</span></div>
                      <select class="select select-bordered" formControlName="seatId" (change)="onCabinChange()">
                        <option value="">— Choose available cabin —</option>
                        <option *ngFor="let s of availableSeats()" [value]="s.id">
                          {{ s.code }}{{ s.floor ? ' · Floor ' + s.floor : '' }}{{ s.zone ? ' · ' + s.zone : '' }} — ₹{{ bestSeatRate(s) | number }}
                        </option>
                      </select>
                    </label>

                    <!-- Selected cabin preview chip -->
                    <div *ngIf="selectedSeat() as s" class="rounded-xl bg-primary bg-opacity-5 border border-primary border-opacity-20 p-3">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <code class="bg-primary text-primary-content px-2 py-0.5 rounded text-sm font-semibold">{{ s.code }}</code>
                          <span class="badge badge-sm badge-outline">{{ s.type }}</span>
                        </div>
                        <div class="text-xs opacity-70">
                          {{ s.floor ? 'Floor ' + s.floor : '' }}{{ s.zone ? ' · ' + s.zone : '' }}
                        </div>
                      </div>
                      <div *ngIf="s.amenities.length > 0" class="flex flex-wrap gap-1 mt-2">
                        <span *ngFor="let a of s.amenities" class="badge badge-xs badge-outline">{{ a }}</span>
                      </div>
                    </div>

                    <label class="form-control">
                      <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Shift *</span></div>
                      <div class="grid grid-cols-5 gap-1.5">
                        <button *ngFor="let sh of shifts" type="button"
                                class="btn btn-xs"
                                [class.btn-primary]="cabinGroup.value.shift === sh"
                                [class.btn-outline]="cabinGroup.value.shift !== sh"
                                (click)="cabinGroup.patchValue({ shift: sh })">
                          {{ shortShift(sh) }}
                        </button>
                      </div>
                    </label>

                    <div class="grid grid-cols-2 gap-3">
                      <label class="form-control">
                        <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Join date *</span></div>
                        <input class="input input-bordered" type="date" formControlName="joinDate" />
                      </label>
                      <label class="form-control">
                        <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Due date *</span></div>
                        <input class="input input-bordered" type="date" formControlName="dueDate" />
                      </label>
                    </div>

                    <label class="form-control">
                      <div class="label py-1 justify-between">
                        <span class="label-text uppercase text-[11px] tracking-wider opacity-60">Monthly cabin fee (₹) *</span>
                        <span class="text-xs opacity-60">auto-filled from rate card</span>
                      </div>
                      <label class="input input-bordered flex items-center gap-2">
                        <span class="opacity-60">₹</span>
                        <input class="grow" type="number" min="0" formControlName="monthlyFee" />
                      </label>
                    </label>
                  </div>
                </div>

                <!-- ===== PG SECTION ===== -->
                <div *ngIf="hasPg()" formGroupName="pgRoom"
                     class="rounded-2xl border-2 border-success border-opacity-40 bg-base-100 overflow-hidden shadow-sm">
                  <div class="px-5 py-3 bg-gradient-to-r from-success to-emerald-600 text-success-content flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="w-7 h-7 rounded-lg bg-white bg-opacity-20 grid place-items-center">🛏</span>
                      <div>
                        <div class="font-bold text-sm">Section B · PG Room</div>
                        <div class="text-[11px] opacity-80">Pick a room & bed</div>
                      </div>
                    </div>
                    <span class="badge badge-sm bg-white bg-opacity-25 text-success-content border-0">
                      {{ totalFreeBeds() }} bed{{ totalFreeBeds() === 1 ? '' : 's' }} free
                    </span>
                  </div>

                  <div class="p-5 space-y-3">
                    <div *ngIf="availablePgRooms().length === 0" class="text-sm opacity-70 bg-base-200 rounded-lg p-3 text-center">
                      No PG rooms with free beds in this branch.
                    </div>

                    <label class="form-control" *ngIf="availablePgRooms().length > 0">
                      <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Select PG room *</span></div>
                      <select class="select select-bordered" formControlName="roomId" (change)="onPgRoomChange()">
                        <option value="">— Choose available room —</option>
                        <option *ngFor="let r of availablePgRooms()" [value]="r.id">
                          {{ r.roomNumber }}{{ r.floor ? ' · Floor ' + r.floor : '' }} · {{ pgRoomTypeLabel(r.type) }} · ₹{{ r.monthlyRate | number }} ({{ r.availableBeds }}/{{ r.bedCount }} free)
                        </option>
                      </select>
                    </label>

                    <!-- Visual bed picker -->
                    <div *ngIf="selectedPgRoom() as r">
                      <div class="rounded-xl bg-success bg-opacity-5 border border-success border-opacity-20 p-3">
                        <div class="flex items-center justify-between mb-2">
                          <div class="flex items-center gap-2">
                            <code class="bg-success text-success-content px-2 py-0.5 rounded text-sm font-semibold">{{ r.roomNumber }}</code>
                            <span class="badge badge-sm badge-outline">{{ pgRoomTypeLabel(r.type) }}</span>
                          </div>
                          <div class="text-xs opacity-70">{{ r.floor ? 'Floor ' + r.floor : '' }}</div>
                        </div>
                        <div class="text-[11px] uppercase tracking-wider opacity-60 mb-1.5">Pick a bed *</div>
                        <div class="grid gap-2" [class]="bedGridClass(r.bedCount)">
                          <button *ngFor="let b of r.beds" type="button"
                                  class="rounded-lg border-2 p-2 text-center transition-all"
                                  [class.cursor-not-allowed]="b.status !== 'AVAILABLE'"
                                  [class.opacity-50]="b.status !== 'AVAILABLE'"
                                  [class.border-base-300]="b.status === 'AVAILABLE' && pgGroup.value.bedNumber !== b.bedNumber"
                                  [class.hover:border-success]="b.status === 'AVAILABLE' && pgGroup.value.bedNumber !== b.bedNumber"
                                  [class.border-success]="b.status === 'AVAILABLE' && pgGroup.value.bedNumber === b.bedNumber"
                                  [class.bg-success]="b.status === 'AVAILABLE' && pgGroup.value.bedNumber === b.bedNumber"
                                  [class.text-success-content]="b.status === 'AVAILABLE' && pgGroup.value.bedNumber === b.bedNumber"
                                  [disabled]="b.status !== 'AVAILABLE'"
                                  (click)="pgGroup.patchValue({ bedNumber: b.bedNumber })">
                            <div class="text-[10px] uppercase tracking-wider opacity-70 font-semibold">Bed {{ b.bedNumber }}</div>
                            <div class="mt-1 text-base">
                              <span *ngIf="b.status === 'AVAILABLE' && pgGroup.value.bedNumber === b.bedNumber">✓</span>
                              <span *ngIf="b.status === 'AVAILABLE' && pgGroup.value.bedNumber !== b.bedNumber">+</span>
                              <span *ngIf="b.status !== 'AVAILABLE'">🔒</span>
                            </div>
                            <div class="text-[10px] opacity-70 mt-1">
                              <ng-container *ngIf="b.status === 'AVAILABLE'">Free</ng-container>
                              <ng-container *ngIf="b.status !== 'AVAILABLE'">{{ b.assignment?.student?.fullName | slice:0:8 }}</ng-container>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                      <label class="form-control">
                        <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Join date *</span></div>
                        <input class="input input-bordered" type="date" formControlName="joinDate" />
                      </label>
                      <label class="form-control">
                        <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Due date *</span></div>
                        <input class="input input-bordered" type="date" formControlName="dueDate" />
                      </label>
                    </div>

                    <label class="form-control">
                      <div class="label py-1 justify-between">
                        <span class="label-text uppercase text-[11px] tracking-wider opacity-60">Monthly room fee (₹) *</span>
                        <span class="text-xs opacity-60">auto-filled from rate card</span>
                      </div>
                      <label class="input input-bordered flex items-center gap-2">
                        <span class="opacity-60">₹</span>
                        <input class="grow" type="number" min="0" formControlName="monthlyFee" />
                      </label>
                    </label>
                  </div>
                </div>
              </div>

              <!-- Combined estimate strip -->
              <div *ngIf="accomType() && totalMonthly() > 0"
                   class="rounded-xl bg-base-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2 text-sm">
                <div class="flex items-center gap-4">
                  <span *ngIf="hasCabin() && cabinFee() > 0" class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-primary"></span>
                    Cabin: <span class="font-semibold">₹{{ cabinFee() | number }}</span>
                  </span>
                  <span *ngIf="hasPg() && pgFee() > 0" class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-success"></span>
                    PG: <span class="font-semibold">₹{{ pgFee() | number }}</span>
                  </span>
                </div>
                <div class="text-base font-bold">
                  Total monthly: <span class="text-primary">₹{{ totalMonthly() | number }}</span>
                </div>
              </div>
            </div>
          </ng-container>

          <!-- ============================== STEP 3: PAYMENT ============================== -->
          <ng-container *ngIf="currentStep() === 2 && !id()">
            <!-- Inline header: title on left, payment-method tabs on extreme right -->
            <div class="flex items-center justify-between flex-wrap gap-3 mb-4 pb-3 border-b border-base-200">
              <div>
                <div class="font-semibold text-base">Initial Payment</div>
                <div class="text-xs opacity-60">Record how the student is paying for the first month.</div>
              </div>
              <div class="join">
                <button type="button" class="join-item btn btn-sm"
                        [class.btn-primary]="payMethod() === 'CASH'"
                        (click)="setPayMethod('CASH')">
                  <span class="mr-1">💵</span> Cash
                </button>
                <button type="button" class="join-item btn btn-sm"
                        [class.btn-primary]="payMethod() === 'UPI'"
                        (click)="setPayMethod('UPI')">
                  <span class="mr-1">📱</span> UPI
                </button>
                <button type="button" class="join-item btn btn-sm"
                        [class.btn-primary]="payMethod() === 'BANK_TRANSFER'"
                        (click)="setPayMethod('BANK_TRANSFER')">
                  <span class="mr-1">🏦</span> Bank Transfer
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- Payment form -->
              <div formGroupName="payment" class="md:col-span-2 space-y-3">
                <label *ngIf="hasCabin()" class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Cabin initial payment (₹) *</span></div>
                  <input class="input input-bordered" type="number" min="0" formControlName="cabinInitial" />
                </label>

                <label *ngIf="hasPg()" class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">PG room initial payment (₹) *</span></div>
                  <input class="input input-bordered" type="number" min="0" formControlName="pgInitial" />
                </label>

                <label *ngIf="payMethod() === 'UPI'" class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">UPI transaction ID *</span></div>
                  <input class="input input-bordered" formControlName="transactionRef" placeholder="e.g. 123456789012" />
                </label>
                <label *ngIf="payMethod() === 'BANK_TRANSFER'" class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Bank reference / UTR *</span></div>
                  <input class="input input-bordered" formControlName="transactionRef" placeholder="UTR number or bank ref" />
                </label>

                <label class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Payment date *</span></div>
                  <input class="input input-bordered" type="date" formControlName="paymentDate" />
                </label>
                <label class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Notes (optional)</span></div>
                  <textarea class="textarea textarea-bordered" rows="2" formControlName="notes" placeholder="Any additional payment notes…"></textarea>
                </label>
              </div>

              <!-- Summary panel -->
              <div class="card bg-base-100 border border-base-300 shadow-sm h-fit">
                <div class="card-body p-4">
                  <div class="font-semibold flex items-center gap-2 mb-3">📇 Payment Summary</div>
                  <div class="space-y-2 text-sm">
                    <div *ngIf="hasCabin()" class="flex items-center justify-between">
                      <span class="opacity-70">Cabin fee</span>
                      <span class="font-medium">₹{{ cabinFee() | number }}</span>
                    </div>
                    <div *ngIf="hasPg()" class="flex items-center justify-between">
                      <span class="opacity-70">PG room fee</span>
                      <span class="font-medium">₹{{ pgFee() | number }}</span>
                    </div>
                    <div class="divider my-1"></div>
                    <div class="flex items-center justify-between">
                      <span class="opacity-70">Total monthly fee</span>
                      <span class="font-semibold">₹{{ totalMonthly() | number }}</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="opacity-70">Total paying now</span>
                      <span class="font-semibold text-primary">₹{{ totalInitial() | number }}</span>
                    </div>
                    <div class="divider my-1"></div>
                    <div class="flex items-center justify-between">
                      <span class="opacity-60 text-xs uppercase tracking-wider">Status</span>
                      <span class="badge badge-warning badge-sm">VERIFYING</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ng-container>

          <!-- ============================== STEP 4: DOCUMENTS & PHOTO ============================== -->
          <ng-container *ngIf="currentStep() === 3 && !id()">
            <div formGroupName="documents" class="space-y-4">
              <p class="alert alert-info py-2 text-sm">
                <span>Document &amp; photo upload integration is coming soon. For now, paste a URL for each item or skip this step entirely.</span>
              </p>

              <!-- Photo capture -->
              <div class="card bg-base-100 border border-base-300 shadow-sm">
                <div class="card-body p-4">
                  <div class="font-semibold mb-2">Live Photo Capture</div>
                  <div class="join mb-3">
                    <button type="button" class="join-item btn btn-primary"
                            (click)="comingSoon('File upload')">⬆ Upload Photo</button>
                    <button type="button" class="join-item btn"
                            (click)="comingSoon('Webcam capture')">📷 Use Webcam</button>
                  </div>
                  <div class="border-2 border-dashed border-base-300 rounded-lg p-6 text-center cursor-pointer hover:bg-base-200 transition-colors"
                       (click)="comingSoon('File upload')">
                    <div class="text-3xl opacity-50 mb-2">⬆</div>
                    <div class="font-medium opacity-80">Drop photo here or click to upload</div>
                    <div class="text-xs opacity-60 mt-1">Accepted: JPG, PNG (Max 5MB)</div>
                  </div>
                  <label class="form-control mt-3">
                    <div class="label py-1"><span class="label-text">…or paste a photo URL</span></div>
                    <input class="input input-bordered" formControlName="photoUrl" placeholder="https://…" />
                  </label>
                </div>
              </div>

              <!-- Documents -->
              <div class="card bg-base-100 border border-base-300 shadow-sm">
                <div class="card-body p-4">
                  <div class="font-semibold mb-3">Upload Documents</div>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div *ngFor="let d of docFields" class="form-control">
                      <div class="label py-1"><span class="label-text">{{ d.label }}</span></div>
                      <div class="join">
                        <button type="button" class="btn join-item" (click)="comingSoon('File upload')">Choose file</button>
                        <span class="btn join-item btn-ghost no-animation pointer-events-none flex-1 opacity-60 text-xs justify-start">No file chosen</span>
                      </div>
                      <input class="input input-bordered input-sm mt-1.5" [formControlName]="d.urlField" placeholder="…or paste URL" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ng-container>

          <!-- ============================== FOOTER ============================== -->
          <div class="card-actions justify-between mt-6 flex-wrap gap-2">
            <div class="flex gap-2">
              <button *ngIf="id()" type="button" class="btn btn-error btn-outline" (click)="remove()">Delete</button>
              <button *ngIf="!id() && currentStep() > 0" type="button" class="btn btn-ghost" (click)="prev()">‹ Back</button>
            </div>
            <div class="flex gap-2 ml-auto">
              <button *ngIf="!id()" type="button" class="btn btn-ghost"
                      (click)="submit(true)" [disabled]="saving() || !personalGroup.valid"
                      title="Create the student now; you can add accommodation and payment later from their profile">
                💾 Save as Draft
              </button>
              <button *ngIf="!id() && currentStep() < steps().length - 1" type="button" class="btn btn-primary" (click)="next()">
                Next Step ›
              </button>
              <button *ngIf="id() || (!id() && currentStep() === steps().length - 1)"
                      type="submit" class="btn btn-primary" [disabled]="saving()">
                <span *ngIf="saving()" class="loading loading-spinner loading-sm"></span>
                {{ saving() ? 'Saving…' : (id() ? 'Save changes' : 'Complete Registration') }}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>

    <!-- Add-exam modal -->
    <dialog class="modal" [class.modal-open]="addingExam()">
      <div class="modal-box max-w-sm">
        <form method="dialog">
          <button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="closeAddExam()">✕</button>
        </form>
        <h3 class="font-bold text-lg">Add a new exam target</h3>
        <p class="text-sm opacity-60 mt-1">This will appear in the dropdown for all staff in your tenant.</p>
        <label class="form-control mt-4">
          <div class="label py-1"><span class="label-text">Exam name *</span></div>
          <input class="input input-bordered" [(ngModel)]="newExamName" [ngModelOptions]="{standalone: true}" placeholder="e.g. NDA, CDS, Railways NTPC" (keydown.enter)="submitNewExam(); $event.preventDefault()" />
        </label>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" (click)="closeAddExam()">Cancel</button>
          <button type="button" class="btn btn-primary" [disabled]="!newExamName.trim() || addingExamLoading()" (click)="submitNewExam()">
            <span *ngIf="addingExamLoading()" class="loading loading-spinner loading-sm"></span>
            Add
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="closeAddExam()">close</button></form>
    </dialog>
  `,
  styles: [`
    .lms-stepper {
      position: relative;
      display: flex;
      justify-content: space-between;
      padding: 1.5rem 1.5rem 1rem;
      gap: .5rem;
    }
    .lms-stepper-track {
      position: absolute;
      left: 3rem; right: 3rem; top: 2.65rem;
      height: 3px;
      background: hsl(var(--b3));
      border-radius: 999px;
      z-index: 0;
    }
    .lms-stepper-progress {
      position: absolute;
      left: 3rem; top: 2.65rem;
      height: 3px;
      background: linear-gradient(90deg, hsl(var(--p)), hsl(var(--s)));
      border-radius: 999px;
      z-index: 1;
      transition: width .3s ease;
      max-width: calc(100% - 6rem);
    }
    .lms-step {
      position: relative;
      z-index: 2;
      background: transparent;
      border: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .35rem;
      flex: 1;
      cursor: pointer;
    }
    .lms-step:disabled { cursor: not-allowed; opacity: .6; }
    .lms-step-circle {
      width: 2.25rem; height: 2.25rem;
      border-radius: 9999px;
      display: grid; place-items: center;
      background: hsl(var(--b1));
      border: 2px solid hsl(var(--b3));
      transition: background .25s ease, border-color .25s ease, transform .15s ease;
    }
    .lms-step.is-active .lms-step-circle {
      background: hsl(var(--p));
      border-color: hsl(var(--p));
      color: hsl(var(--pc));
      transform: scale(1.08);
    }
    .lms-step.is-done .lms-step-circle {
      background: hsl(var(--su));
      border-color: hsl(var(--su));
      color: hsl(var(--suc));
    }
    .lms-check { font-weight: 700; }
    .lms-step-icon { font-size: 1rem; }
    .lms-step-label {
      font-size: .7rem;
      text-transform: uppercase;
      letter-spacing: .08em;
      opacity: .7;
      font-weight: 600;
    }
    .lms-step.is-active .lms-step-label,
    .lms-step.is-done .lms-step-label { opacity: 1; }
    @media (max-width: 640px) {
      .lms-stepper-track, .lms-stepper-progress { left: 2rem; right: 2rem; }
      .lms-stepper-progress { max-width: calc(100% - 4rem); }
    }
  `],
})
export class StudentFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(StudentsApiService);
  private branchesApi = inject(BranchesApiService);
  private examApi = inject(ExamTargetsApiService);
  private seatsApi = inject(SeatsApiService);
  private seatAllocApi = inject(SeatAssignmentsApiService);
  private pgApi = inject(PgRoomsApiService);
  private paymentsApi = inject(PaymentsApiService);
  private toast = inject(ToastService);

  genders = Object.values(Gender);
  statuses = Object.values(StudentStatus);
  shifts: Shift[] = [Shift.MORNING, Shift.AFTERNOON, Shift.EVENING, Shift.NIGHT, Shift.FULL_DAY];

  branches = signal<Branch[]>([]);
  examTargets = signal<ExamTarget[]>([]);
  allSeats = signal<SeatWithAssignments[]>([]);
  allPgRooms = signal<PgRoom[]>([]);

  id = signal<string | null>(null);
  code = signal<string | null>(null);
  saving = signal(false);
  currentStep = signal(0);
  sameAddress = signal(false);

  accomType = signal<AccomType | null>(null);
  payMethod = signal<PayMethod>('CASH');

  addingExam = signal(false);
  addingExamLoading = signal(false);
  newExamName = '';

  docFields: { label: string; urlField: string }[] = [
    { label: 'Aadhaar Card (Front)', urlField: 'aadhaarFrontUrl' },
    { label: 'Aadhaar Card (Back)',  urlField: 'aadhaarBackUrl'  },
    { label: 'Voter ID',             urlField: 'voterIdUrl'      },
    { label: 'Other ID proof',       urlField: 'idProofUrl'      },
  ];

  // Steps adapt to mode: edit shows only step 1.
  steps = computed<StepDef[]>(() => {
    if (this.id()) {
      return [{ key: 'personal', label: 'Personal', hint: 'Update student details.', icon: '👤' }];
    }
    return [
      { key: 'personal',      label: 'Personal Info',     hint: 'Identity, KYC, family and address.',           icon: '👤' },
      { key: 'accommodation', label: 'Accommodation',     hint: 'Pick a library cabin and/or a PG room bed.',   icon: '🏠' },
      { key: 'payment',       label: 'Payment',           hint: 'Record the initial payment.',                  icon: '💳' },
      { key: 'documents',     label: 'Documents & Photo', hint: 'Optional — student photo and ID documents.',   icon: '📎' },
    ];
  });

  progressPct = computed(() => {
    const n = this.steps().length;
    if (n <= 1) return 100;
    return (this.currentStep() / (n - 1)) * 100;
  });

  // ----- Form -----
  form = this.fb.group({
    personal: this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required, Validators.pattern(/^\+?\d{8,15}$/)]],
      email: [''],
      dateOfBirth: [''],
      gender: [null as Gender | null],
      status: [StudentStatus.ACTIVE],
      branchId: ['', Validators.required],
      examTarget: [null as string | null],
      expiresAt: [''],
      aadhaarNumber: ['', [Validators.pattern(/^\d{12}$/)]],
      voterId: [''],
      fatherName: [''],
      motherName: [''],
      emergencyContact: ['', [Validators.pattern(/^\+?\d{8,15}$/)]],
      permanentAddress: [''],
      temporaryAddress: [''],
    }),
    cabin: this.fb.group({
      seatId: [''],
      shift: [Shift.FULL_DAY],
      joinDate: [this.todayIso()],
      dueDate: [this.nextMonthIso()],
      monthlyFee: [0],
    }),
    pgRoom: this.fb.group({
      roomId: [''],
      bedNumber: [1],
      joinDate: [this.todayIso()],
      dueDate: [this.nextMonthIso()],
      monthlyFee: [0],
    }),
    payment: this.fb.group({
      cabinInitial: [0],
      pgInitial: [0],
      transactionRef: [''],
      paymentDate: [this.todayIso()],
      notes: [''],
    }),
    documents: this.fb.group({
      photoUrl: [''],
      aadhaarFrontUrl: [''],
      aadhaarBackUrl: [''],
      voterIdUrl: [''],
      idProofUrl: [''],
    }),
  });

  get personalGroup() { return this.form.get('personal') as FormGroup; }
  get cabinGroup()    { return this.form.get('cabin') as FormGroup; }
  get pgGroup()       { return this.form.get('pgRoom') as FormGroup; }
  get paymentGroup()  { return this.form.get('payment') as FormGroup; }
  get docsGroup()     { return this.form.get('documents') as FormGroup; }

  // ----- Derived state for step 2 -----
  /** Seats whose shifts aren't all booked. */
  availableSeats = computed(() => {
    const branchId = this.personalGroup.value.branchId;
    return this.allSeats().filter((s) => {
      if (!s.isActive) return false;
      if (branchId && s.branchId !== branchId) return false;
      const hasFullDay = s.assignments.some((a) => a.shift === Shift.FULL_DAY);
      const partials = s.assignments.filter((a) => a.shift !== Shift.FULL_DAY);
      const fullyBooked = hasFullDay || partials.length >= 4;
      return !fullyBooked;
    });
  });

  /** PG rooms that have at least one ACTIVE-free bed. */
  availablePgRooms = computed(() => {
    const branchId = this.personalGroup.value.branchId;
    return this.allPgRooms().filter((r) => {
      if (branchId && r.branchId !== branchId) return false;
      return r.availableBeds > 0;
    });
  });

  /** Bed numbers free in the currently-selected PG room. */
  selectedPgRoomBeds = computed<number[]>(() => {
    const id = this.pgGroup.value.roomId as string;
    if (!id) return [];
    const r = this.allPgRooms().find((x) => x.id === id);
    if (!r) return [];
    return r.beds.filter((b) => b.status === 'AVAILABLE').map((b) => b.bedNumber);
  });

  /** Total free beds across available PG rooms — feeds the chooser-card count. */
  totalFreeBeds = computed(() => this.availablePgRooms().reduce((n, r) => n + r.availableBeds, 0));

  /** Currently-selected seat (for the preview card). */
  selectedSeat = computed<SeatWithAssignments | null>(() => {
    const id = this.cabinGroup.value.seatId as string;
    return id ? (this.allSeats().find((x) => x.id === id) ?? null) : null;
  });

  /** Currently-selected PG room (for the visual bed picker). */
  selectedPgRoom = computed<PgRoom | null>(() => {
    const id = this.pgGroup.value.roomId as string;
    return id ? (this.allPgRooms().find((x) => x.id === id) ?? null) : null;
  });

  bedGridClass(n: number): string {
    return n <= 1 ? 'grid-cols-1' : n === 2 ? 'grid-cols-2' : 'grid-cols-3';
  }

  shortShift(s: Shift): string {
    return s === Shift.FULL_DAY ? 'Full' : s.charAt(0) + s.slice(1, 3).toLowerCase();
  }

  hasCabin = computed(() => this.accomType() === 'CABIN_ONLY' || this.accomType() === 'BOTH');
  hasPg    = computed(() => this.accomType() === 'PG_ONLY'    || this.accomType() === 'BOTH');

  cabinFee     = computed(() => this.hasCabin() ? Number(this.cabinGroup.value.monthlyFee || 0) : 0);
  pgFee        = computed(() => this.hasPg() ? Number(this.pgGroup.value.monthlyFee || 0) : 0);
  totalMonthly = computed(() => this.cabinFee() + this.pgFee());
  totalInitial = computed(() => {
    const v = this.paymentGroup.value;
    const cabin = this.hasCabin() ? Number(v.cabinInitial || 0) : 0;
    const pg    = this.hasPg()    ? Number(v.pgInitial    || 0) : 0;
    return cabin + pg;
  });

  trackStep(_: number, s: StepDef) { return s.key; }

  ngOnInit() {
    this.branchesApi.list().subscribe((bs) => {
      this.branches.set(bs);
      if (bs.length > 0 && !this.personalGroup.value.branchId) {
        this.personalGroup.patchValue({ branchId: bs[0].id });
      }
    });
    this.loadExamTargets();

    // Pre-load seats & rooms so the accommodation step is instant.
    this.seatsApi.list().subscribe({
      next: (rows) => this.allSeats.set(rows),
      error: () => { /* ignore — accommodation step will show empty */ },
    });
    this.pgApi.list().subscribe({
      next: (rows) => this.allPgRooms.set(rows),
      error: () => { /* ignore */ },
    });

    const paramId = this.route.snapshot.paramMap.get('id');
    if (paramId && paramId !== 'new') {
      this.id.set(paramId);
      this.api.get(paramId).subscribe((s) => {
        this.code.set(s.code);
        this.personalGroup.patchValue({
          fullName: s.fullName,
          phone: s.phone,
          email: s.email ?? '',
          dateOfBirth: s.dateOfBirth?.slice(0, 10) ?? '',
          gender: s.gender,
          status: s.status,
          branchId: s.branchId,
          examTarget: s.examTarget,
          expiresAt: s.expiresAt?.slice(0, 10) ?? '',
          aadhaarNumber: s.aadhaarNumber ?? '',
          voterId: s.voterId ?? '',
          fatherName: s.fatherName ?? '',
          motherName: s.motherName ?? '',
          emergencyContact: s.emergencyContact ?? '',
          permanentAddress: s.permanentAddress ?? '',
          temporaryAddress: s.temporaryAddress ?? '',
        });
        this.docsGroup.patchValue({
          photoUrl: s.photoUrl ?? '',
          idProofUrl: s.idProofUrl ?? '',
        });
        if (s.permanentAddress && s.permanentAddress === s.temporaryAddress) {
          this.sameAddress.set(true);
        }
      });
    }
  }

  private loadExamTargets() {
    this.examApi.list().subscribe({
      next: (rows) => this.examTargets.set(rows),
      error: () => this.toast.error('Could not load exam list'),
    });
  }

  // ----- Step navigation -----
  setAccomType(t: AccomType) {
    this.accomType.set(t);
    // Reset the fees to defaults when switching modes so the summary stays sensible.
    if (t === 'PG_ONLY') this.cabinGroup.reset({ seatId: '', shift: Shift.FULL_DAY, joinDate: this.todayIso(), dueDate: this.nextMonthIso(), monthlyFee: 0 });
    if (t === 'CABIN_ONLY') this.pgGroup.reset({ roomId: '', bedNumber: 1, joinDate: this.todayIso(), dueDate: this.nextMonthIso(), monthlyFee: 0 });
  }
  setPayMethod(m: PayMethod) {
    this.payMethod.set(m);
    if (m === 'CASH') this.paymentGroup.patchValue({ transactionRef: '' });
  }

  onCabinChange() {
    const id = this.cabinGroup.value.seatId as string;
    const s = this.allSeats().find((x) => x.id === id);
    if (s) {
      const fee = this.bestSeatRate(s) || 0;
      this.cabinGroup.patchValue({ monthlyFee: fee });
      this.paymentGroup.patchValue({ cabinInitial: fee });
    }
  }

  onPgRoomChange() {
    const id = this.pgGroup.value.roomId as string;
    const r = this.allPgRooms().find((x) => x.id === id);
    if (r) {
      const freeBeds = r.beds.filter((b) => b.status === 'AVAILABLE').map((b) => b.bedNumber);
      this.pgGroup.patchValue({
        monthlyFee: r.monthlyRate,
        bedNumber: freeBeds[0] ?? 1,
      });
      this.paymentGroup.patchValue({ pgInitial: r.monthlyRate });
    }
  }

  pgRoomTypeLabel(t: string): string {
    return t === 'SINGLE' ? 'Single' : t === 'DOUBLE' ? 'Double' : 'Triple';
  }

  /** Best monthly rate across all shifts for a seat — falls back to FULL_DAY. */
  bestSeatRate(s: SeatWithAssignments): number {
    const rates: Record<string, number> = (s.monthlyRates ?? {}) as any;
    const numbers = Object.values(rates).filter((v) => typeof v === 'number') as number[];
    if (rates['FULL_DAY']) return rates['FULL_DAY'];
    if (numbers.length === 0) return 0;
    return Math.min(...numbers);
  }

  // ----- Validation per step -----
  isStepValid(): boolean {
    if (this.id()) return this.personalGroup.valid;
    const step = this.currentStep();
    if (step === 0) return this.personalGroup.valid;
    if (step === 1) {
      if (!this.accomType()) return false;
      if (this.hasCabin()) {
        const c = this.cabinGroup.value;
        if (!c.seatId || !c.shift || !c.joinDate || !c.dueDate || !c.monthlyFee) return false;
      }
      if (this.hasPg()) {
        const p = this.pgGroup.value;
        if (!p.roomId || !p.bedNumber || !p.joinDate || !p.dueDate || !p.monthlyFee) return false;
      }
      return true;
    }
    if (step === 2) {
      const p = this.paymentGroup.value;
      if (!p.paymentDate) return false;
      if (this.payMethod() !== 'CASH' && !p.transactionRef) return false;
      if (this.hasCabin() && p.cabinInitial == null) return false;
      if (this.hasPg() && p.pgInitial == null) return false;
      return true;
    }
    return true; // Step 4 (documents) is fully optional.
  }

  next() {
    if (!this.isStepValid()) {
      this.toast.warning('Please complete the required fields on this step.');
      return;
    }
    if (this.currentStep() < this.steps().length - 1) {
      this.currentStep.set(this.currentStep() + 1);
    }
  }
  prev() {
    if (this.currentStep() > 0) this.currentStep.set(this.currentStep() - 1);
  }
  jumpTo(i: number) {
    if (i <= this.currentStep()) this.currentStep.set(i);
  }

  toggleSameAddress(ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this.sameAddress.set(checked);
    if (checked) {
      this.personalGroup.patchValue({ temporaryAddress: this.personalGroup.value.permanentAddress ?? '' });
    }
  }

  comingSoon(label: string) {
    this.toast.info(`${label} integration is coming soon. Use the URL field for now.`);
  }

  // ----- Add-exam modal -----
  openAddExam() {
    this.newExamName = '';
    this.addingExam.set(true);
  }
  closeAddExam() {
    this.addingExam.set(false);
    this.addingExamLoading.set(false);
  }
  submitNewExam() {
    const name = this.newExamName.trim();
    if (!name) return;
    this.addingExamLoading.set(true);
    this.examApi.create(name).subscribe({
      next: (created) => {
        this.examTargets.update((arr) => [...arr, created].sort((a, b) => a.name.localeCompare(b.name)));
        this.personalGroup.patchValue({ examTarget: created.name });
        this.toast.success(`Added "${created.name}" to the exam list`);
        this.closeAddExam();
      },
      error: (err) => {
        const msg = err.error?.message ?? 'Could not add exam';
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : msg);
        this.addingExamLoading.set(false);
      },
    });
  }

  // ----- Submit -----
  submit(asDraft = false) {
    if (this.id()) return this.submitEdit();
    if (!this.personalGroup.valid) {
      this.personalGroup.markAllAsTouched();
      this.toast.warning('Personal info has missing or invalid fields.');
      this.currentStep.set(0);
      return;
    }
    this.saving.set(true);

    const personal = this.personalGroup.value;
    const docs = this.docsGroup.value;
    const permanent = personal.permanentAddress || undefined;
    const temporary = this.sameAddress() ? permanent : (personal.temporaryAddress || undefined);

    const studentPayload: any = {
      branchId: personal.branchId,
      fullName: personal.fullName,
      phone: personal.phone,
      email: personal.email || undefined,
      gender: personal.gender ?? undefined,
      dateOfBirth: personal.dateOfBirth || undefined,
      aadhaarNumber: personal.aadhaarNumber || undefined,
      voterId: personal.voterId || undefined,
      idProofUrl: docs.idProofUrl || undefined,
      permanentAddress: permanent,
      temporaryAddress: temporary,
      fatherName: personal.fatherName || undefined,
      motherName: personal.motherName || undefined,
      emergencyContact: personal.emergencyContact || undefined,
      examTarget: personal.examTarget || undefined,
      expiresAt: personal.expiresAt || undefined,
      photoUrl: docs.photoUrl || undefined,
    };

    this.api.create(studentPayload).pipe(
      switchMap((s: any) => {
        if (asDraft) return of({ student: s, accomResults: [], paymentResults: [] });
        return this.chainAccommodationsAndPayments(s);
      }),
    ).subscribe({
      next: (r: any) => {
        const errs = (r.accomResults ?? []).concat(r.paymentResults ?? []).filter((x: any) => x?.error);
        if (errs.length > 0) {
          this.toast.warning(`Student ${r.student.fullName} created, but: ${errs.map((e: any) => e.error).join(' · ')}`);
        } else {
          this.toast.success(asDraft ? `Saved draft for ${r.student.fullName} (${r.student.code})`
                                     : `Registered ${r.student.fullName} (${r.student.code})`);
        }
        this.router.navigate(['/students']);
      },
      error: (err) => {
        const msg = err.error?.message;
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : (msg ?? 'Registration failed'));
        this.saving.set(false);
      },
    });
  }

  /** Chains optional seat-assignment, optional PG assignment, and optional payments after student create. */
  private chainAccommodationsAndPayments(student: { id: string; branchId: string; fullName: string; code: string }) {
    const accomTasks: any[] = [];
    if (this.hasCabin() && this.cabinGroup.value.seatId) {
      const c = this.cabinGroup.value;
      accomTasks.push(
        this.seatAllocApi.create({
          studentId: student.id,
          seatId: c.seatId!,
          shift: c.shift as Shift,
          startDate: c.joinDate!,
          endDate: c.dueDate || undefined,
        } as any).toPromise()
          .then(() => ({ kind: 'cabin', ok: true }))
          .catch((e) => ({ kind: 'cabin', ok: false, error: e?.error?.message ?? 'Could not allocate cabin' })),
      );
    }
    if (this.hasPg() && this.pgGroup.value.roomId) {
      const p = this.pgGroup.value;
      accomTasks.push(
        this.pgApi.assign(p.roomId!, {
          studentId: student.id,
          bedNumber: Number(p.bedNumber),
          monthlyRate: Number(p.monthlyFee),
          startDate: p.joinDate!,
          nextDueDate: p.dueDate || undefined,
        }).toPromise()
          .then(() => ({ kind: 'pg', ok: true }))
          .catch((e) => ({ kind: 'pg', ok: false, error: e?.error?.message ?? 'Could not allocate PG bed' })),
      );
    }

    const accomDone = accomTasks.length === 0 ? Promise.resolve([]) : Promise.all(accomTasks);

    return accomDone.then((accomResults) => {
      const payMethodMap: Record<PayMethod, PaymentMethod> = {
        CASH: PaymentMethod.CASH,
        UPI: PaymentMethod.UPI,
        BANK_TRANSFER: PaymentMethod.NETBANKING,
      };
      const pay = this.paymentGroup.value;
      const note = [pay.transactionRef ? `Ref: ${pay.transactionRef}` : '', pay.notes].filter(Boolean).join(' · ') || undefined;
      const payTasks: any[] = [];
      if (this.hasCabin() && Number(pay.cabinInitial) > 0) {
        payTasks.push(
          this.paymentsApi.recordManual({
            studentId: student.id,
            branchId: student.branchId,
            amount: Number(pay.cabinInitial),
            method: payMethodMap[this.payMethod()],
            notes: note ? `[Cabin] ${note}` : '[Cabin initial payment]',
            nextDueDate: this.cabinGroup.value.dueDate || undefined,
          }).toPromise()
            .then(() => ({ kind: 'cabinPay', ok: true }))
            .catch((e) => ({ kind: 'cabinPay', ok: false, error: e?.error?.message ?? 'Could not record cabin payment' })),
        );
      }
      if (this.hasPg() && Number(pay.pgInitial) > 0) {
        payTasks.push(
          this.paymentsApi.recordManual({
            studentId: student.id,
            branchId: student.branchId,
            amount: Number(pay.pgInitial),
            method: payMethodMap[this.payMethod()],
            notes: note ? `[PG] ${note}` : '[PG initial payment]',
            nextDueDate: this.pgGroup.value.dueDate || undefined,
          }).toPromise()
            .then(() => ({ kind: 'pgPay', ok: true }))
            .catch((e) => ({ kind: 'pgPay', ok: false, error: e?.error?.message ?? 'Could not record PG payment' })),
        );
      }
      const payDone = payTasks.length === 0 ? Promise.resolve([]) : Promise.all(payTasks);
      return payDone.then((paymentResults) => ({ student, accomResults, paymentResults }));
    });
  }

  /** Update flow (only personal info group is editable). */
  private submitEdit() {
    if (!this.personalGroup.valid) {
      this.personalGroup.markAllAsTouched();
      this.toast.warning('Some fields need attention.');
      return;
    }
    this.saving.set(true);
    const personal = this.personalGroup.value;
    const docs = this.docsGroup.value;
    const permanent = personal.permanentAddress || undefined;
    const temporary = this.sameAddress() ? permanent : (personal.temporaryAddress || undefined);
    const payload: any = {
      branchId: personal.branchId,
      fullName: personal.fullName,
      phone: personal.phone,
      email: personal.email || undefined,
      gender: personal.gender ?? undefined,
      dateOfBirth: personal.dateOfBirth || undefined,
      aadhaarNumber: personal.aadhaarNumber || undefined,
      voterId: personal.voterId || undefined,
      idProofUrl: docs.idProofUrl || undefined,
      permanentAddress: permanent,
      temporaryAddress: temporary,
      fatherName: personal.fatherName || undefined,
      motherName: personal.motherName || undefined,
      emergencyContact: personal.emergencyContact || undefined,
      examTarget: personal.examTarget || undefined,
      expiresAt: personal.expiresAt || undefined,
      photoUrl: docs.photoUrl || undefined,
      status: personal.status,
    };
    this.api.update(this.id()!, payload).subscribe({
      next: (s: any) => {
        this.toast.success(`Saved changes to ${s.fullName}`);
        this.router.navigate(['/students']);
      },
      error: (err) => {
        const msg = err.error?.message;
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : (msg ?? 'Save failed'));
        this.saving.set(false);
      },
    });
  }

  cancel() { this.router.navigate(['/students']); }

  remove() {
    if (!this.id() || !confirm('Delete this student? This cannot be undone.')) return;
    this.api.remove(this.id()!).subscribe({
      next: () => {
        this.toast.success('Student deleted');
        this.router.navigate(['/students']);
      },
      error: (err) => this.toast.error(err.error?.message ?? 'Delete failed'),
    });
  }

  // ----- helpers -----
  private todayIso(): string { return new Date().toISOString().slice(0, 10); }
  private nextMonthIso(): string {
    const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10);
  }
}
