import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Drone, DroneFilters, DronePage, Stats } from '../models/drone.model';
import { cleanFilters } from '../utils/drone-utils';

export const MAP_PAGE_SIZE = 1000;

@Injectable({ providedIn: 'root' })
export class DroneService {
  private readonly http = inject(HttpClient);

  getDrones(filters: DroneFilters = {}): Observable<DronePage> {
    const params = new HttpParams({
      fromObject: { ...cleanFilters(filters), page_size: MAP_PAGE_SIZE },
    });
    return this.http.get<DronePage>('/api/drones', { params });
  }

  getPath(droneId: string): Observable<Drone[]> {
    return this.http.get<Drone[]>(`/api/drones/${encodeURIComponent(droneId)}/path`);
  }

  getDroneTypes(): Observable<string[]> {
    return this.http.get<string[]>('/api/drone-types');
  }

  getStats(): Observable<Stats> {
    return this.http.get<Stats>('/api/stats');
  }
}
