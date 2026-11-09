/** Egyptian pound display for Tawseela. */
export const money = (n: number): string => `${(Math.round(n * 100) / 100).toFixed(2)} EGP`;

/** Initials: "Alex Morgan" → "AM". */
export const initials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Count with naive English pluralisation: cnt(1,'dish') → "1 dish", cnt(2,'dish') → "2 dishes". */
export const cnt = (n: number, word: string): string => `${n} ${n === 1 ? word : /(s|sh|ch|x)$/.test(word) ? word + 'es' : word + 's'}`;

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export const firstName = (name: string | undefined | null, fallback = 'there'): string => (name ?? '').trim().split(' ')[0] || fallback;

/** "Just now", "12 min ago", "7:12 PM" (earlier today) or "Nov 3, 7:12 PM". */
export function agoLabel(at: number, now = Date.now()): string {
  const mins = Math.floor((now - at) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const d = new Date(at);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (new Date(now).toDateString() === d.toDateString()) return time;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

/** An order's time the way the local edition showed it: "7:12 PM" today, "Yesterday", "Mon", then "Nov 3". */
export function orderTime(at: number, now = Date.now()): string {
  const d = new Date(at);
  const today = new Date(now);
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
