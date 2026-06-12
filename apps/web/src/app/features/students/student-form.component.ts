import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { StudentsApiService } from './students.service';
import { BranchesApiService, Branch } from './branches.service';
import { ExamTargetsApiService, ExamTarget } from './exam-targets.service';
import { FeatureKey, Gender, PaymentMethod, Shift, StudentStatus } from '@lms/shared';
import { SeatsApiService, SeatAssignmentsApiService, SeatWithAssignments } from '../seats/seats.service';
import { PgRoomsApiService, PgRoom } from '../pg-rooms/pg-rooms.service';
import { TiffinApiService, TiffinMealType, TiffinMealPlan } from '../tiffin/tiffin.service';
import { PaymentsApiService } from '../payments/payments.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';

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
    <div class="max-w-7xl mx-auto">
      <div class="mb-3 flex items-center justify-between">
        <h1 class="text-2xl font-bold flex items-center gap-2">
          {{ id() ? 'Edit student' : 'New student' }}
          <code *ngIf="id()" class="bg-base-200 px-1.5 py-0.5 rounded text-sm font-normal">{{ code() }}</code>
        </h1>
        <button class="btn btn-ghost btn-sm" (click)="cancel()">Cancel</button>
      </div>

      <!-- Stepper (shown for new registration and while completing a draft) -->
      <div *ngIf="showFullFlow()" class="card bg-base-100 border border-base-300 shadow-sm mb-3 overflow-hidden">
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
          <div class="flex items-center gap-3 mb-5 pb-3 border-b border-base-200">
            <span class="w-11 h-11 rounded-xl grid place-items-center text-xl shrink-0 bg-primary bg-opacity-10 text-primary">
              {{ steps()[currentStep()].icon }}
            </span>
            <div class="flex-1 min-w-0">
              <h2 class="text-lg font-semibold leading-tight">{{ steps()[currentStep()].label }}</h2>
              <p class="text-xs opacity-60 truncate">{{ steps()[currentStep()].hint }}</p>
            </div>
            <span *ngIf="showFullFlow()" class="text-xs uppercase tracking-wider opacity-50 whitespace-nowrap">
              Step {{ currentStep() + 1 }} / {{ steps().length }}
            </span>
          </div>

          <!-- ============================== STEP 1: PERSONAL INFO ============================== -->
          <ng-container *ngIf="currentStep() === 0">
            <div formGroupName="personal" class="space-y-7">

              <!-- ---- Basic details ---- -->
              <section>
                <div class="lms-section-head"><span class="lms-section-chip">👤</span> Basic details</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Full name *</span></div>
                    <input class="input input-bordered" formControlName="fullName" placeholder="ex. Zahid Anjum" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Phone *</span></div>
                    <input class="input input-bordered" formControlName="phone" placeholder="ex. 9876543210" inputmode="tel" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Email</span></div>
                    <input class="input input-bordered" type="email" formControlName="email" placeholder="ex. zahid@email.com" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Date of birth</span></div>
                    <input class="input input-bordered" type="date" formControlName="dateOfBirth" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Gender</span></div>
                    <select class="select select-bordered" formControlName="gender">
                      <option [ngValue]="null">—</option>
                      <option *ngFor="let g of genders" [value]="g">{{ g }}</option>
                    </select>
                  </label>
                  <label class="form-control" *ngIf="id()">
                    <div class="label py-1"><span class="label-text font-medium">Status</span></div>
                    <select class="select select-bordered" formControlName="status">
                      <option *ngFor="let s of statuses" [value]="s">{{ s }}</option>
                    </select>
                  </label>
                </div>
              </section>

              <!-- ---- Academic & membership ---- -->
              <section>
                <div class="lms-section-head"><span class="lms-section-chip">🎓</span> Academic &amp; membership</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Branch *</span></div>
                    <select class="select select-bordered" formControlName="branchId">
                      <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }} ({{ b.code }})</option>
                    </select>
                  </label>
                  <label class="form-control">
                    <div class="label py-1 justify-between">
                      <span class="label-text font-medium">Studying for which exam</span>
                      <button type="button" class="btn btn-ghost btn-xs text-primary" (click)="openAddExam()">+ Add new</button>
                    </div>
                    <select class="select select-bordered" formControlName="examTarget">
                      <option [ngValue]="null">—</option>
                      <option *ngFor="let e of examTargets()" [value]="e.name">
                        {{ e.name }}{{ e.isCustom ? ' (custom)' : '' }}
                      </option>
                    </select>
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Membership expires on</span></div>
                    <input class="input input-bordered" type="date" formControlName="expiresAt" />
                  </label>
                </div>
              </section>

              <!-- ---- Identity documents ---- -->
              <section>
                <div class="lms-section-head"><span class="lms-section-chip">🪪</span> Identity documents</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Aadhaar number</span></div>
                    <input class="input input-bordered" formControlName="aadhaarNumber" placeholder="ex. 1234 5678 9012" maxlength="12" inputmode="numeric" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Voter ID (EPIC)</span></div>
                    <input class="input input-bordered" formControlName="voterId" placeholder="ex. ABC1234567" maxlength="20" />
                  </label>
                </div>
              </section>

              <!-- ---- Family & emergency ---- -->
              <section>
                <div class="lms-section-head"><span class="lms-section-chip">👪</span> Family &amp; emergency</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Father's name</span></div>
                    <input class="input input-bordered" formControlName="fatherName" placeholder="ex. Imran Anjum" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Mother's name</span></div>
                    <input class="input input-bordered" formControlName="motherName" placeholder="ex. Sara Anjum" />
                  </label>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Emergency contact</span></div>
                    <input class="input input-bordered" formControlName="emergencyContact" placeholder="ex. 9876543210" inputmode="tel" />
                  </label>
                </div>
              </section>

              <!-- ---- Address ---- -->
              <section>
                <div class="lms-section-head"><span class="lms-section-chip">📍</span> Address</div>
                <div class="grid grid-cols-1 gap-y-3">
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text font-medium">Permanent address</span></div>
                    <textarea class="textarea textarea-bordered" formControlName="permanentAddress" rows="2" placeholder="ex. House 12, MG Road, Pune, MH 411001"></textarea>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" class="checkbox checkbox-primary checkbox-sm" [checked]="sameAddress()" (change)="toggleSameAddress($event)" />
                    <span class="text-sm">Temporary address is the same as permanent</span>
                  </label>
                  <label class="form-control" *ngIf="!sameAddress()">
                    <div class="label py-1"><span class="label-text font-medium">Temporary address</span></div>
                    <textarea class="textarea textarea-bordered" formControlName="temporaryAddress" rows="2" placeholder="ex. Flat 4B, Sector 22, Noida, UP 201301"></textarea>
                  </label>
                </div>
              </section>
            </div>
          </ng-container>

          <!-- ============================== STEP 2: ACCOMMODATION ============================== -->
          <ng-container *ngIf="currentStep() === 1 && showFullFlow()">
            <div class="space-y-5">
              <!-- Type chooser — bigger, richer cards -->
              <div class="grid grid-cols-1 gap-3" [class.md:grid-cols-3]="pgEnabled()">
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
                        (click)="toggleAccomType('CABIN_ONLY')">
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
                <button type="button" *ngIf="pgEnabled()"
                        class="relative overflow-hidden rounded-2xl p-5 text-left border-2 transition-all hover:shadow-lg hover:-translate-y-0.5"
                        [class.border-success]="accomType() === 'PG_ONLY'"
                        [class.shadow-md]="accomType() === 'PG_ONLY'"
                        [class.bg-gradient-to-br]="accomType() === 'PG_ONLY'"
                        [class.from-success]="accomType() === 'PG_ONLY'"
                        [class.to-emerald-600]="accomType() === 'PG_ONLY'"
                        [class.text-success-content]="accomType() === 'PG_ONLY'"
                        [class.border-base-300]="accomType() !== 'PG_ONLY'"
                        [class.bg-base-100]="accomType() !== 'PG_ONLY'"
                        (click)="toggleAccomType('PG_ONLY')">
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
                <button type="button" *ngIf="pgEnabled()"
                        class="relative overflow-hidden rounded-2xl p-5 text-left border-2 transition-all hover:shadow-lg hover:-translate-y-0.5"
                        [class.border-warning]="accomType() === 'BOTH'"
                        [class.shadow-md]="accomType() === 'BOTH'"
                        [class.bg-gradient-to-br]="accomType() === 'BOTH'"
                        [class.from-warning]="accomType() === 'BOTH'"
                        [class.to-amber-600]="accomType() === 'BOTH'"
                        [class.text-warning-content]="accomType() === 'BOTH'"
                        [class.border-base-300]="accomType() !== 'BOTH'"
                        [class.bg-base-100]="accomType() !== 'BOTH'"
                        (click)="toggleAccomType('BOTH')">
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

              <!-- ===== TIFFIN ADD-ON (independent — pairs with any accommodation, or stands alone) ===== -->
              <div *ngIf="tiffinEnabled()"
                   class="rounded-2xl border-2 overflow-hidden transition-all"
                   [class.border-info]="tiffinActive()"
                   [class.shadow-md]="tiffinActive()"
                   [class.border-base-300]="!tiffinActive()">
                <button type="button"
                        class="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                        [class.bg-gradient-to-r]="tiffinActive()"
                        [class.from-info]="tiffinActive()"
                        [class.to-sky-600]="tiffinActive()"
                        [class.text-info-content]="tiffinActive()"
                        [class.bg-base-100]="!tiffinActive()"
                        (click)="toggleTiffin()">
                  <div class="flex items-center gap-3">
                    <span class="w-11 h-11 rounded-xl grid place-items-center text-2xl"
                          [class.bg-white]="tiffinActive()" [class.bg-opacity-20]="tiffinActive()"
                          [class.bg-info]="!tiffinActive()" [class.bg-opacity-10]="!tiffinActive()"
                          [class.text-info]="!tiffinActive()">🍱</span>
                    <div>
                      <div class="font-bold text-base">Tiffin / Meal Service</div>
                      <div class="text-xs opacity-80">Add a monthly meal plan — on its own or with a cabin/PG.</div>
                    </div>
                  </div>
                  <span class="w-7 h-7 rounded-full grid place-items-center text-sm font-bold border-2"
                        [class.bg-white]="tiffinActive()" [class.text-info]="tiffinActive()" [class.border-white]="tiffinActive()"
                        [class.border-base-300]="!tiffinActive()">
                    <span *ngIf="tiffinActive()">✓</span>
                  </span>
                </button>

                <div *ngIf="tiffinActive()" formGroupName="tiffin" class="p-5 pt-4 space-y-3 border-t border-base-200">
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label class="form-control">
                      <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Meal type *</span></div>
                      <div class="grid grid-cols-2 gap-1.5">
                        <button *ngFor="let m of mealTypes" type="button"
                                class="btn btn-xs"
                                [class.btn-info]="tiffinGroup.value.mealType === m.value"
                                [class.btn-outline]="tiffinGroup.value.mealType !== m.value"
                                (click)="tiffinGroup.patchValue({ mealType: m.value })">
                          {{ m.label }}
                        </button>
                      </div>
                    </label>
                    <label class="form-control">
                      <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Meals per day *</span></div>
                      <div class="grid grid-cols-3 gap-1.5">
                        <button *ngFor="let p of mealPlans" type="button"
                                class="btn btn-xs"
                                [class.btn-info]="tiffinGroup.value.mealPlan === p.value"
                                [class.btn-outline]="tiffinGroup.value.mealPlan !== p.value"
                                (click)="tiffinGroup.patchValue({ mealPlan: p.value })">
                          {{ p.label }}
                        </button>
                      </div>
                    </label>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <label class="form-control">
                      <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Join date *</span></div>
                      <input class="input input-bordered input-sm" type="date" formControlName="joinDate" />
                    </label>
                    <label class="form-control">
                      <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Due date *</span></div>
                      <input class="input input-bordered input-sm" type="date" formControlName="dueDate" />
                    </label>
                  </div>
                  <label class="form-control">
                    <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Monthly tiffin fee (₹) *</span></div>
                    <label class="input input-bordered flex items-center gap-2">
                      <span class="opacity-60">₹</span>
                      <input class="grow" type="number" min="0" formControlName="monthlyFee" (change)="onTiffinFeeChange()" />
                    </label>
                  </label>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label class="form-control">
                      <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Delivery person (optional)</span></div>
                      <input class="input input-bordered input-sm" formControlName="deliveryAssignee" placeholder="e.g. Ramesh Kumar" />
                    </label>
                    <label class="form-control">
                      <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Delivery phone (optional)</span></div>
                      <input class="input input-bordered input-sm" formControlName="deliveryPhone" placeholder="e.g. 9876543210" />
                    </label>
                  </div>
                </div>
              </div>

              <p *ngIf="!accomType() && !tiffinActive()" class="text-sm opacity-60 italic flex items-center gap-2">
                <span class="text-base">👆</span>Pick a service above to continue.
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
                      <select class="select select-bordered select-sm" formControlName="seatId" (change)="onCabinChange()">
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
                      <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
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
                        <input class="input input-bordered input-sm" type="date" formControlName="joinDate" />
                      </label>
                      <label class="form-control">
                        <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Due date *</span></div>
                        <input class="input input-bordered input-sm" type="date" formControlName="dueDate" />
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
                      <select class="select select-bordered select-sm" formControlName="roomId" (change)="onPgRoomChange()">
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
                        <input class="input input-bordered input-sm" type="date" formControlName="joinDate" />
                      </label>
                      <label class="form-control">
                        <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Due date *</span></div>
                        <input class="input input-bordered input-sm" type="date" formControlName="dueDate" />
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
              <div *ngIf="(accomType() || tiffinActive()) && totalMonthly() > 0"
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
                  <span *ngIf="hasTiffin() && tiffinFee() > 0" class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-info"></span>
                    Tiffin: <span class="font-semibold">₹{{ tiffinFee() | number }}</span>
                  </span>
                </div>
                <div class="text-base font-bold">
                  Total monthly: <span class="text-primary">₹{{ totalMonthly() | number }}</span>
                </div>
              </div>
            </div>
          </ng-container>

          <!-- ============================== STEP 3: PAYMENT ============================== -->
          <ng-container *ngIf="currentStep() === 2 && showFullFlow()">
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
                <div class="alert bg-base-200 border-0 py-2 text-xs">
                  💡 Part payment is allowed — enter less than the monthly fee to collect now and keep the rest as <strong>balance due</strong>.
                </div>

                <div *ngIf="hasCabin()" class="form-control">
                  <div class="label py-1 justify-between">
                    <span class="label-text uppercase text-[11px] tracking-wider opacity-60">Cabin payment now (₹) *</span>
                    <button type="button" class="btn btn-ghost btn-xs" (click)="payFull('cabin')">Pay full (₹{{ feeOf('cabin') | number }})</button>
                  </div>
                  <input class="input input-bordered input-sm" type="number" min="0" formControlName="cabinInitial" />
                  <div class="label py-0.5">
                    <span *ngIf="advanceOf('cabin') > 0; else cabinDue" class="label-text-alt text-success">Advance: ₹{{ advanceOf('cabin') | number }}</span>
                    <ng-template #cabinDue><span class="label-text-alt" [class.text-warning]="balanceOf('cabin') > 0">Balance due: ₹{{ balanceOf('cabin') | number }}</span></ng-template>
                  </div>
                </div>

                <div *ngIf="hasPg()" class="form-control">
                  <div class="label py-1 justify-between">
                    <span class="label-text uppercase text-[11px] tracking-wider opacity-60">PG room payment now (₹) *</span>
                    <button type="button" class="btn btn-ghost btn-xs" (click)="payFull('pg')">Pay full (₹{{ feeOf('pg') | number }})</button>
                  </div>
                  <input class="input input-bordered input-sm" type="number" min="0" formControlName="pgInitial" />
                  <div class="label py-0.5">
                    <span *ngIf="advanceOf('pg') > 0; else pgDue" class="label-text-alt text-success">Advance: ₹{{ advanceOf('pg') | number }}</span>
                    <ng-template #pgDue><span class="label-text-alt" [class.text-warning]="balanceOf('pg') > 0">Balance due: ₹{{ balanceOf('pg') | number }}</span></ng-template>
                  </div>
                </div>

                <div *ngIf="hasTiffin()" class="form-control">
                  <div class="label py-1 justify-between">
                    <span class="label-text uppercase text-[11px] tracking-wider opacity-60">Tiffin payment now (₹) *</span>
                    <button type="button" class="btn btn-ghost btn-xs" (click)="payFull('tiffin')">Pay full (₹{{ feeOf('tiffin') | number }})</button>
                  </div>
                  <input class="input input-bordered input-sm" type="number" min="0" formControlName="tiffinInitial" />
                  <div class="label py-0.5">
                    <span *ngIf="advanceOf('tiffin') > 0; else tiffinDue" class="label-text-alt text-success">Advance: ₹{{ advanceOf('tiffin') | number }}</span>
                    <ng-template #tiffinDue><span class="label-text-alt" [class.text-warning]="balanceOf('tiffin') > 0">Balance due: ₹{{ balanceOf('tiffin') | number }}</span></ng-template>
                  </div>
                </div>

                <label *ngIf="payMethod() === 'UPI'" class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">UPI transaction ID *</span></div>
                  <input class="input input-bordered input-sm" formControlName="transactionRef" placeholder="e.g. 123456789012" />
                </label>
                <label *ngIf="payMethod() === 'BANK_TRANSFER'" class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Bank reference / UTR *</span></div>
                  <input class="input input-bordered input-sm" formControlName="transactionRef" placeholder="UTR number or bank ref" />
                </label>

                <label class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Payment date *</span></div>
                  <input class="input input-bordered input-sm" type="date" formControlName="paymentDate" />
                </label>
                <label class="form-control">
                  <div class="label py-1"><span class="label-text uppercase text-[11px] tracking-wider opacity-60">Notes (optional)</span></div>
                  <textarea class="textarea textarea-bordered textarea-sm" rows="2" formControlName="notes" placeholder="Any additional payment notes…"></textarea>
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
                    <div *ngIf="hasTiffin()" class="flex items-center justify-between">
                      <span class="opacity-70">Tiffin fee</span>
                      <span class="font-medium">₹{{ tiffinFee() | number }}</span>
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
                    <div *ngIf="netBalance() >= 0" class="flex items-center justify-between" [class.text-warning]="netBalance() > 0">
                      <span class="opacity-70">Balance due</span>
                      <span class="font-semibold">₹{{ netBalance() | number }}</span>
                    </div>
                    <div *ngIf="netBalance() < 0" class="flex items-center justify-between text-success">
                      <span class="opacity-70">Advance / credit</span>
                      <span class="font-semibold">₹{{ -netBalance() | number }}</span>
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
          <ng-container *ngIf="currentStep() === 3 && showFullFlow()">
            <div formGroupName="documents" class="space-y-4">
              <!-- Photo capture -->
              <div class="card bg-base-100 border border-base-300 shadow-sm">
                <div class="card-body p-4">
                  <div class="font-semibold mb-3">Student Photo</div>
                  <div class="flex items-start gap-4 flex-wrap">
                    <div class="w-32 h-32 rounded-xl border-2 border-dashed border-base-300 grid place-items-center overflow-hidden bg-base-200 shrink-0">
                      <img *ngIf="docValue('photoUrl')" [src]="docValue('photoUrl')" class="w-full h-full object-cover" alt="Student photo" />
                      <span *ngIf="!docValue('photoUrl')" class="text-4xl opacity-30">📷</span>
                    </div>
                    <div class="flex-1 min-w-[220px] space-y-2">
                      <div class="join">
                        <button type="button" class="join-item btn btn-sm btn-primary" (click)="photoInput.click()">⬆ Upload</button>
                        <button type="button" class="join-item btn btn-sm" (click)="openWebcam()">📷 Webcam</button>
                        <button type="button" class="join-item btn btn-sm btn-ghost text-error" *ngIf="docValue('photoUrl')" (click)="clearImage('photoUrl')">Remove</button>
                      </div>
                      <input #photoInput type="file" accept="image/*" class="hidden" (change)="onFilePick($event, 'photoUrl', 640)" />
                      <div class="text-xs opacity-60">
                        Upload a JPG/PNG or capture from your webcam. Images are resized and saved with the student.
                      </div>
                      <span *ngIf="uploadingField() === 'photoUrl'" class="loading loading-spinner loading-sm"></span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Documents -->
              <div class="card bg-base-100 border border-base-300 shadow-sm">
                <div class="card-body p-4">
                  <div class="font-semibold mb-3">ID Documents <span class="text-xs opacity-60 font-normal">(optional)</span></div>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div *ngFor="let d of docFields" class="flex items-center gap-3">
                      <div class="w-16 h-16 rounded-lg border border-base-300 grid place-items-center overflow-hidden bg-base-200 shrink-0">
                        <img *ngIf="docValue(d.urlField)" [src]="docValue(d.urlField)" class="w-full h-full object-cover" [alt]="d.label" />
                        <span *ngIf="!docValue(d.urlField)" class="text-xl opacity-30">🪪</span>
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="text-sm font-medium truncate">{{ d.label }}</div>
                        <div class="flex items-center gap-2 mt-1">
                          <input #docInput type="file" accept="image/*" class="hidden" (change)="onFilePick($event, d.urlField, 1100)" />
                          <button type="button" class="btn btn-xs" (click)="docInput.click()">
                            {{ docValue(d.urlField) ? 'Replace' : 'Choose file' }}
                          </button>
                          <button type="button" class="btn btn-xs btn-ghost text-error" *ngIf="docValue(d.urlField)" (click)="clearImage(d.urlField)">Remove</button>
                          <span *ngIf="uploadingField() === d.urlField" class="loading loading-spinner loading-xs"></span>
                        </div>
                      </div>
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
              <button *ngIf="showFullFlow() && currentStep() > 0" type="button" class="btn btn-ghost" (click)="prev()">‹ Back</button>
            </div>
            <div class="flex gap-2 ml-auto">
              <button *ngIf="!id() || isDraftEdit()" type="button" class="btn btn-ghost"
                      (click)="submit(true)" [disabled]="saving() || !personalGroup.valid"
                      title="Save now as a draft (status Pending); finish accommodation and payment later">
                💾 Save as Draft
              </button>
              <button *ngIf="currentStep() < steps().length - 1" type="button" class="btn btn-primary" (click)="next()">
                Next Step ›
              </button>
              <button *ngIf="currentStep() === steps().length - 1"
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
          <input class="input input-bordered input-sm" [(ngModel)]="newExamName" [ngModelOptions]="{standalone: true}" placeholder="e.g. NDA, CDS, Railways NTPC" (keydown.enter)="submitNewExam(); $event.preventDefault()" />
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

    <!-- Webcam capture modal -->
    <dialog class="modal" [class.modal-open]="webcamOpen()">
      <div class="modal-box max-w-lg">
        <h3 class="font-bold text-lg mb-2">Capture student photo</h3>
        <div class="rounded-lg overflow-hidden bg-black grid place-items-center aspect-video">
          <video #webcamVideo autoplay playsinline muted class="w-full h-full object-contain"></video>
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" (click)="closeWebcam()">Cancel</button>
          <button type="button" class="btn btn-primary" (click)="capturePhoto()">📸 Capture</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="closeWebcam()">close</button></form>
    </dialog>
  `,
  styles: [`
    /* ---- Section sub-headers inside the Personal Info step ---- */
    .lms-section-head {
      display: flex; align-items: center; gap: .55rem;
      font-size: .78rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: .06em;
      opacity: .85;
      margin-bottom: .85rem;
      padding-bottom: .45rem;
      border-bottom: 1px solid hsl(var(--b2));
    }
    .lms-section-chip {
      width: 1.7rem; height: 1.7rem; border-radius: .55rem;
      display: grid; place-items: center;
      font-size: .9rem; flex-shrink: 0;
      background: hsl(var(--p) / .12);
    }

    /* ---- Stepper ---- */
    .lms-stepper {
      position: relative;
      display: flex;
      justify-content: space-between;
      padding: 1rem 1.75rem .85rem;
      gap: .5rem;
    }
    .lms-stepper-track {
      position: absolute;
      left: 3.25rem; right: 3.25rem; top: 2rem;
      height: 3px;
      background: hsl(var(--b3));
      border-radius: 999px;
      z-index: 0;
    }
    .lms-stepper-progress {
      position: absolute;
      left: 3.25rem; top: 2rem;
      height: 3px;
      background: linear-gradient(90deg, hsl(var(--p)), hsl(var(--s)));
      border-radius: 999px;
      z-index: 1;
      transition: width .35s cubic-bezier(.16, 1, .3, 1);
      max-width: calc(100% - 6.5rem);
    }
    .lms-step {
      position: relative;
      z-index: 2;
      background: transparent;
      border: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .45rem;
      flex: 1;
      cursor: pointer;
    }
    .lms-step:not(:disabled):hover .lms-step-circle { transform: translateY(-2px); }
    .lms-step:disabled { cursor: not-allowed; opacity: .55; }
    .lms-step-circle {
      width: 2.25rem; height: 2.25rem;
      border-radius: 9999px;
      display: grid; place-items: center;
      font-size: 1rem;
      background: hsl(var(--b1));
      border: 2px solid hsl(var(--b3));
      color: hsl(var(--bc) / .6);
      transition: background .25s ease, border-color .25s ease, transform .2s ease, box-shadow .25s ease;
    }
    .lms-step.is-active .lms-step-circle {
      background: linear-gradient(135deg, hsl(var(--p)), hsl(var(--s)));
      border-color: hsl(var(--p));
      color: hsl(var(--pc));
      transform: scale(1.1);
      box-shadow: 0 0 0 4px hsl(var(--p) / .18);
    }
    .lms-step.is-done .lms-step-circle {
      background: hsl(var(--su));
      border-color: hsl(var(--su));
      color: hsl(var(--suc));
    }
    .lms-check { font-weight: 700; }
    .lms-step-icon { font-size: 1rem; line-height: 1; }
    .lms-step-label {
      font-size: .7rem;
      text-transform: uppercase;
      letter-spacing: .06em;
      opacity: .6;
      font-weight: 600;
      text-align: center;
    }
    .lms-step.is-active .lms-step-label { opacity: 1; color: hsl(var(--p)); }
    .lms-step.is-done .lms-step-label { opacity: 1; }
    @media (max-width: 640px) {
      .lms-stepper { padding: 1rem .75rem .85rem; }
      .lms-stepper-track, .lms-stepper-progress { left: 2.25rem; right: 2.25rem; }
      .lms-stepper-progress { max-width: calc(100% - 4.5rem); }
      .lms-step-label { font-size: .6rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .lms-step-circle, .lms-stepper-progress { transition: none; }
      .lms-step:not(:disabled):hover .lms-step-circle { transform: none; }
    }
  `],
})
export class StudentFormComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(StudentsApiService);
  private branchesApi = inject(BranchesApiService);
  private examApi = inject(ExamTargetsApiService);
  private seatsApi = inject(SeatsApiService);
  private seatAllocApi = inject(SeatAssignmentsApiService);
  private pgApi = inject(PgRoomsApiService);
  private tiffinApi = inject(TiffinApiService);
  private paymentsApi = inject(PaymentsApiService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  /** PG accommodation is only offered when the tenant has the PG Rooms feature enabled. */
  pgEnabled = computed(() => this.auth.hasFeature(FeatureKey.PG_ROOMS));
  /** Tiffin (meal) add-on is only offered when the tenant has the Tiffin feature enabled. */
  tiffinEnabled = computed(() => this.auth.hasFeature(FeatureKey.TIFFIN));

  genders = Object.values(Gender);
  statuses = Object.values(StudentStatus);
  shifts: Shift[] = [Shift.MORNING, Shift.AFTERNOON, Shift.EVENING, Shift.NIGHT, Shift.FULL_DAY];
  mealTypes: { value: TiffinMealType; label: string }[] = [
    { value: 'VEG', label: '🥗 Veg' },
    { value: 'NONVEG', label: '🍗 Non-veg' },
  ];
  mealPlans: { value: TiffinMealPlan; label: string }[] = [
    { value: 'LUNCH', label: 'Lunch' },
    { value: 'DINNER', label: 'Dinner' },
    { value: 'BOTH', label: 'Both' },
  ];

  branches = signal<Branch[]>([]);
  examTargets = signal<ExamTarget[]>([]);
  allSeats = signal<SeatWithAssignments[]>([]);
  allPgRooms = signal<PgRoom[]>([]);

  id = signal<string | null>(null);
  code = signal<string | null>(null);
  /** Status of the student loaded in edit mode — drives the draft-completion flow. */
  loadedStatus = signal<StudentStatus | null>(null);
  saving = signal(false);
  currentStep = signal(0);
  sameAddress = signal(false);

  accomType = signal<AccomType | null>(null);
  /** Tiffin is an independent add-on: it can be on with any accommodation, or stand alone. */
  tiffinActive = signal(false);
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

  /** True while completing a draft (PENDING) student in edit mode. */
  isDraftEdit = computed(() => !!this.id() && this.loadedStatus() === StudentStatus.PENDING);
  /** All steps are shown for both new registration and editing. */
  showFullFlow = computed(() => true);

  // Full multi-step flow in every mode. In edit, accommodation/payment are optional
  // (only used to ADD a new allocation/initial payment).
  steps = computed<StepDef[]>(() => {
    const accomHint = this.id()
      ? 'Optional — assign a cabin/PG only if not already allocated.'
      : 'Pick a library cabin and/or a PG room bed.';
    return [
      { key: 'personal',      label: 'Personal Info',     hint: 'Identity, KYC, family and address.',           icon: '👤' },
      { key: 'accommodation', label: 'Accommodation',     hint: accomHint,                                       icon: '🏠' },
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
    tiffin: this.fb.group({
      mealType: ['VEG' as TiffinMealType],
      mealPlan: ['BOTH' as TiffinMealPlan],
      joinDate: [this.todayIso()],
      dueDate: [this.nextMonthIso()],
      monthlyFee: [0],
      deliveryAssignee: [''],
      deliveryPhone: [''],
    }),
    payment: this.fb.group({
      cabinInitial: [0],
      pgInitial: [0],
      tiffinInitial: [0],
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
  get tiffinGroup()   { return this.form.get('tiffin') as FormGroup; }
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
  hasTiffin = computed(() => this.tiffinActive());

  // Plain methods (not computed) so the estimate strip and payment summary recompute
  // live on every change-detection pass as staff type into the fee / "payment now"
  // inputs — reactive-form values are not signals, so a computed() would stay stale.
  cabinFee(): number  { return this.feeOf('cabin'); }
  pgFee(): number     { return this.feeOf('pg'); }
  tiffinFee(): number { return this.feeOf('tiffin'); }
  totalMonthly(): number { return this.cabinFee() + this.pgFee() + this.tiffinFee(); }
  totalInitial(): number {
    return (this.hasCabin() ? this.paidNow('cabin') : 0)
         + (this.hasPg() ? this.paidNow('pg') : 0)
         + (this.hasTiffin() ? this.paidNow('tiffin') : 0);
  }

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

    // When the tenant has neither PG nor Tiffin, Cabin is the only option —
    // preselect it so registration flows straight through. With Tiffin (or PG)
    // available, leave the choice open so "Tiffin only" is reachable.
    if (!this.pgEnabled() && !this.tiffinEnabled()) this.setAccomType('CABIN_ONLY');

    const paramId = this.route.snapshot.paramMap.get('id');
    if (paramId && paramId !== 'new') {
      this.id.set(paramId);
      this.api.get(paramId).subscribe((s) => {
        this.code.set(s.code);
        this.loadedStatus.set(s.status as StudentStatus);
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
          aadhaarFrontUrl: (s as any).aadhaarFrontUrl ?? '',
          aadhaarBackUrl: (s as any).aadhaarBackUrl ?? '',
          voterIdUrl: (s as any).voterIdUrl ?? '',
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
  /** Card click: pick the type, or unpick it (so a student can take Tiffin only). */
  toggleAccomType(t: AccomType) {
    if (this.accomType() === t) this.accomType.set(null);
    else this.setAccomType(t);
  }
  /** Turn the Tiffin add-on on/off. */
  toggleTiffin() {
    this.tiffinActive.update((v) => !v);
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

  /** Mirror the typed tiffin monthly fee into the initial-payment field (manual, no rate card). */
  onTiffinFeeChange() {
    const fee = Number(this.tiffinGroup.value.monthlyFee || 0);
    this.paymentGroup.patchValue({ tiffinInitial: fee });
  }

  // ----- Part-payment helpers (plain methods so the balance updates live as staff type) -----
  feeOf(svc: 'cabin' | 'pg' | 'tiffin'): number {
    if (svc === 'cabin')  return this.hasCabin()  ? Number(this.cabinGroup.value.monthlyFee  || 0) : 0;
    if (svc === 'pg')     return this.hasPg()     ? Number(this.pgGroup.value.monthlyFee     || 0) : 0;
    return this.hasTiffin() ? Number(this.tiffinGroup.value.monthlyFee || 0) : 0;
  }
  paidNow(svc: 'cabin' | 'pg' | 'tiffin'): number {
    const v = this.paymentGroup.value as any;
    return Number((svc === 'cabin' ? v.cabinInitial : svc === 'pg' ? v.pgInitial : v.tiffinInitial) || 0);
  }
  balanceOf(svc: 'cabin' | 'pg' | 'tiffin'): number {
    return Math.max(0, this.feeOf(svc) - this.paidNow(svc));
  }
  /** Surplus paid over the fee for a service (advance/credit). */
  advanceOf(svc: 'cabin' | 'pg' | 'tiffin'): number {
    return Math.max(0, this.paidNow(svc) - this.feeOf(svc));
  }
  totalBalanceDue(): number {
    return this.balanceOf('cabin') + this.balanceOf('pg') + this.balanceOf('tiffin');
  }
  /** Net signed balance across services: >0 due, <0 advance. */
  netBalance(): number {
    return this.totalMonthly() - this.totalInitial();
  }
  /**
   * Opening account balance for the STUDENT — excludes tiffin, which tracks its own
   * paid/balance on the tiffin subscription. >0 due, <0 advance.
   */
  accountOpeningBalance(): number {
    const fee = this.cabinFee() + this.pgFee();
    const paid = (this.hasCabin() ? this.paidNow('cabin') : 0) + (this.hasPg() ? this.paidNow('pg') : 0);
    return Number((fee - paid).toFixed(2));
  }
  /** Quick "pay full" — set the service's initial payment to its monthly fee. */
  payFull(svc: 'cabin' | 'pg' | 'tiffin') {
    const fee = this.feeOf(svc);
    if (svc === 'cabin')  this.paymentGroup.patchValue({ cabinInitial: fee });
    else if (svc === 'pg') this.paymentGroup.patchValue({ pgInitial: fee });
    else this.paymentGroup.patchValue({ tiffinInitial: fee });
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
      // At least one service must be chosen — accommodation, tiffin, or both.
      if (!this.accomType() && !this.hasTiffin()) return false;
      if (this.hasCabin()) {
        const c = this.cabinGroup.value;
        if (!c.seatId || !c.shift || !c.joinDate || !c.dueDate || !c.monthlyFee) return false;
      }
      if (this.hasPg()) {
        const p = this.pgGroup.value;
        if (!p.roomId || !p.bedNumber || !p.joinDate || !p.dueDate || !p.monthlyFee) return false;
      }
      if (this.hasTiffin()) {
        const t = this.tiffinGroup.value;
        if (!t.mealType || !t.mealPlan || !t.joinDate || !t.dueDate || !t.monthlyFee) return false;
      }
      return true;
    }
    if (step === 2) {
      const p = this.paymentGroup.value;
      if (!p.paymentDate) return false;
      if (this.payMethod() !== 'CASH' && !p.transactionRef) return false;
      if (this.hasCabin() && p.cabinInitial == null) return false;
      if (this.hasPg() && p.pgInitial == null) return false;
      if (this.hasTiffin() && p.tiffinInitial == null) return false;
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

  // ===================== File upload & webcam =====================
  @ViewChild('webcamVideo') webcamVideo?: ElementRef<HTMLVideoElement>;
  webcamOpen = signal(false);
  uploadingField = signal<string | null>(null);
  private mediaStream: MediaStream | null = null;

  /** Current data-URL/URL value of a documents-group control (for template previews). */
  docValue(field: string): string {
    return (this.docsGroup.value as any)[field] || '';
  }

  /** Read a picked image file, downscale it, and store the result as a data URL. */
  onFilePick(ev: Event, field: string, maxDim = 1100) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.toast.error('Please choose an image file'); input.value = ''; return; }
    if (file.size > 10 * 1024 * 1024) { this.toast.error('Image too large (max 10MB)'); input.value = ''; return; }
    this.uploadingField.set(field);
    const reader = new FileReader();
    reader.onload = () => {
      this.downscale(reader.result as string, maxDim).then((url) => {
        this.docsGroup.patchValue({ [field]: url });
        this.uploadingField.set(null);
        input.value = '';
      });
    };
    reader.onerror = () => { this.toast.error('Could not read image'); this.uploadingField.set(null); input.value = ''; };
    reader.readAsDataURL(file);
  }

  clearImage(field: string) {
    this.docsGroup.patchValue({ [field]: '' });
  }

  /** Shrink an image data URL to maxDim on its longest edge and re-encode as JPEG. */
  private downscale(dataUrl: string, maxDim: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else if (height >= width && height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async openWebcam() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.toast.error('Camera not supported on this device/browser');
      return;
    }
    this.webcamOpen.set(true);
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      // Defer until the <video> is rendered by the open modal.
      setTimeout(() => {
        const v = this.webcamVideo?.nativeElement;
        if (v && this.mediaStream) { v.srcObject = this.mediaStream; v.play().catch(() => undefined); }
      }, 50);
    } catch {
      this.toast.error('Could not access the camera. Check browser permissions.');
      this.webcamOpen.set(false);
    }
  }

  capturePhoto() {
    const video = this.webcamVideo?.nativeElement;
    if (!video || !video.videoWidth) { this.toast.warning('Camera still starting — try again in a moment.'); return; }
    const maxDim = 640;
    let w = video.videoWidth, h = video.videoHeight;
    if (w > h && w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
    else if (h >= w && h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
    this.docsGroup.patchValue({ photoUrl: canvas.toDataURL('image/jpeg', 0.78) });
    this.closeWebcam();
    this.toast.success('Photo captured');
  }

  closeWebcam() {
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
    this.webcamOpen.set(false);
  }

  ngOnDestroy() {
    this.closeWebcam();
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
    if (this.id()) return this.completeDraft(asDraft);
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
      aadhaarFrontUrl: docs.aadhaarFrontUrl || undefined,
      aadhaarBackUrl: docs.aadhaarBackUrl || undefined,
      voterIdUrl: docs.voterIdUrl || undefined,
      status: asDraft ? StudentStatus.PENDING : undefined,
      // Signed opening balance for the student account (cabin + PG only; tiffin keeps
      // its own balance on the subscription). >0 due, <0 advance/credit.
      outstandingBalance: asDraft ? undefined : this.accountOpeningBalance(),
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
    if (this.hasTiffin()) {
      const t = this.tiffinGroup.value;
      accomTasks.push(
        this.tiffinApi.create({
          studentId: student.id,
          branchId: student.branchId,
          mealType: t.mealType as TiffinMealType,
          mealPlan: t.mealPlan as TiffinMealPlan,
          monthlyRate: Number(t.monthlyFee),
          startDate: t.joinDate!,
          nextDueDate: t.dueDate || undefined,
          deliveryAssignee: t.deliveryAssignee || undefined,
          deliveryPhone: t.deliveryPhone || undefined,
          initialPayment: this.paidNow('tiffin'),
        }).toPromise()
          .then(() => ({ kind: 'tiffin', ok: true }))
          .catch((e) => ({ kind: 'tiffin', ok: false, error: e?.error?.message ?? 'Could not create tiffin subscription' })),
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
            purpose: 'SEAT',
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
            purpose: 'PG',
            notes: note ? `[PG] ${note}` : '[PG initial payment]',
            nextDueDate: this.pgGroup.value.dueDate || undefined,
          }).toPromise()
            .then(() => ({ kind: 'pgPay', ok: true }))
            .catch((e) => ({ kind: 'pgPay', ok: false, error: e?.error?.message ?? 'Could not record PG payment' })),
        );
      }
      if (this.hasTiffin() && Number(pay.tiffinInitial) > 0) {
        payTasks.push(
          this.paymentsApi.recordManual({
            studentId: student.id,
            branchId: student.branchId,
            amount: Number(pay.tiffinInitial),
            method: payMethodMap[this.payMethod()],
            purpose: 'TIFFIN',
            notes: note ? `[Tiffin] ${note}` : '[Tiffin initial payment]',
            nextDueDate: this.tiffinGroup.value.dueDate || undefined,
          }).toPromise()
            .then(() => ({ kind: 'tiffinPay', ok: true }))
            .catch((e) => ({ kind: 'tiffinPay', ok: false, error: e?.error?.message ?? 'Could not record tiffin payment' })),
        );
      }
      const payDone = payTasks.length === 0 ? Promise.resolve([]) : Promise.all(payTasks);
      return payDone.then((paymentResults) => ({ student, accomResults, paymentResults }));
    });
  }

  /** Update flow (only personal info group is editable). */
  /**
   * Edit/complete a student across all steps: update personal info + documents
   * (+ status), and — unless saving as a draft — chain any newly-filled
   * accommodation/initial-payment. Existing allocations aren't touched.
   */
  private completeDraft(asDraft: boolean) {
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
      aadhaarFrontUrl: docs.aadhaarFrontUrl || undefined,
      aadhaarBackUrl: docs.aadhaarBackUrl || undefined,
      voterIdUrl: docs.voterIdUrl || undefined,
      status: asDraft ? StudentStatus.PENDING : (personal.status ?? StudentStatus.ACTIVE),
    };

    const update$ = this.api.update(this.id()!, payload);

    if (asDraft) {
      update$.subscribe({
        next: (s: any) => {
          this.toast.success(`Draft saved for ${s.fullName}`);
          this.router.navigate(['/students']);
        },
        error: (err) => {
          const msg = err.error?.message;
          this.toast.error(Array.isArray(msg) ? msg.join(' · ') : (msg ?? 'Save failed'));
          this.saving.set(false);
        },
      });
      return;
    }

    update$.pipe(switchMap((s: any) => this.chainAccommodationsAndPayments(s))).subscribe({
      next: (r: any) => {
        const errs = (r.accomResults ?? []).concat(r.paymentResults ?? []).filter((x: any) => x?.error);
        if (errs.length > 0) {
          this.toast.warning(`Saved ${r.student.fullName}, but: ${errs.map((e: any) => e.error).join(' · ')}`);
        } else {
          this.toast.success(`Saved changes to ${r.student.fullName} (${r.student.code})`);
        }
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
