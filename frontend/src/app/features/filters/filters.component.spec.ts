import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DroneFilters } from '../../models/drone.model';
import { FiltersComponent } from './filters.component';

describe('FiltersComponent', () => {
  let fixture: ComponentFixture<FiltersComponent>;
  let component: FiltersComponent;
  let emitted: DroneFilters[];

  beforeEach(() => {
    fixture = TestBed.createComponent(FiltersComponent);
    component = fixture.componentInstance;
    emitted = [];
    component.filtersChange.subscribe((f) => emitted.push(f));
    fixture.detectChanges();
  });

  it('emits form values on apply, trimming the operator and nulling zero battery', () => {
    component.selectedStatuses.set(['active']);
    component.form.patchValue({ operator_id: ' OP-123 ' });
    component.apply();
    expect(emitted[0]).toEqual(
      jasmine.objectContaining({
        status: ['active'],
        operator_id: 'OP-123',
        min_battery: null,
        latest_only: true,
      }),
    );
  });

  it('emits several selected drone types and statuses', () => {
    component.selectedTypes.set(['VTOL', 'Quadcopter']);
    component.selectedStatuses.set(['active', 'lost_signal']);
    component.apply();
    expect(emitted[0].drone_type).toEqual(['VTOL', 'Quadcopter']);
    expect(emitted[0].status).toEqual(['active', 'lost_signal']);
  });

  it('offers the hard-coded statuses with readable labels', () => {
    expect(component.statuses).toEqual(['active', 'landed', 'lost_signal']);
    expect(component.statusLabel('lost_signal')).toBe('lost signal');
  });

  it('suggests operators matching the typed text', () => {
    fixture.componentRef.setInput('operators', ['OP-123', 'OP-456', 'OP-789']);
    expect(component.filteredOperators()).toEqual(['OP-123', 'OP-456', 'OP-789']);
    component.form.controls.operator_id.setValue('op-4');
    expect(component.filteredOperators()).toEqual(['OP-456']);
  });

  it('emits min_battery when set', () => {
    component.form.patchValue({ min_battery: 50 });
    component.apply();
    expect(emitted[0].min_battery).toBe(50);
  });

  it('does not emit when the date range is inverted', () => {
    component.form.patchValue({ from: new Date(2026, 5, 28, 12, 0), to: new Date(2026, 5, 28, 9, 30) });
    expect(component.form.hasError('dateRange')).toBeTrue();
    component.apply();
    expect(emitted.length).toBe(0);
  });

  it('emits date-time bounds in UTC, with the end of the "to" minute included', () => {
    component.form.patchValue({ from: new Date(2026, 5, 28, 10, 30), to: new Date(2026, 5, 28, 11, 45) });
    component.apply();
    expect(emitted[0].from).toBe('2026-06-28T07:30:00Z');
    expect(emitted[0].to).toBe('2026-06-28T08:45:59Z');
  });

  it('picking a "To" day selects its end, but keeps an explicitly chosen time', () => {
    component.form.controls.to.setValue(new Date(2026, 5, 28));
    component.endOfDay(component.form.controls.to.value);
    expect(component.form.controls.to.value).toEqual(new Date(2026, 5, 28, 23, 59));

    component.form.controls.to.setValue(new Date(2026, 5, 28, 9, 15));
    component.endOfDay(component.form.controls.to.value);
    expect(component.form.controls.to.value).toEqual(new Date(2026, 5, 28, 9, 15));
  });

  it('rejects times in the future but allows today', () => {
    component.form.patchValue({ from: new Date(component.maxDate) });
    expect(component.form.hasError('future')).toBeFalse();

    component.form.patchValue({ from: null, to: new Date(2999, 0, 1) });
    expect(component.form.hasError('future')).toBeTrue();
    component.apply();
    expect(emitted.length).toBe(0);
  });

  it('disables Apply until something changes, and again after applying', () => {
    expect(component.changed()).toBeFalse();
    component.form.patchValue({ operator_id: 'OP-1' });
    expect(component.changed()).toBeTrue();
    component.apply();
    expect(component.changed()).toBeFalse();
    component.apply();
    expect(emitted.length).toBe(1);
    component.selectedStatuses.set(['landed']);
    expect(component.changed()).toBeTrue();
    component.selectedStatuses.set([]);
    expect(component.changed()).toBeFalse();
  });

  it('reset restores defaults and emits', () => {
    component.selectedTypes.set(['VTOL']);
    component.selectedStatuses.set(['landed']);
    component.form.patchValue({ operator_id: 'X' });
    component.reset();
    expect(emitted.length).toBe(1);
    expect(emitted[0]).toEqual(
      jasmine.objectContaining({ drone_type: [], status: [], operator_id: '', latest_only: true }),
    );
  });
});
