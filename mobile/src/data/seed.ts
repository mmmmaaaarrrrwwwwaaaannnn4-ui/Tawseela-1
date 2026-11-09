/*
 * Device-only starting data: the demo card wallet, addresses and inbox. Orders, reviews, bookings,
 * customers and promo codes come from the API (the server's seed holds the local edition's demo ones).
 */
import type { Address, Card, IconName, InboxItem, PayOption } from './types';

export const SEED_INBOX: InboxItem[] = [
  { id: 'n1', icon: 'sell', title: 'Weeknight deal: 15% off', sub: 'Use WEEKNIGHT15 at checkout before Thursday.', time: '2h', unread: true },
  { id: 'n2', icon: 'eco', title: 'Truffle Funghi is here', sub: 'Roasted wild mushrooms and taleggio. Fired to order.', time: '5h', unread: true },
  { id: 'n3', icon: 'check_circle', title: 'EK‑4799 delivered', sub: 'How was your Smoked Brisket Burger? Leave a rating.', time: 'Yesterday', unread: false },
  { id: 'n4', icon: 'event_seat', title: 'Patio seating is open', sub: 'Book a table for tonight from 5:30 PM.', time: 'Mon', unread: false },
];

export const SEED_CARDS: Card[] = [
  { id: 'k1', brand: 'VISA', num: '•••• 4242', exp: '08/28', bg: ['#1A1F71', '#3B3FA8'], nick: 'Everyday', name: 'ALEX MORGAN' },
  { id: 'k2', brand: 'MASTERCARD', num: '•••• 8810', exp: '02/27', bg: ['#262626', '#6B6B6B'], nick: 'Work card', name: 'ALEX MORGAN' },
];

export const SEED_ADDRESSES: Address[] = [
  { tag: 'Home', icon: 'home', l1: '221 Mercer St, Apt 4B', l2: 'New York, NY 10012', note: 'Buzzer 4B, leave with doorman', door: true },
  { tag: 'Work', icon: 'work', l1: '85 Broad St, Floor 12', l2: 'New York, NY 10004', note: 'Reception desk, ask for Alex', door: false },
];

export const PAY_OPTIONS: PayOption[] = [
  { t: 'Apple Pay', s: 'Default · Face ID', icon: 'phone_iphone' },
  { t: 'Visa •••• 4242', s: 'Expires 08/28', icon: 'credit_card' },
  { t: 'Cash on delivery', s: 'Pay the courier', icon: 'payments' },
];

/** Admin dashboard — sales by hour. */
export const HOURS: [string, number][] = [
  ['5p', 420],
  ['6p', 980],
  ['7p', 1460],
  ['8p', 1240],
  ['9p', 760],
  ['10p', 310],
];

export const STATUS = ['New', 'Preparing', 'On the way', 'Delivered', 'Cancelled'] as const;
export const BOOKING_STATUS = ['Booked', 'Seated', 'Cancelled'] as const;

/** Detects card brand + gradient from the leading digits (`brandOf`). */
export function cardBrandOf(digits: string): { name: string; bg: readonly [string, string] } {
  if (digits.startsWith('4')) return { name: 'VISA', bg: ['#1A1F71', '#3B3FA8'] };
  if (/^(5[1-5]|2[2-7])/.test(digits)) return { name: 'MASTERCARD', bg: ['#262626', '#6B6B6B'] };
  if (/^3[47]/.test(digits)) return { name: 'AMEX', bg: ['#0E6E5C', '#2FA383'] };
  if (/^6/.test(digits)) return { name: 'DISCOVER', bg: ['#C2540A', '#FF7A1A'] };
  return { name: 'CARD', bg: ['#333333', '#55575B'] };
}

export const addressIconFor = (tag: string): IconName => (tag === 'Work' ? 'work' : tag === 'Home' ? 'home' : 'location_on');
