export type DroneStatus = 'active' | 'landed' | 'lost_signal';

export const DRONE_STATUSES: DroneStatus[] = ['active', 'landed', 'lost_signal'];

export interface Drone {
  id: number;
  drone_id: string;
  drone_type: string;
  operator_id: string;
  latitude: number;
  longitude: number;
  altitude_m: number;
  speed_kmh: number;
  battery_percent: number;
  timestamp: string;
  status: DroneStatus;
}

export interface DronePage {
  items: Drone[];
  total: number;
  page: number;
  page_size: number;
}

export interface DroneFilters {
  drone_type?: string[];
  status?: string[];
  operator_id?: string;
  min_battery?: number | null;
  max_battery?: number | null;
  from?: string;
  to?: string;
  latest_only?: boolean;
}

export interface AddDataResult {
  total: number;
  added: number;
  invalid: number;
  duplicates: number;
}

export interface Stats {
  total_records: number;
  total_drones: number;
  by_status: Partial<Record<string, number>>;
  low_battery_drones: number;
}
