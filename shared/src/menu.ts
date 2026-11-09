/*
 * Fig & Fennel's fixed menu rules: sizes, extras, delivery speeds, rewards and loyalty tiers. The admin
 * console can't change these, so they live here (one copy for the app and the server) rather than in
 * Firestore. Copied from the local edition (src/data/menu.ts and src/data/content.ts).
 */

export interface SizeOption {
  label: string;
  /** Price delta vs. the dish's base price. */
  delta: number;
}

export interface Extra {
  id: string;
  label: string;
  price: number;
}

const SIZES: Record<string, SizeOption[]> = {
  Pizza: [
    { label: '10"', delta: -2 },
    { label: '12"', delta: 0 },
    { label: '14"', delta: 3 },
  ],
  Desserts: [
    { label: 'Slice', delta: 0 },
    { label: 'Double', delta: 6.5 },
  ],
  _: [
    { label: 'Regular', delta: 0 },
    { label: 'Large', delta: 3 },
  ],
};

export const sizesOf = (cat: string): SizeOption[] => SIZES[cat] ?? SIZES._;

/** Pizza defaults to 12" (index 1); everything else to the first size. */
export const defaultSize = (cat: string): number => (cat === 'Pizza' ? 1 : 0);

const EXTRAS = {
  sweet: [
    { id: 'cream', label: 'Vanilla cream', price: 1.5 },
    { id: 'berry', label: 'Berry compote', price: 1.5 },
  ],
  savory: [
    { id: 'cheese', label: 'Extra cheese', price: 1.5 },
    { id: 'chili', label: 'Calabrian chili oil', price: 0.8 },
    { id: 'dip', label: 'Garlic dip', price: 1 },
    { id: 'side', label: 'Side of fries', price: 3.5 },
  ],
} satisfies Record<string, Extra[]>;

export const extrasOf = (cat: string): Extra[] => (cat === 'Desserts' ? EXTRAS.sweet : EXTRAS.savory);
export const ALL_EXTRAS: Extra[] = [...EXTRAS.sweet, ...EXTRAS.savory];

/** Delivery speeds (checkout). Pickup ignores the speed. */
export const SPEEDS = [
  { t: 'Standard', s: '25–35 min', fee: 0 },
  { t: 'Priority', s: '15–20 min', fee: 1.99 },
] as const;

/* ---------- rewards (Fig Club) ---------- */

export interface Reward {
  id: string;
  l: string;
  pts: number;
  /** a dish reward: this dish, free, once (becomes a voucher) */
  dish?: string;
  /** size index of the free dish */
  s?: number;
  /** a money-off reward: this much Fig credit */
  credit?: number;
}

export const REWARDS: Reward[] = [
  { id: 'r1', l: 'Truffle Parmesan Fries', pts: 500, dish: 'fries', s: 0 },
  { id: 'r2', l: '$5 off your next order', pts: 800, credit: 5 },
  { id: 'r3', l: 'Blueberry Cheesecake', pts: 1000, dish: 'cheesecake', s: 0 },
  { id: 'r4', l: 'Any 12" pizza', pts: 2000, dish: 'marg', s: 1 },
];

export const TIERS: [string, number][] = [
  ['Bronze', 0],
  ['Silver', 1000],
  ['Gold', 2500],
  ['Platinum', 5000],
];

export type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

/** The Fig Club tier for a points balance (the rewards screen's rule). */
export const tierOf = (points: number): Tier => (TIERS.filter((t) => points >= t[1]).at(-1)?.[0] ?? 'Bronze') as Tier;

/** Points the server awards. */
export const POINTS = {
  /** on the first sign-in */
  welcome: 500,
  /** per whole dollar of an order's subtotal, once it reaches the kitchen */
  perDollar: 10,
  /** the first rating of an order */
  rating: 50,
  /** each table booking */
  booking: 100,
} as const;

/** Fig credit added when a customer reports a problem with an order (once per order). */
export const ISSUE_CREDIT = 5;

/** "Get help" reasons, by index (the app's ISSUES list). */
export const ISSUE_TYPES = ['Missing item', 'Wrong item', 'Arrived late', 'Food quality', 'Something else'] as const;

/** Journal categories. */
export const POST_CATS = ['Behind the pass', 'Recipes', 'Guides', 'News'] as const;

/** Bookable seating areas. */
export const SEAT_AREAS = ['Dining room', 'Patio', 'Chef’s counter'] as const;

/** The restaurant's time zone: "today", "tonight" and order days are judged here. */
export const RESTAURANT_TZ = 'America/New_York';

/** YYYY-MM-DD in the restaurant's time zone, `offsetDays` after `ms` (0 = today). */
export function restaurantDate(ms: number, offsetDays = 0): string {
  const today = new Date(ms).toLocaleDateString('en-CA', { timeZone: RESTAURANT_TZ });
  if (!offsetDays) return today;
  // calendar arithmetic on the date itself, so DST changes can't skip or repeat a day
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}
