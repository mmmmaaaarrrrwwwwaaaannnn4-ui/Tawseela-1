import type { Booking as ApiBooking, Customer as ApiCustomer, Order as ApiOrder, Review as ApiReview } from '@fig/shared';

import type { IconName } from '@/components/icons/glyphs';

export type { IconName };
export type { OrderItem, Voucher } from '@fig/shared';

/** Two-stop gradient, rendered at 135deg (top-left → bottom-right). */
export type Gradient = readonly [string, string];

export type DishTag = '' | 'Bestseller' | 'New' | 'Spicy';
export type BadgeOption = 'None' | 'Bestseller' | 'New' | 'Spicy';

export interface Dish {
  id: string;
  name: string;
  cat: string;
  price: number;
  rating: number;
  reviews: number;
  /** Prep time in minutes. */
  time: number;
  kcal: number;
  img: string;
  tag: DishTag;
  desc: string;
  avail: boolean;
  brand: string;
}

export interface Category {
  /** server id (the lower-case name for the seeded ones) */
  id: string;
  name: string;
  on: boolean;
  /** tile photo */
  img?: string;
}

export interface Brand {
  id: string;
  name: string;
  tag: string;
  icon: IconName;
  img: string;
  on: boolean;
  lat: number | null;
  lng: number | null;
  address: string;
  phone: string;
  description: string;
  workDays: ('sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri')[];
  openTime: string;
  closeTime: string;
  manualStatus: 'auto' | 'open' | 'closed';
  deliveryFee: number | null;
  prepTime: number;
}

export interface SizeOption {
  label: string;
  /** Price delta vs. base price. */
  delta: number;
}

export interface Extra {
  id: string;
  label: string;
  price: number;
}

export interface Banner {
  id: string;
  /** Eyebrow label. */
  eb: string;
  title: string;
  cta: string;
  /** Target category, or 'All'. */
  cat?: string;
  /** Target dish id. */
  dish?: string;
  img: string;
  on: boolean;
}

export type HomeSectionKey = 'hero' | 'cats' | 'deal' | 'brands' | 'popular' | 'again' | 'reserve' | 'rated' | 'journal';

export interface HomeSection {
  k: HomeSectionKey;
  l: string;
  icon: IconName;
  on: boolean;
}

export interface Deal {
  id: string;
  pct: number;
  on: boolean;
}

export type PostCategory = 'Behind the pass' | 'Recipes' | 'Guides' | 'News';

export interface Post {
  id: string;
  title: string;
  cat: PostCategory;
  img: string;
  author: string;
  date: string;
  mins: number;
  featured: boolean;
  on: boolean;
  dish: string | null;
  likes: number;
  excerpt: string;
  body: string;
}

export interface CartLine {
  id: string;
  /** Size index. */
  s: number;
  /** Extra ids. */
  ex: string[];
  q: number;
  /** Bought through Deal of the day / a reward (discounted line). */
  deal?: boolean;
  dealPct?: number;
  /** A redeemed Fig Club reward (the voucher id) — the line is free and stays at quantity 1. */
  voucher?: string;
}

/** 0 New · 1 Preparing · 2 On the way · 3 Delivered · 4 Cancelled */
export type OrderStep = 0 | 1 | 2 | 3 | 4;
export type FulfilmentMode = 'delivery' | 'pickup';

/**
 * An order as the API returns it (`@fig/shared`): `uid`, `customer` and `placedAt` instead of the local
 * edition's `cid` and `time`; `stage`, `rider` and `timeline` for the team; items priced and frozen.
 */
export type Order = ApiOrder;

export type CustomerTier = ApiCustomer['tier'];
/** A customer as the console lists them, with their order count and spend. */
export type Customer = ApiCustomer;

export interface Address {
  tag: string;
  icon: IconName;
  l1: string;
  l2: string;
  note: string;
  door: boolean;
  phone?: string;
}

export interface PayOption {
  t: string;
  s: string;
  icon: IconName;
}

export interface Speed {
  t: string;
  s: string;
  fee: number;
}

export interface Card {
  id: string;
  brand: string;
  num: string;
  exp: string;
  bg: Gradient;
  nick: string;
  name: string;
}

export interface Promo {
  code: string;
  pct: number;
  used: number;
  on: boolean;
}

export interface AppliedPromo {
  code: string;
  pct: number;
}

/** A review (`at` in epoch ms). */
export type Review = ApiReview;

/** 0 Booked · 1 Seated · 2 Cancelled */
export type BookingStatus = 0 | 1 | 2;

/** A reservation: `date` is YYYY-MM-DD in the restaurant's time zone; `mine` marks the signed-in customer's. */
export type Booking = ApiBooking & { mine?: boolean };

export interface InboxItem {
  id: string;
  icon: IconName;
  title: string;
  sub: string;
  time: string;
  unread: boolean;
}

export interface Reward {
  id: string;
  l: string;
  pts: number;
  dish?: string;
  s?: number;
  credit?: number;
}

export interface Faq {
  id: string;
  topic: string;
  q: string;
  a: string;
}

export interface SeatArea {
  l: string;
  note: string;
  cap: string;
  icon: IconName;
  img: string;
}

export interface OnboardingSlide {
  img: string;
  l0: string;
  l1: string;
  sub: string;
  icon: IconName;
  t: string;
  d: string;
  bg: Gradient;
  fg: string;
}

export interface Prefs {
  lang: 'العربية' | 'English' | 'Español' | 'Français';
  orderNotif: boolean;
  offers: boolean;
  journalNotif: boolean;
  sms: boolean;
  location: boolean;
  personal: boolean;
}

export interface MenuFilters {
  /** Index into SORTS. */
  sort: number;
  veg: boolean;
  hot: boolean;
  under: boolean;
}
