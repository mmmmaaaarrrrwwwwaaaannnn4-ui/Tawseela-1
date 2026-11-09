import { restaurantDate } from '@fig/shared';

export interface DayOption {
  wd: string;
  dn: string;
  mo: string;
  label: string;
  long: string;
}

/** The next 14 days starting tonight, labelled like the reservation picker in the design. */
export function nextDays(count = 14, from: Date = new Date()): DayOption[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return {
      wd: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-US', { weekday: 'short' }),
      dn: String(d.getDate()),
      mo: d.toLocaleDateString('en-US', { month: 'short' }),
      label: i === 0 ? 'Tonight' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      long: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    };
  });
}

export const DAYS14 = nextDays(14);

/** Short date for new journal posts, e.g. "Nov 4". */
export const shortToday = (): string => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Seconds left until local midnight (Deal of the day countdown). */
export function secondsToMidnight(now = Date.now()): number {
  const d = new Date(now);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return Math.max(0, Math.floor((end.getTime() - d.getTime()) / 1000));
}

/** Days from today (in the restaurant's time zone) to a YYYY-MM-DD date: 0 tonight, 1 tomorrow, −1 yesterday. */
export function dayOffset(date: string, now = Date.now()): number {
  const today = restaurantDate(now);
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** A booking's day the way the picker labels it ("Tonight", "Fri, Nov 7"); `long` for the ticket. */
export function dayLabel(date: string, long = false): string {
  const opt = DAYS14[dayOffset(date)];
  if (opt) return long ? opt.long : opt.label;
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString(
    'en-US',
    long ? { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' } : { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' },
  );
}
