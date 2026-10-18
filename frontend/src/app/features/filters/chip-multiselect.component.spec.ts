import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChipMultiselectComponent } from './chip-multiselect.component';

describe('ChipMultiselectComponent', () => {
  let fixture: ComponentFixture<ChipMultiselectComponent>;
  let component: ChipMultiselectComponent;

  beforeEach(() => {
    fixture = TestBed.createComponent(ChipMultiselectComponent);
    fixture.componentRef.setInput('label', 'Drone types');
    fixture.componentRef.setInput('options', ['Quadcopter', 'VTOL', 'Fixed Wing']);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('adds options without duplicates, preserving order', () => {
    component.add('VTOL');
    component.add('Quadcopter');
    component.add('VTOL');
    expect(component.selected()).toEqual(['VTOL', 'Quadcopter']);
  });

  it('removes a selected option', () => {
    component.add('VTOL');
    component.add('Quadcopter');
    component.remove('VTOL');
    expect(component.selected()).toEqual(['Quadcopter']);
  });

  it('offers only unselected options matching the typed text', () => {
    component.add('VTOL');
    expect(component.available()).toEqual(['Quadcopter', 'Fixed Wing']);
    component.search.setValue('fix');
    expect(component.available()).toEqual(['Fixed Wing']);
  });

  it('matches typed text against the display label', () => {
    fixture.componentRef.setInput('options', ['active', 'lost_signal']);
    fixture.componentRef.setInput('display', (v: string) => v.replace('_', ' '));
    component.search.setValue('lost sig');
    expect(component.available()).toEqual(['lost_signal']);
  });
});
