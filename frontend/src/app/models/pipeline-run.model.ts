export type RunStatus = 'started' | 'completed' | 'failed';

export interface PipelineRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  total_records: number;
  valid_records: number;
  invalid_records: number;
  duplicate_records: number;
  error_message: string | null;
}
