import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';

import { PipelineRun } from '../../models/pipeline-run.model';

@Component({
  selector: 'app-pipeline-panel',
  imports: [DatePipe],
  template: `
    <section class="panel">
      <h2>Data pipeline</h2>
      <button type="button" (click)="run.emit()" [disabled]="running()">
        {{ running() ? 'Running…' : '▶ Run Pipeline' }}
      </button>

      @if (running()) {
        <p class="note" role="status">⏳ Pipeline is running…</p>
      }
      @if (error(); as message) {
        <p class="error" role="alert">❌ {{ message }}</p>
      }
    </section>

    <section class="runs">
      <h2>Pipeline runs</h2>
      @if (runsError(); as message) {
        <p class="error" role="alert">❌ {{ message }}</p>
      } @else if (runs().length === 0) {
        <p class="note">No runs yet. Click "Run Pipeline".</p>
      } @else {
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Status</th>
              <th class="num">Valid</th>
              <th class="num">Invalid</th>
              <th class="num">Dup.</th>
            </tr>
          </thead>
          <tbody>
            @for (r of runs(); track r.id) {
              <tr [title]="r.error_message ?? ''">
                <td>{{ r.id }}</td>
                <td>{{ r.started_at | date: 'dd/MM/yyyy HH:mm:ss' : 'Asia/Jerusalem' }}</td>
                <td><span [class]="'badge ' + r.status">{{ r.status }}</span></td>
                <td class="num">{{ r.valid_records }}</td>
                <td class="num">{{ r.invalid_records }}</td>
                <td class="num">{{ r.duplicate_records }}</td>
              </tr>
              @if (r.error_message) {
                <tr class="err-row">
                  <td colspan="6">{{ r.error_message }}</td>
                </tr>
              }
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styleUrl: './pipeline-panel.component.css',
})
export class PipelinePanelComponent {
  readonly runs = input<PipelineRun[]>([]);
  readonly running = input(false);
  readonly error = input<string | null>(null);
  readonly runsError = input<string | null>(null);
  readonly run = output<void>();
}
