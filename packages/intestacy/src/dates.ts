import type { ISODate } from './types.js';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when `value` is a real calendar date in `YYYY-MM-DD` form. */
export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Days since the Unix epoch for an ISO date (UTC, no time zone drift). */
export function toDayNumber(value: ISODate): number {
  if (!isISODate(value)) throw new RangeError(`Invalid ISO date: ${value}`);
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function compareDates(a: ISODate, b: ISODate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** `"March 4, 1961"` style rendering used in explanations. */
export function formatDate(value: ISODate | undefined): string {
  if (!value || !isISODate(value)) return 'an unknown date';
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

export function yearOf(value: ISODate | undefined): number | undefined {
  return value && isISODate(value) ? Number(value.slice(0, 4)) : undefined;
}
