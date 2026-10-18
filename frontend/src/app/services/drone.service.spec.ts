import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DroneService } from './drone.service';

describe('DroneService', () => {
  let service: DroneService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DroneService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only non-empty filters as query params', () => {
    service
      .getDrones({
        status: ['active', 'landed'],
        drone_type: ['VTOL', 'Quadcopter'],
        min_battery: 50,
        from: '2026-06-01',
        to: '2026-06-28',
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === '/api/drones');
    expect(req.request.params.getAll('drone_type')).toEqual(['VTOL', 'Quadcopter']);
    expect(req.request.params.getAll('status')).toEqual(['active', 'landed']);
    expect(req.request.params.get('min_battery')).toBe('50');
    expect(req.request.params.get('from')).toBe('2026-06-01');
    expect(req.request.params.get('to')).toBe('2026-06-28');
    req.flush({ items: [], total: 0, page: 1, page_size: 1000 });
  });

  it('omits empty filters', () => {
    service.getDrones({ status: [], drone_type: [] }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/drones');
    expect(req.request.params.has('drone_type')).toBeFalse();
    expect(req.request.params.has('status')).toBeFalse();
    req.flush({ items: [], total: 0, page: 1, page_size: 1000 });
  });

  it('requests the path of a drone with an encoded id', () => {
    service.getPath('DRONE 001').subscribe();
    const req = http.expectOne('/api/drones/DRONE%20001/path');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
