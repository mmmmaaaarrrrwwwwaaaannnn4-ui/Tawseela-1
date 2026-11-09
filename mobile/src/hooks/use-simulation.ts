import { useEffect, useState } from 'react';

/** A clock for countdowns (Deal of the day: every second) and "12 min ago" labels (less often). */
export function useNow(active = true, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs]);
  return now;
}
