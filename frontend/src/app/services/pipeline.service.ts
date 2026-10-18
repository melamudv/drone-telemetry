import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, map, switchMap, take, tap, throwError, timeout, timer } from 'rxjs';

import { PipelineRun } from '../models/pipeline-run.model';

export const POLL_INTERVAL_MS = 700;
export const POLL_TIMEOUT_MS = 60_000;
export const RUNS_LIMIT = 10;

@Injectable({ providedIn: 'root' })
export class PipelineService {
  private readonly http = inject(HttpClient);

  getRuns(limit = RUNS_LIMIT): Observable<PipelineRun[]> {
    return this.http.get<PipelineRun[]>('/api/pipeline/runs', {
      params: new HttpParams().set('limit', limit),
    });
  }

  /** Triggers a run (executes in the background on the server). */
  start(): Observable<PipelineRun> {
    return this.http.post<PipelineRun>('/api/pipeline/run', {});
  }

  /** Triggers a run and emits once, when that run is no longer 'started'. */
  runAndWait(onPoll?: (runs: PipelineRun[]) => void): Observable<PipelineRun> {
    return this.start().pipe(
      switchMap((run) =>
        timer(0, POLL_INTERVAL_MS).pipe(
          switchMap(() => this.getRuns()),
          tap((runs) => onPoll?.(runs)),
          map((runs) => runs.find((r) => r.id === run.id)),
          filter((r): r is PipelineRun => !!r && r.status !== 'started'),
          take(1),
          timeout({
            first: POLL_TIMEOUT_MS,
            with: () => throwError(() => new Error('Pipeline run timed out')),
          }),
        ),
      ),
    );
  }
}
