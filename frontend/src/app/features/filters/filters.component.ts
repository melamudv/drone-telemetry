import { Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DATE_FORMATS, MAT_DATE_LOCALE, DateAdapter, MAT_NATIVE_DATE_FORMATS } from '@angular/material/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';

import { DRONE_STATUSES, DroneFilters } from '../../models/drone.model';
import { ChipMultiselectComponent } from './chip-multiselect.component';
import { israelToUtcIso, nowInIsrael } from '../../utils/format';
import { CustomDateAdapter } from './date-adapter';

const pad = (n: number) => String(n).padStart(2, '0');

/** Wall-clock value picked in the date + time pickers as 'YYYY-MM-DDTHH:mm' (Israel time). */
function localKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Converts the picked Israel wall-clock time to a UTC value for the API ("to" includes its whole minute). */
function toBound(date: Date | null, end: boolean): string {
  if (!date) return '';
  return israelToUtcIso(`${localKey(date)}:${end ? '59' : '00'}`);
}

@Component({
  selector: 'app-filters',
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIcon,
    MatInputModule,
    MatTimepickerModule,
    ChipMultiselectComponent,
  ],
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'en-GB' },
    { provide: DateAdapter, useClass: CustomDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MAT_NATIVE_DATE_FORMATS },
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="apply()" class="filters">
      <h2>Filters</h2>

      <app-chip-multiselect
        label="Drone types"
        placeholder="All types"
        [options]="droneTypes()"
        [(selected)]="selectedTypes"
      />

      <app-chip-multiselect
        label="Status"
        placeholder="All statuses"
        [options]="statuses"
        [display]="statusLabel"
        [(selected)]="selectedStatuses"
      />
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Operator ID</mat-label>
        <input
          matInput
          formControlName="operator_id"
          placeholder="e.g. OP-123"
          [matAutocomplete]="operatorAuto"
        />
        @if (form.controls.operator_id.value) {
          <button
            matSuffix
            mat-icon-button
            type="button"
            aria-label="Clear operator"
            (click)="form.controls.operator_id.setValue('')"
          >
            <mat-icon>cancel</mat-icon>
          </button>
        }
        <mat-autocomplete #operatorAuto="matAutocomplete">
          @for (op of filteredOperators(); track op) {
            <mat-option [value]="op">{{ op }}</mat-option>
          }
        </mat-autocomplete>
      </mat-form-field>

      <label>
        Min battery: <strong>{{ form.controls.min_battery.value }}%</strong>
        <input type="range" min="0" max="100" step="5" formControlName="min_battery" />
      </label>

      <div class="period">
        <div class="when">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="date-field">
            <mat-label>From</mat-label>
            <input matInput [matDatepicker]="fromPicker" [max]="maxDate" formControlName="from" placeholder="dd/mm/yyyy" />
            <mat-datepicker-toggle matIconSuffix [for]="fromPicker" />
            <mat-datepicker #fromPicker />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="time-field">
            <mat-label>Time</mat-label>
            <input matInput [matTimepicker]="fromTime" formControlName="from" placeholder="HH:mm" />
            <mat-timepicker-toggle matIconSuffix [for]="fromTime" />
            <mat-timepicker #fromTime interval="30min" />
          </mat-form-field>
        </div>
        <div class="when">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="date-field">
            <mat-label>To</mat-label>
            <input
              matInput
              [matDatepicker]="toPicker"
              [max]="maxDate"
              formControlName="to"
              placeholder="dd/mm/yyyy"
              (dateChange)="endOfDay($event.value)"
            />
            <mat-datepicker-toggle matIconSuffix [for]="toPicker" />
            <mat-datepicker #toPicker />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="time-field">
            <mat-label>Time</mat-label>
            <input matInput [matTimepicker]="toTime" formControlName="to" placeholder="HH:mm" />
            <mat-timepicker-toggle matIconSuffix [for]="toTime" />
            <mat-timepicker #toTime interval="30min" />
          </mat-form-field>
        </div>
        <p class="hint">Times are Israel time (24-hour).</p>
      </div>
      @if (form.hasError('dateRange')) {
        <p class="field-error">"From" must not be after "To".</p>
      }
      @if (form.hasError('future')) {
        <p class="field-error">Dates in the future are not allowed.</p>
      }

      <label class="check">
        <input type="checkbox" formControlName="latest_only" />
        Latest position per drone
      </label>

      <div class="actions">
        <button type="submit" [disabled]="form.invalid || loading() || !changed()">Apply</button>
        <button type="button" class="secondary" (click)="reset()" [disabled]="loading()">Reset</button>
      </div>
    </form>
  `,
  styleUrl: './filters.component.css',
})
export class FiltersComponent {
  readonly droneTypes = input<string[]>([]);
  readonly operators = input<string[]>([]);
  readonly loading = input(false);
  readonly filtersChange = output<DroneFilters>();

  readonly statuses: string[] = DRONE_STATUSES;
  readonly statusLabel = (status: string) => status.replace('_', ' ');

  readonly selectedTypes = signal<string[]>([]);
  readonly selectedStatuses = signal<string[]>([]);

  private readonly fb = inject(FormBuilder).nonNullable;

  readonly form = this.fb.group(
    {
      operator_id: [''],
      min_battery: [0],
      from: [null as Date | null],
      to: [null as Date | null],
      latest_only: [true],
    },
    {
      validators: (group) => {
        const { from, to } = group.getRawValue();
        const start = from ? localKey(from) : '';
        const end = to ? localKey(to) : '';
        if (start && end && start > end) return { dateRange: true };
        const now = this.maxNow();
        return start > now || end > now ? { future: true } : null;
      },
    },
  );

  /** Picking a day for "To" selects its end (23:59); a time chosen afterwards is kept as is. */
  endOfDay(date: Date | null): void {
    if (!date || date.getHours() || date.getMinutes()) return;
    this.form.controls.to.setValue(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59));
  }

  /** Current Israel time as 'YYYY-MM-DDTHH:mm'. */
  maxNow(): string {
    return nowInIsrael();
  }

  /** Latest selectable day: today in Israel, as a local-midnight Date for the datepicker. */
  readonly maxDate = (() => {
    const [y, m, d] = nowInIsrael().slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  })();

  private readonly operatorQuery = toSignal(this.form.controls.operator_id.valueChanges, {
    initialValue: '',
  });

  /** Known operators matching the typed text; free text is still accepted as a filter. */
  readonly filteredOperators = computed(() => {
    const query = (this.operatorQuery() ?? '').trim().toLowerCase();
    return this.operators().filter((op) => op.toLowerCase().includes(query));
  });

  /** Filters currently entered in the form. */
  private currentFilters(): DroneFilters {
    const v = this.form.getRawValue();
    return {
      drone_type: this.selectedTypes(),
      status: this.selectedStatuses(),
      operator_id: v.operator_id.trim(),
      min_battery: v.min_battery > 0 ? v.min_battery : null,
      from: toBound(v.from, false),
      to: toBound(v.to, true),
      latest_only: v.latest_only,
    };
  }

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  private readonly applied = signal(JSON.stringify(this.currentFilters()));

  /** True when the form differs from the last applied filters. */
  readonly changed = computed(() => {
    this.formValue();
    return JSON.stringify(this.currentFilters()) !== this.applied();
  });

  apply(): void {
    if (this.form.invalid || !this.changed()) return;
    const filters = this.currentFilters();
    this.applied.set(JSON.stringify(filters));
    this.filtersChange.emit(filters);
  }

  reset(): void {
    this.form.reset();
    this.selectedTypes.set([]);
    this.selectedStatuses.set([]);
    this.applied.set('');
    this.apply();
  }
}
