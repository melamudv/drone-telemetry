import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';

import { Drone, DroneFilters, Stats } from '../../models/drone.model';
import { PipelineRun } from '../../models/pipeline-run.model';
import { DroneService } from '../../services/drone.service';
import { PipelineService } from '../../services/pipeline.service';
import { FiltersComponent } from '../filters/filters.component';
import { DroneMapComponent } from '../map/drone-map.component';
import { PipelinePanelComponent } from '../pipeline-panel/pipeline-panel.component';

export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server. Is the backend running?';
    const detail = err.error?.detail;
    if (typeof detail === 'string') return detail;
    return `Server error (${err.status})`;
  }
  return err instanceof Error ? err.message : 'Unexpected error';
}

@Component({
  selector: 'app-dashboard',
  imports: [DroneMapComponent, FiltersComponent, PipelinePanelComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  private readonly droneService = inject(DroneService);
  private readonly pipelineService = inject(PipelineService);
  private readonly destroyRef = inject(DestroyRef);

  readonly drones = signal<Drone[]>([]);
  readonly total = signal(0);
  readonly droneTypes = signal<string[]>([]);
  /**
   * Operator IDs seen in any loaded page, for the operator autocomplete. Accumulated rather than
   * derived from the current (possibly filtered) result, so filtering does not shrink the options.
   */
  readonly operators = signal<string[]>([]);
  readonly stats = signal<Stats | null>(null);
  readonly runs = signal<PipelineRun[]>([]);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly runsError = signal<string | null>(null);
  readonly pipelineRunning = signal(false);
  readonly pipelineError = signal<string | null>(null);

  readonly selectedId = signal<string | null>(null);
  readonly path = signal<Drone[]>([]);
  readonly pathError = signal<string | null>(null);

  readonly truncated = computed(() => this.total() > this.drones().length);

  private filters: DroneFilters = { latest_only: true };

  ngOnInit(): void {
    this.loadDrones();
    this.loadRuns(true);
    this.loadMeta();
  }

  onFilters(filters: DroneFilters): void {
    this.filters = filters;
    this.clearSelection();
    this.loadDrones();
  }

  loadDrones(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.droneService
      .getDrones(this.filters)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.drones.set(page.items);
          this.total.set(page.total);
          this.rememberOperators(page.items);
        },
        error: (err) => this.loadError.set(errorMessage(err)),
      });
  }

  private rememberOperators(items: Drone[]): void {
    const known = new Set(this.operators());
    items.forEach((d) => known.add(d.operator_id));
    if (known.size !== this.operators().length) this.operators.set([...known].sort());
  }

  /** `autoStart`: on first load with no runs at all, start the initial pipeline run automatically. */
  loadRuns(autoStart = false): void {
    this.pipelineService
      .getRuns()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (runs) => {
          this.runs.set(runs);
          this.runsError.set(null);
          if (autoStart && !runs.length && !this.pipelineRunning()) this.runPipeline();
        },
        error: (err) => this.runsError.set(errorMessage(err)),
      });
  }

  private loadMeta(): void {
    this.droneService
      .getDroneTypes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (types) => this.droneTypes.set(types), error: () => undefined });
    this.droneService
      .getStats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (stats) => this.stats.set(stats), error: () => undefined });
  }

  runPipeline(): void {
    this.pipelineRunning.set(true);
    this.pipelineError.set(null);
    this.pipelineService
      .runAndWait((runs) => {
        this.runs.set(runs);
        this.runsError.set(null);
      })
      .pipe(
        finalize(() => {
          this.pipelineRunning.set(false);
          this.loadDrones();
          this.loadMeta();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (run) => {
          if (run.status === 'failed') {
            this.pipelineError.set(run.error_message ?? 'Pipeline run failed');
          }
        },
        error: (err) => {
          this.pipelineError.set(errorMessage(err));
          this.loadRuns();
        },
      });
  }

  onDroneSelected(drone: Drone): void {
    if (this.selectedId() === drone.drone_id) {
      this.clearSelection();
      return;
    }
    this.selectedId.set(drone.drone_id);
    this.path.set([]);
    this.pathError.set(null);
    this.droneService
      .getPath(drone.drone_id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (points) => {
          if (this.selectedId() === drone.drone_id) this.path.set(points);
        },
        error: (err) => this.pathError.set(errorMessage(err)),
      });
  }

  clearSelection(): void {
    this.selectedId.set(null);
    this.path.set([]);
    this.pathError.set(null);
  }

}
