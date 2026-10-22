import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  ViewEncapsulation,
  effect,
  input,
  output,
  untracked,
} from '@angular/core';
import * as L from 'leaflet';

import { Drone } from '../../models/drone.model';
import { formatTimestamp } from '../../utils/format';
import { isLowBattery, markerClasses, statusColor } from '../../utils/drone-utils';
import { formatNumber } from '../../utils/format';

const DEFAULT_CENTER: L.LatLngTuple = [31.8, 35.0];
const DEFAULT_ZOOM = 8;

const FIT_ALL_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

@Component({
  selector: 'app-drone-map',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div #mapEl class="map"></div>
    <div class="legend">
      <span><i class="swatch" style="background:#2e9e4f"></i>Active</span>
      <span><i class="swatch" style="background:#7a8594"></i>Landed</span>
      <span><i class="swatch" style="background:#d62828"></i>Lost signal</span>
      <span><i class="swatch ring"></i>Battery &lt; 20%</span>
    </div>
  `,
  styleUrl: './drone-map.component.css',
})
export class DroneMapComponent implements AfterViewInit, OnDestroy {
  readonly drones = input<Drone[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly path = input<Drone[]>([]);
  readonly droneSelected = output<Drone>();

  @ViewChild('mapEl', { static: true }) private mapEl!: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private markerLayer = L.layerGroup();
  private pathLayer = L.layerGroup();
  private markers: { marker: L.Marker; drone: Drone }[] = [];
  private fitAllEl?: HTMLElement;
  /** Automatic fit happens once. Later data refreshes keep the current zoom. */
  private fitted = false;
  private pathDroneId: string | null = null;

  constructor() {
    effect(() => this.renderMarkers(this.drones()));
    effect(() => this.renderPath(this.path()));
    effect(() => this.highlight(this.selectedId()));
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    this.map.attributionControl.setPrefix(false);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '',
    }).addTo(this.map);
    this.pathLayer.addTo(this.map);
    this.markerLayer.addTo(this.map);
    this.addFitAllControl();
    this.renderMarkers(this.drones());
    this.renderPath(this.path());
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  /** Zoom-control-style button that fits the view to all markers. Shown only for 2+ markers. */
  private addFitAllControl(): void {
    const control = new L.Control({ position: 'topleft' });
    control.onAdd = () => {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control fit-all-control hidden');
      const button = L.DomUtil.create('a', '', container);
      button.href = '#';
      button.title = 'Fit all drones';
      button.setAttribute('role', 'button');
      button.setAttribute('aria-label', 'Fit all drones');
      button.innerHTML = FIT_ALL_ICON;
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(button, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        this.fitAll();
      });
      this.fitAllEl = container;
      return container;
    };
    control.addTo(this.map!);
  }

  private fitAll(): void {
    if (!this.map || !this.markers.length) return;
    this.map.fitBounds(L.latLngBounds(this.markers.map(({ drone }) => [drone.latitude, drone.longitude])), {
      padding: [40, 40],
      maxZoom: 13,
    });
  }

  private renderMarkers(drones: Drone[]): void {
    if (!this.map) return;
    this.markerLayer.clearLayers();
    this.markers = drones.map((drone) => {
      const marker = L.marker([drone.latitude, drone.longitude], {
        icon: L.divIcon({
          className: '',
          html: `<span class="${markerClasses(drone).join(' ')}"></span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -10],
        }),
        title: drone.drone_id,
      });
      marker.bindPopup(() => buildPopup(drone));
      marker.on('click', () => this.droneSelected.emit(drone));
      marker.addTo(this.markerLayer);
      return { marker, drone };
    });
    this.fitAllEl?.classList.toggle('hidden', drones.length < 2);
    if (drones.length && !this.fitted) {
      this.fitAll();
      this.fitted = true;
    }
    // untracked: selection changes must not re-render markers (that would close the open popup).
    untracked(() => this.highlight(this.selectedId()));
  }

  private renderPath(points: Drone[]): void {
    if (!this.map) return;
    this.pathLayer.clearLayers();
    if (points.length < 2) {
      this.pathDroneId = null;
      return;
    }
    const latLngs = points.map((p) => [p.latitude, p.longitude] as L.LatLngTuple);
    const sameDrone = points[0].drone_id === this.pathDroneId;
    this.pathDroneId = points[0].drone_id;
    L.polyline(latLngs, { color: '#1d4ed8', weight: 3, opacity: 0.8, dashArray: '6 6' }).addTo(
      this.pathLayer,
    );
    for (const p of points) {
      L.circleMarker([p.latitude, p.longitude], {
        radius: 5,
        color: '#1d4ed8',
        fillColor: statusColor(p.status),
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(formatTimestamp(p.timestamp))
        .addTo(this.pathLayer);
    }
    if (!sameDrone) {
      this.map.fitBounds(L.latLngBounds(latLngs), { padding: [60, 60], maxZoom: 14 });
    }
  }

  private highlight(selected: string | null): void {
    for (const { marker, drone } of this.markers) {
      marker
        .getElement()
        ?.firstElementChild?.classList.toggle(
          'selected',
          selected !== null && drone.drone_id === selected,
        );
    }
  }
}

function buildPopup(drone: Drone): HTMLElement {
  const root = document.createElement('div');
  root.className = 'drone-popup';

  const title = document.createElement('h4');
  title.textContent = drone.drone_id;
  root.appendChild(title);

  const rows: [string, string][] = [
    ['Type', drone.drone_type],
    ['Operator', drone.operator_id],
    ['Altitude', `${formatNumber(drone.altitude_m)} m`],
    ['Speed', `${formatNumber(drone.speed_kmh)} km/h`],
    ['Battery', `${formatNumber(drone.battery_percent)}%${isLowBattery(drone) ? ' (low)' : ''}`],
    ['Status', drone.status.replace('_', ' ')],
    ['Updated', formatTimestamp(drone.timestamp)],
  ];
  const list = document.createElement('dl');
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  }
  root.appendChild(list);
  return root;
}
