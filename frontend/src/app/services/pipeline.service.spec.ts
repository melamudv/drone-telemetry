import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';

import { PipelineRun } from '../models/pipeline-run.model';
import { POLL_INTERVAL_MS, PipelineService } from './pipeline.service';

function run(overrides: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id: 1,
    started_at: '2026-06-28T10:00:00Z',
    finished_at: null,
    status: 'started',
    total_records: 0,
    valid_records: 0,
    invalid_records: 0,
    duplicate_records: 0,
    error_message: null,
    ...overrides,
  };
}

describe('PipelineService', () => {
  let service: PipelineService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PipelineService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POSTs to start a run', () => {
    service.start().subscribe();
    const req = http.expectOne('/api/pipeline/run');
    expect(req.request.method).toBe('POST');
    req.flush(run());
  });

  it('runAndWait polls until the run is no longer started', fakeAsync(() => {
    let result: PipelineRun | undefined;
    service.runAndWait().subscribe((r) => (result = r));

    http.expectOne('/api/pipeline/run').flush(run());
    tick(0);
    http.expectOne((r) => r.url === '/api/pipeline/runs').flush([run()]);
    expect(result).toBeUndefined();

    tick(POLL_INTERVAL_MS);
    http
      .expectOne((r) => r.url === '/api/pipeline/runs')
      .flush([run({ status: 'completed', valid_records: 3, invalid_records: 1 })]);

    expect(result?.status).toBe('completed');
    expect(result?.valid_records).toBe(3);
    discardPeriodicTasks();
  }));

  it('runAndWait propagates a 409 from the server', () => {
    let status = 0;
    service.runAndWait().subscribe({ error: (e) => (status = e.status) });
    http
      .expectOne('/api/pipeline/run')
      .flush({ detail: 'busy' }, { status: 409, statusText: 'Conflict' });
    expect(status).toBe(409);
  });
});
