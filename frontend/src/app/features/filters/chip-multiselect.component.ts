import { Component, computed, input, model } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';

/** Multi-select built from Material chips (selected values) and an autocomplete (remaining options). */
@Component({
  selector: 'app-chip-multiselect',
  imports: [ReactiveFormsModule, MatAutocompleteModule, MatChipsModule, MatFormFieldModule, MatIcon],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>{{ label() }}</mat-label>
      <mat-chip-grid #chipGrid [attr.aria-label]="label()">
        @for (value of selected(); track value) {
          <mat-chip-row (removed)="remove(value)">
            {{ display()(value) }}
            <button matChipRemove [attr.aria-label]="'Remove ' + display()(value)">
              <mat-icon>cancel</mat-icon>
            </button>
          </mat-chip-row>
        }
        <input
          class="chip-input"
          [placeholder]="placeholder()"
          [formControl]="search"
          [matChipInputFor]="chipGrid"
          [matAutocomplete]="auto"
        />
      </mat-chip-grid>
      <mat-autocomplete #auto="matAutocomplete" (optionSelected)="add($event.option.value)">
        @for (value of available(); track value) {
          <mat-option [value]="value">{{ display()(value) }}</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
    }

    mat-form-field {
      width: 100%;
    }

    .chip-input {
      /* Full-width item makes the input wrap onto its own row below the selected chips. */
      flex: 1 0 100%;
      min-width: 0;
    }
  `,
})
export class ChipMultiselectComponent {
  readonly label = input.required<string>();
  readonly options = input<string[]>([]);
  readonly placeholder = input('All');
  readonly display = input<(value: string) => string>((value) => value);
  readonly selected = model<string[]>([]);

  readonly search = new FormControl('', { nonNullable: true });
  private readonly searchValue = toSignal(this.search.valueChanges, { initialValue: '' });

  /** Options that are not selected yet and match the typed text. */
  readonly available = computed(() => {
    const query = String(this.searchValue() ?? '').toLowerCase();
    const selected = this.selected();
    return this.options().filter(
      (o) => !selected.includes(o) && this.display()(o).toLowerCase().includes(query),
    );
  });

  add(value: string): void {
    this.selected.update((values) => (values.includes(value) ? values : [...values, value]));
    this.search.setValue('');
  }

  remove(value: string): void {
    this.selected.update((values) => values.filter((v) => v !== value));
  }
}
