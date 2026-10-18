import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { Drone } from '../../models/drone.model';
import { PipelineRun } from '../../models/pipeline-run.model';
import { DroneService } from '../../services/drone.service';
import { PipelineService } from '../../services/pipeline.service';
import { DroneMapComponent } from '../map/drone-map.component';
import { DashboardComponent, errorMessage } from './dashboard.component';
import { HttpErrorResponse } from '@angular/common/http';

@Component({ selector: 'app-drone-map', template: '' })
class StubMapComponent {
  readonly drones = input<Drone[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly path = input<Drone[]>([]);
  readonly droneSelected = output<Drone>();
}

const drone = (over: Partial<Drone> = {}): Drone => ({
  id: 1,
  drone_id: 'DRONE-001',
  drone_type: 'Quadcopter',
  operator_id: 'OP-123',
  latitude: 32.08,
  longitude: 34.78,
  altitude_m: 120,
  speed_kmh: 45,
  battery_percent: 76,
  timestamp: '2026-06-28T10:30:00Z',
  status: 'active',
  ...over,
});

const completedRun: PipelineRun = {
  id: 1,
  started_at: '2026-06-28T10:00:00Z',
  finished_at: '2026-06-28T10:00:01Z',
  status: 'completed',
  total_records: 4,
  valid_records: 3,
  invalid_records: 1,
  duplicate_records: 0,
  error_message: null,
};

describe('DashboardComponent', () => {
  let droneService: jasmine.SpyObj<DroneService>;
  let pipelineService: jasmine.SpyObj<PipelineService>;

  function create() {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    droneService = jasmine.createSpyObj('DroneService', ['getDrones', 'getPath', 'getDroneTypes', 'getStats']);
    pipelineService = jasmine.createSpyObj('PipelineService', ['getRuns', 'runAndWait']);
    droneService.getDrones.and.returnValue(of({ items: [drone()], total: 1, page: 1, page_size: 1000 }));
    droneService.getDroneTypes.and.returnValue(of(['Quadcopter']));
    droneService.getStats.and.returnValue(
      of({ total_records: 1, total_drones: 1, by_status: { active: 1 }, low_battery_drones: 0 }),
    );
    pipelineService.getRuns.and.returnValue(of([completedRun]));

    TestBed.configureTestingModule({
      providers: [
        { provide: DroneService, useValue: droneService },
        { provide: PipelineService, useValue: pipelineService },
      ],
    })
      .overrideComponent(DashboardComponent, {
        remove: { imports: [DroneMapComponent] },
        add: { imports: [StubMapComponent] },
      });
  });

  it('loads drones, runs and metadata on init', () => {
    const c = create().componentInstance;
    expect(c.drones().length).toBe(1);
    expect(c.runs().length).toBe(1);
    expect(c.droneTypes()).toEqual(['Quadcopter']);
    expect(c.loading()).toBeFalse();
  });

  it('shows an error and keeps the app usable when loading fails', () => {
    droneService.getDrones.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 0 })),
    );
    const fixture = create();
    expect(fixture.componentInstance.loadError()).toContain('Cannot reach the server');
    expect(fixture.nativeElement.textContent).toContain('Retry');
  });

  it('shows the empty state when nothing matches', () => {
    droneService.getDrones.and.returnValue(of({ items: [], total: 0, page: 1, page_size: 1000 }));
    expect(create().nativeElement.textContent).toContain('No drones match');
  });

  it('keeps operators from earlier loads when a filter narrows the result', () => {
    droneService.getDrones.and.returnValue(
      of({
        items: [drone(), drone({ id: 2, drone_id: 'DRONE-002', operator_id: 'OP-456' }), drone({ id: 3 })],
        total: 3,
        page: 1,
        page_size: 1000,
      }),
    );
    const c = create().componentInstance;
    expect(c.operators()).toEqual(['OP-123', 'OP-456']);

    droneService.getDrones.and.returnValue(
      of({ items: [drone({ operator_id: 'OP-789' })], total: 1, page: 1, page_size: 1000 }),
    );
    c.onFilters({ status: ['landed'], latest_only: true });
    expect(c.operators()).toEqual(['OP-123', 'OP-456', 'OP-789']);
  });

  it('re-queries with the new filters', () => {
    const c = create().componentInstance;
    c.onFilters({ status: ['lost_signal'], latest_only: true });
    expect(droneService.getDrones).toHaveBeenCalledWith({ status: ['lost_signal'], latest_only: true });
  });

  it('runPipeline refreshes drones and runs afterwards', () => {
    pipelineService.runAndWait.and.returnValue(of(completedRun));
    const c = create().componentInstance;
    droneService.getDrones.calls.reset();
    pipelineService.getRuns.calls.reset();

    c.runPipeline();

    expect(pipelineService.runAndWait).toHaveBeenCalled();
    expect(droneService.getDrones).toHaveBeenCalledTimes(1);
    expect(pipelineService.getRuns).not.toHaveBeenCalled();
    expect(c.pipelineRunning()).toBeFalse();
    expect(c.pipelineError()).toBeNull();
  });

  it('runPipeline puts polled runs into the table', () => {
    pipelineService.runAndWait.and.callFake((onPoll) => {
      onPoll?.([completedRun, { ...completedRun, id: 99 }]);
      return of(completedRun);
    });
    const c = create().componentInstance;
    c.runPipeline();
    expect(c.runs().length).toBe(2);
  });

  it('runPipeline reloads runs when polling fails', () => {
    pipelineService.runAndWait.and.returnValue(throwError(() => new Error('timeout')));
    const c = create().componentInstance;
    pipelineService.getRuns.calls.reset();
    c.runPipeline();
    expect(pipelineService.getRuns).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed run message', () => {
    pipelineService.runAndWait.and.returnValue(
      of({ ...completedRun, status: 'failed', error_message: 'FileNotFoundError: x' }),
    );
    const c = create().componentInstance;
    c.runPipeline();
    expect(c.pipelineError()).toBe('FileNotFoundError: x');
  });

  it('surfaces a request error (e.g. 409) when triggering', () => {
    pipelineService.runAndWait.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'A pipeline run is already in progress' } })),
    );
    const c = create().componentInstance;
    c.runPipeline();
    expect(c.pipelineError()).toBe('A pipeline run is already in progress');
    expect(c.pipelineRunning()).toBeFalse();
  });

  it('loads a path on selection and clears it when selected again', () => {
    const points = [drone(), drone({ id: 2, latitude: 32.1 })];
    droneService.getPath.and.returnValue(of(points));
    const c = create().componentInstance;

    c.onDroneSelected(drone());
    expect(c.selectedId()).toBe('DRONE-001');
    expect(c.path()).toEqual(points);

    c.onDroneSelected(drone());
    expect(c.selectedId()).toBeNull();
    expect(c.path()).toEqual([]);
  });
});

describe('errorMessage', () => {
  it('prefers the API detail', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 422, error: { detail: 'bad' } }))).toBe('bad');
  });
  it('falls back to status code', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 500 }))).toBe('Server error (500)');
  });
});
