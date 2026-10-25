// Dates, times, durations and plurals, written the way the interface shows them, in the app's language (words.ts).
//
// From Galen's ui/src/lib/format.ts, with asDate (a plain "YYYY-MM-DD" read as local noon, not UTC midnight, which
// west of Greenwich is the day before: Aristotle's copy had that defect). The words come from words.ts, so Argus's
// "Hoje" is the same function as Galen's "Today".

import { words } from './words.ts';

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = words.locale + JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(words.locale, options);
    cache.set(key, f);
  }
  return f;
}

/** "Today", "Yesterday", "Sun 4 Oct", or "4 Oct 2025" for other years. */
export function formatDay(iso: string): string {
  const d = asDate(iso);
  const days = daysAgo(iso);
  if (days === 0) return words.today;
  if (days === 1) return words.yesterday;
  return d.getFullYear() === new Date().getFullYear()
    ? fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(d)
    : fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/** "14:05". */
export function formatTime(iso: string | number | Date): string {
  return fmt({ hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** "14:05:09". */
export function formatClock(iso: string | number | Date): string {
  return fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
}

/** "today", "yesterday", "3 days ago", "5 weeks ago". */
export function ago(iso: string): string {
  const days = daysAgo(iso);
  if (days <= 0) return words.today.toLowerCase();
  if (days === 1) return words.yesterday.toLowerCase();
  if (days < 14) return words.daysAgo(days);
  if (days < 60) return words.weeksAgo(Math.round(days / 7));
  return words.monthsAgo(Math.round(days / 30));
}

/** "under a minute", "25 min", "1 h 10 min". */
export function duration(fromIso: string | number, toIso: string | number): string {
  const ms = (typeof toIso === 'number' ? toIso : Date.parse(toIso)) - (typeof fromIso === 'number' ? fromIso : Date.parse(fromIso));
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return words.underAMinute;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

/** "1 day", "3 days"; irregular plurals are passed in. */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

/** A number as this language writes it ("1 234,5" in Portuguese). */
export function number(n: number, digits = 0): string {
  return n.toLocaleString(words.locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** A local date as YYYY-MM-DD, the form servers key days and weeks by. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** An ISO timestamp, or a plain "YYYY-MM-DD" read as local noon (not UTC midnight, which is the day before west of it). */
export function asDate(iso: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
}

function daysAgo(iso: string): number {
  return Math.round((startOfDay(new Date()) - startOfDay(asDate(iso))) / 86_400_000);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
