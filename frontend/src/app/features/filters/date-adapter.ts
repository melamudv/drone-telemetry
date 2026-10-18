import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';

/** Native adapter that also understands typed dd/MM/yyyy (and dd.MM.yyyy) dates. */
@Injectable()
export class IsraeliDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(value.trim());
    if (!match) return this.invalid();
    const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(year, month - 1, day);
    return date.getMonth() === month - 1 && date.getDate() === day ? date : this.invalid();
  }
}
