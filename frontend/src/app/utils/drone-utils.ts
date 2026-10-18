import { Drone, DroneFilters } from '../models/drone.model';

export const LOW_BATTERY_THRESHOLD = 20;

export const STATUS_COLORS: Record<string, string> = {
  active: '#2e9e4f',
  landed: '#7a8594',
  lost_signal: '#d62828',
};

export function isLowBattery(drone: Pick<Drone, 'battery_percent'>): boolean {
  return drone.battery_percent < LOW_BATTERY_THRESHOLD;
}

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? '#7a8594';
}

/** CSS classes describing how a marker should look. */
export function markerClasses(drone: Pick<Drone, 'status' | 'battery_percent'>): string[] {
  const classes = ['drone-marker', `status-${drone.status}`];
  if (drone.status === 'lost_signal') classes.push('lost');
  if (isLowBattery(drone)) classes.push('low-battery');
  return classes;
}

/** Drops empty values so only active filters are sent to the API. */
export function cleanFilters(filters: DroneFilters): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      if (value.length) params[key] = value;
      continue;
    }
    if (value === null || value === undefined || value === '' || value === false) continue;
    params[key] = String(value);
  }
  return params;
}
