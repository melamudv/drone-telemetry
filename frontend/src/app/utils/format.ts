export const ISRAEL_TZ = 'Asia/Jerusalem';

const israelFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: ISRAEL_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Wall-clock parts of an instant in Israel time (handles daylight saving). */
function israelParts(date: Date): Record<string, string> {
  return Object.fromEntries(israelFormat.formatToParts(date).map((p) => [p.type, p.value]));
}

/** 'DD/MM/YYYY HH:mm' in Israel time. */
export function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasZone ? value : `${value}Z`);
  if (isNaN(date.getTime())) return value;
  const p = israelParts(date);
  return `${p['day']}/${p['month']}/${p['year']} ${p['hour']}:${p['minute']}`;
}

/** Current Israel wall-clock time as 'YYYY-MM-DDTHH:mm'. */
export function nowInIsrael(now: Date = new Date()): string {
  const p = israelParts(now);
  return `${p['year']}-${p['month']}-${p['day']}T${p['hour']}:${p['minute']}`;
}

function israelOffsetMs(utcMs: number): number {
  const p = israelParts(new Date(utcMs));
  const asUtc = Date.UTC(+p['year'], +p['month'] - 1, +p['day'], +p['hour'], +p['minute'], +p['second']);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Converts an Israel wall-clock 'YYYY-MM-DDTHH:mm:ss' to a UTC ISO string ('...Z'). */
export function israelToUtcIso(local: string): string {
  const asUtc = Date.parse(`${local}Z`);
  const guess = asUtc - israelOffsetMs(asUtc);
  return new Date(asUtc - israelOffsetMs(guess)).toISOString().slice(0, 19) + 'Z';
}

/** Rounds to at most 3 decimals and drops trailing zeros (12.3456 -> 12.346, 45.0 -> 45). */
export function formatNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}
