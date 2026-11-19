import type {
  AdminCatalog,
  Booking as ApiBooking,
  Brand as ApiBrand,
  Catalog,
  Category as ApiCategory,
  CreateBooking,
  Dish as ApiDish,
  DishInput,
  DishPatch,
  IssueResult,
  LikeResult,
  Me,
  Post as ApiPost,
  Promo as ApiPromo,
  RateOrder,
  StoreSettings,
  Voucher,
} from '@fig/shared';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { HERO, ISSUES, POSTS, SECTIONS } from '@/data/content';
import { BRANDS, CATS, CAT_IMG, MENU } from '@/data/menu';
import { addressIconFor, cardBrandOf, SEED_ADDRESSES, SEED_CARDS, SEED_INBOX } from '@/data/seed';
import type {
  Address,
  AppliedPromo,
  Banner,
  Booking,
  BookingStatus,
  Brand,
  Card,
  CartLine,
  Category,
  Customer,
  Deal,
  Dish,
  FulfilmentMode,
  HomeSection,
  HomeSectionKey,
  IconName,
  InboxItem,
  MenuFilters,
  Order,
  Post,
  Prefs,
  Promo,
  Review,
  Reward,
} from '@/data/types';
import { cnt, money } from '@/lib/format';
import { computeTotals, round2, settleLine, type Totals } from '@/lib/pricing';

import { useSession } from './session';
import { deviceStorage } from './storage';

/* ------------------------------------------------------------------ types */

export type ThemePref = 'light' | 'dark' | 'system';

export interface ToastData {
  id: number;
  title: string;
  sub: string;
  icon: IconName;
  /** Optional action button: label + route to open. */
  action?: { label: string; href: string };
}

export interface FlyData {
  key: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface ItemDraft {
  id: string | null;
  name: string;
  price: number;
  cat: string;
  brand: string;
  tag: 'None' | 'Bestseller' | 'New' | 'Spicy';
  avail: boolean;
  img: string;
}

export interface NewAddress {
  tag: 'Home' | 'Work' | 'Other';
  custom: string;
  l1: string;
  apt: string;
  city: string;
  zip: string;
  note: string;
  door: boolean;
  phone: string;
  def: boolean;
  latitude?: number;
  longitude?: number;
}

export interface NewCard {
  num: string;
  name: string;
  exp: string;
  cvv: string;
  nick: string;
  def: boolean;
}

/** The server calls the store makes (lib/remote.ts registers them, so the store never imports the API). */
export interface Remote {
  validatePromo: (code: string) => Promise<{ code: string; pct: number }>;
  redeem: (id: string) => Promise<Me>;
  rate: (orderId: string, input: RateOrder) => Promise<Order>;
  reportIssue: (orderId: string | null, type: number, text: string) => Promise<IssueResult>;
  book: (b: CreateBooking) => Promise<ApiBooking>;
  cancelBooking: (id: string) => Promise<ApiBooking>;
  like: (postId: string) => Promise<LikeResult>;

  createDish: (d: DishInput) => Promise<ApiDish>;
  patchDish: (id: string, p: DishPatch) => Promise<ApiDish>;
  deleteDish: (id: string) => Promise<void>;
  createCategory: (name: string) => Promise<ApiCategory>;
  patchCategory: (id: string, p: { on?: boolean; img?: string }) => Promise<ApiCategory>;
  reorder: (kind: 'categories' | 'banners' | 'sections', ids: string[]) => Promise<void>;
  createBrand: (b: Omit<ApiBrand, 'id' | 'order'>) => Promise<ApiBrand>;
  patchBrand: (id: string, p: Partial<Omit<ApiBrand, 'id' | 'order'>>) => Promise<ApiBrand>;
  deleteBrand: (id: string) => Promise<void>;
  patchBanner: (id: string, p: { on?: boolean }) => Promise<unknown>;
  patchSection: (k: HomeSectionKey, p: { on?: boolean }) => Promise<unknown>;
  patchDeal: (p: Partial<Deal>) => Promise<Deal>;
  patchStore: (p: Partial<StoreSettings>) => Promise<StoreSettings>;
  createPromo: (code: string, pct: number) => Promise<ApiPromo>;
  patchPromo: (code: string, on: boolean) => Promise<ApiPromo>;
  createPost: (p: Omit<Post, 'id' | 'date' | 'mins' | 'likes'>) => Promise<ApiPost>;
  patchPost: (id: string, p: Partial<Omit<Post, 'id' | 'date' | 'mins' | 'likes'>>) => Promise<ApiPost>;
  deletePost: (id: string) => Promise<void>;

  advanceOrder: (id: string) => Promise<Order>;
  cancelOrder: (id: string) => Promise<Order>;
  fireTicket: (id: string) => Promise<Order>;
  itemDone: (id: string, index: number, done: boolean) => Promise<Order>;
  setBookingStatus: (id: string, status: BookingStatus) => Promise<ApiBooking>;
  replyReview: (id: string) => Promise<Review>;

  /** a console write landed: refresh the catalog (debounced) so its version and server fields catch up */
  catalogChanged: () => void;
  errorMessage: (e: unknown) => string;
}

let remote: Remote | null = null;
export const registerRemote = (r: Remote) => {
  remote = r;
};
const server = (): Remote => {
  if (!remote) throw new Error('lib/remote.ts is not loaded');
  return remote;
};

interface State {
  /* session (who is signed in lives in store/session.ts) */
  onboarded: boolean;
  /** Set when a guest tries to check out; after auth we jump to checkout. */
  pendingCheckout: boolean;
  theme: ThemePref;

  /* catalog — from the API, cached on the device (version 0 = the copy bundled with the app) */
  catalogVersion: number;
  catalogEtag: string | null;
  menu: Dish[];
  cats: Category[];
  brands: Brand[];
  banners: Banner[];
  secs: HomeSection[];
  deal: Deal;
  posts: Post[];
  /** the console's promo codes (admins only) */
  promos: Promo[];

  /* store settings */
  storeOpen: boolean;
  prep: number;
  fee: number;
  freeAt: number;
  sound: boolean;

  /* customer */
  customerLocation: { latitude: number; longitude: number } | null;
  saved: string[];
  cart: CartLine[];
  mode: FulfilmentMode;
  promo: AppliedPromo | null;
  /** Promo field prefill (e.g. from a notification’s “Apply in cart”). */
  promoDraft: string;
  addrs: Address[];
  addr: number;
  speed: number;
  /** 0 direct card form · 1 previously selected card option · 2 cash */
  payM: number;
  note: string;
  /** Locally displayed saved-card placeholders; raw card data is never stored here. */
  cards: Card[];
  defCard: string;

  /* the account, from GET /v1/me */
  credit: number;
  points: number;
  redeemed: string[];
  vouchers: Voucher[];
  liked: string[];

  /** the signed-in customer's orders (and, in the console, everyone's) */
  orders: Order[];
  lastNo: string | null;
  inbox: InboxItem[];
  reviews: Review[];
  bookings: Booking[];
  customers: Customer[];
  prefs: Prefs;
  orderNotif: boolean;
  filters: MenuFilters;
  /** Selected menu category + brand filter (shared by Home → Menu jumps). */
  menuCat: string;
  menuBrand: string | null;

  /* transient ui */
  toast: ToastData | null;
  fly: FlyData | null;
  bump: number;
}

interface Actions {
  dishOf: (id: string) => Dish;
  totals: () => Totals;
  showToast: (title: string, sub: string, icon?: IconName, action?: ToastData['action']) => void;
  hideToast: () => void;
  flyToCart: (from: { x: number; y: number }, to: { x: number; y: number }) => void;
  endFly: () => void;

  setTheme: (t: ThemePref) => void;
  finishOnboarding: () => void;
  setPendingCheckout: (v: boolean) => void;

  setMenuCat: (cat: string, brand?: string | null) => void;
  setMenuBrand: (brand: string | null) => void;
  setFilters: (f: MenuFilters) => void;

  /* server → store */
  applyCatalog: (c: Catalog | AdminCatalog, etag: string | null) => void;
  applyMe: (me: Me) => void;
  /** merges orders from the server; returns the ones whose step, payment or rider changed */
  mergeOrders: (orders: Order[]) => Order[];
  /** forgets what belongs to the signed-out account (orders, points, vouchers); the cart and settings stay */
  clearAccount: () => void;

  toggleSave: (id: string) => boolean;
  addToCart: (line: CartLine, opts?: { silent?: boolean }) => boolean;
  setQty: (index: number, delta: number) => void;
  reorder: (no: string) => void;
  setMode: (m: FulfilmentMode) => void;
  applyPromo: (code: string) => Promise<string | null>;
  removePromo: () => void;
  setPromoDraft: (code: string) => void;
  setCheckout: (p: Partial<Pick<State, 'speed' | 'payM' | 'note' | 'addr'>>) => void;
  /** a placed order: into the history, the cart emptied */
  orderPlaced: (order: Order) => void;
  canCheckout: () => 'closed' | 'auth' | 'ok';

  addAddress: (a: NewAddress) => string | null;
  removeAddress: (i: number) => void;
  addCard: (c: NewCard) => string | null;
  removeCard: (id: string) => boolean;
  makeDefaultCard: (id: string) => void;
  addGiftCard: () => void;
  redeem: (r: Reward) => Promise<void>;

  pushInbox: (icon: IconName, title: string, sub: string) => void;
  readNotif: (id: string) => void;
  readAllNotifs: () => void;
  deleteNotif: (id: string) => void;

  submitRating: (no: string, stars: number, tags: string[], text: string, tip?: number) => Promise<boolean>;
  submitIssue: (no: string | null, type: number) => Promise<void>;
  addBooking: (b: CreateBooking) => Promise<Booking | null>;
  setBookingStatus: (id: string, status: BookingStatus) => Promise<void>;
  toggleLike: (postId: string) => void;
  setPrefs: (p: Partial<Prefs>) => void;
  setOrderNotif: (v: boolean) => void;

  /* admin — each shows at once and rolls back with the server's reason if it's refused */
  setStore: (p: Partial<Pick<State, 'storeOpen' | 'prep' | 'fee' | 'freeAt' | 'sound'>>) => void;
  toggleStoreOpen: () => void;
  advanceOrder: (no: string) => void;
  cancelOrder: (no: string) => void;
  fireTicket: (no: string) => void;
  toggleKDone: (no: string, index: number) => void;
  toggleAvail: (id: string) => void;
  saveItem: (d: ItemDraft) => Promise<boolean>;
  deleteItem: (id: string) => void;
  toggleCat: (name: string) => void;
  moveCat: (i: number, d: number) => void;
  addCat: (name: string) => Promise<boolean>;
  toggleBrand: (id: string) => void;
  createBrand: (b: Omit<Brand, 'id'>) => Promise<boolean>;
  saveBrand: (b: Brand) => Promise<boolean>;
  deleteBrand: (id: string) => Promise<boolean>;
  toggleSection: (k: HomeSectionKey) => void;
  moveSection: (i: number, d: number) => void;
  toggleBanner: (id: string) => void;
  moveBanner: (i: number, d: number) => void;
  setDeal: (d: Partial<Deal>) => void;
  savePost: (p: Post) => Promise<boolean>;
  deletePost: (id: string) => void;
  togglePost: (id: string) => void;
  addPromo: (code: string, pct: number) => Promise<boolean>;
  togglePromo: (code: string) => void;
  replyReview: (id: string) => void;

  resetDemo: () => void;
}

export type AppStore = State & Actions;

/* ------------------------------------------------------------------ helpers */

const move = <T>(arr: T[], i: number, d: number): T[] | null => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return null;
  const a = [...arr];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
};

const lineKey = (c: CartLine) => `${c.id}-${c.s}-${[...c.ex].sort().join('.')}${c.deal ? '-d' : ''}${c.voucher ? `-v${c.voucher}` : ''}`;

/** Order step labels; a pickup order's step 2 is "Ready for pickup". */
export const STEP_NAMES = ['Order placed', 'Preparing', 'On the way', 'Delivered', 'Cancelled'] as const;
export const stepLabel = (o: Pick<Order, 'mode'> | undefined, i: number): string =>
  o && o.mode === 'pickup' && i === 2 ? 'Ready for pickup' : (STEP_NAMES[i] ?? '');

/** A placed order's item back as a cart line (for reorder). */
const toCartLine = ({ id, s, ex, q }: CartLine): CartLine => ({ id, s, ex: [...ex], q });

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let uid = 0;

/** The catalog bundled with the app: what a first launch shows before (or without) the server. */
const bundledCatalog = () => ({
  catalogVersion: 0,
  catalogEtag: null as string | null,
  menu: MENU.map((m) => ({ ...m })),
  cats: CATS.map((name) => ({ id: name.toLowerCase(), name, on: true, img: CAT_IMG[name] })),
  brands: BRANDS.map((b) => ({ ...b })),
  banners: HERO.map((b) => ({ ...b })),
  secs: SECTIONS.map((s) => ({ ...s })),
  deal: { id: 'smash', pct: 25, on: true },
  posts: POSTS.filter((p) => p.on).map((p) => ({ ...p })),
  promos: [] as Promo[],
  storeOpen: true,
  prep: 18,
  fee: 2.99,
  freeAt: 40,
  sound: true,
});

const emptyAccount = () => ({
  credit: 0,
  points: 0,
  redeemed: [] as string[],
  vouchers: [] as Voucher[],
  liked: [] as string[],
  orders: [] as Order[],
  lastNo: null as string | null,
  bookings: [] as Booking[],
  reviews: [] as Review[],
  customers: [] as Customer[],
});

const initialState = (): State => ({
  onboarded: false,
  pendingCheckout: false,
  theme: 'light',

  ...bundledCatalog(),

  customerLocation: null,
  saved: ['brisket', 'carb', 'cheesecake'],
  cart: [],
  mode: 'delivery',
  promo: null,
  promoDraft: '',
  addrs: SEED_ADDRESSES.map((a) => ({ ...a })),
  addr: 0,
  speed: 0,
  payM: 0,
  note: '',
  cards: SEED_CARDS.map((c) => ({ ...c })),
  defCard: 'k1',

  ...emptyAccount(),

  inbox: SEED_INBOX.map((n) => ({ ...n })),
  prefs: { lang: 'العربية', orderNotif: true, offers: true, journalNotif: false, sms: false, location: true, personal: true },
  orderNotif: true,
  filters: { sort: 0, veg: false, hot: false, under: false },
  menuCat: 'All',
  menuBrand: null,

  toast: null,
  fly: null,
  bump: 0,
});

const byOrder = <T extends { order: number }>(a: T[]) => [...a].sort((x, y) => x.order - y.order);
const sortBookings = (a: Booking[]) => [...a].sort((x, y) => x.date.localeCompare(y.date) || x.time.localeCompare(y.time, undefined, { numeric: true }));

/* ------------------------------------------------------------------ store */

export const useApp = create<AppStore>()(
  persist(
    (set, get) => {
      const toast: Actions['showToast'] = (title, sub, icon = 'check', action) => {
        uid += 1;
        set({ toast: { id: uid, title, sub, icon, action } });
        clearTimeout(toastTimer);
        // longer messages (sign-in problems, server errors) stay up long enough to read
        toastTimer = setTimeout(() => set({ toast: null }), Math.min(6000, Math.max(2600, 1000 + sub.length * 45)));
      };

      /**
       * A server-backed change: show it at once, send it, and put the touched state back with the server's
       * reason if it's refused. Catalog writes then refresh the catalog so its version catches up.
       */
      const write = async <T, K extends keyof State>(opts: {
        keys: K[];
        apply?: (s: State) => Partial<State>;
        call: (r: Remote) => Promise<T>;
        done?: (res: T, s: State) => Partial<State> | void;
        fail: string;
        catalog?: boolean;
      }): Promise<T | null> => {
        const before = get();
        const snapshot = Object.fromEntries(opts.keys.map((k) => [k, before[k]])) as Partial<State>;
        if (opts.apply) set(opts.apply(before));
        try {
          const res = await opts.call(server());
          const patch = opts.done?.(res, get());
          if (patch) set(patch);
          if (opts.catalog) server().catalogChanged();
          return res;
        } catch (e) {
          set(snapshot);
          toast(opts.fail, remote?.errorMessage(e) ?? 'Try again in a moment.', 'error');
          return null;
        }
      };

      const replaceOrder = (o: Order) =>
        set((s) => ({ orders: s.orders.some((x) => x.id === o.id) ? s.orders.map((x) => (x.id === o.id ? o : x)) : [o, ...s.orders] }));
      const orderByNo = (no: string) => get().orders.find((o) => o.no === no);

      return {
        ...initialState(),

        dishOf: (id) => get().menu.find((m) => m.id === id) ?? MENU.find((m) => m.id === id) ?? get().menu[0],

        totals: () => {
          const s = get();
          // Tawseela delivery policy: first completed order gets free delivery;
          // every subsequent delivery order has one fixed EGP 5 fee.
          const hasPreviousOrder = s.orders.some((order) => order.step === 3);
          const deliveryFee = hasPreviousOrder ? 5 : 0;
          return computeTotals({ cart: s.cart, dishOf: s.dishOf, mode: s.mode, speed: s.speed, fee: deliveryFee, freeAt: hasPreviousOrder ? Number.MAX_SAFE_INTEGER : 0, promo: s.promo });
        },

        showToast: toast,
        hideToast: () => set({ toast: null }),
        flyToCart: (from, to) => set((s) => ({ fly: { key: (s.fly?.key ?? 0) + 1, from, to } })),
        endFly: () => set((s) => ({ fly: null, bump: s.bump + 1 })),

        /* session */
        setTheme: (theme) => set({ theme }),
        finishOnboarding: () => set({ onboarded: true }),
        setPendingCheckout: (pendingCheckout) => set({ pendingCheckout }),

        setMenuCat: (menuCat, brand) => set((s) => ({ menuCat, menuBrand: brand === undefined ? s.menuBrand : brand })),
        setMenuBrand: (menuBrand) => set({ menuBrand }),
        setFilters: (filters) => set({ filters }),

        /* server → store */
        applyCatalog: (c, etag) =>
          set((s) => {
            const ids = new Set(c.dishes.map((d) => d.id));
            return {
              catalogVersion: c.version,
              catalogEtag: etag,
              menu: byOrder(c.dishes).map(({ order: _o, ...d }) => d),
              cats: byOrder(c.categories).map(({ id, name, on, img }) => ({ id, name, on, img })),
              brands: byOrder(c.brands).map(({ order: _o, ...b }) => ({ ...b, icon: b.icon as IconName })),
              banners: byOrder(c.banners).map(({ order: _o, ...b }) => b),
              secs: c.sections.map((x) => ({ ...x, icon: x.icon as IconName })),
              deal: c.deal,
              posts: c.posts,
              ...('promos' in c ? { promos: c.promos } : {}),
              storeOpen: c.store.open,
              prep: c.store.prep,
              fee: c.store.fee,
              freeAt: c.store.freeAt,
              sound: c.store.sound,
              // dishes that left the menu drop out of the cart; deal lines are priced at today's percentage
              cart: s.cart.filter((l) => ids.has(l.id)).map((l) => settleLine(l, c.deal)),
              saved: s.saved.filter((id) => ids.has(id)),
            };
          }),

        applyMe: (me) =>
          set((s) => ({
            points: me.points,
            credit: me.credit,
            redeemed: me.redeemed,
            vouchers: me.vouchers,
            liked: me.liked,
            // a voucher that's been used (or given back) leaves the cart
            cart: s.cart.filter((l) => !l.voucher || me.vouchers.some((v) => v.id === l.voucher)),
          })),

        mergeOrders: (incoming) => {
          const before = new Map(get().orders.map((o) => [o.id, o]));
          const changed = incoming.filter((o) => {
            const prev = before.get(o.id);
            return !prev || prev.step !== o.step || prev.payment.status !== o.payment.status || prev.rider?.uid !== o.rider?.uid;
          });
          const ids = new Set(incoming.map((o) => o.id));
          set((s) => ({ orders: [...incoming, ...s.orders.filter((o) => !ids.has(o.id))].sort((a, b) => b.placedAt - a.placedAt) }));
          return changed;
        },

        clearAccount: () => set((s) => ({ ...emptyAccount(), promo: null, pendingCheckout: false, cart: s.cart.filter((l) => !l.voucher) })),

        /* cart */
        toggleSave: (id) => {
          const on = get().saved.includes(id);
          set((s) => ({ saved: on ? s.saved.filter((x) => x !== id) : [...s.saved, id] }));
          if (!on) toast('Saved', get().dishOf(id).name, 'favorite');
          return !on;
        },

        addToCart: (line, opts) => {
          const s = get();
          const dish = s.dishOf(line.id);
          if (!s.storeOpen) {
            toast('Kitchen is closed', 'Ordering reopens at 11:00 AM', 'schedule');
            return false;
          }
          if (!dish.avail) {
            toast('Sold out tonight', `${dish.name} is unavailable`, 'block');
            return false;
          }
          const key = lineKey(line);
          set((st) => {
            const cart = [...st.cart];
            const i = cart.findIndex((c) => lineKey(c) === key);
            if (i >= 0) cart[i] = { ...cart[i], q: line.voucher ? 1 : cart[i].q + line.q };
            else cart.push(settleLine({ ...line, ex: [...line.ex] }, st.deal));
            return { cart };
          });
          if (!opts?.silent) toast('Added to cart', `${line.q > 1 ? line.q + ' × ' : ''}${dish.name}`, 'shopping_bag', { label: 'View', href: '/cart' });
          return true;
        },

        // a reward line stays at one
        setQty: (index, delta) =>
          set((s) => ({
            cart: s.cart.map((c, k) => (k === index ? { ...c, q: c.voucher ? Math.min(1, c.q + delta) : c.q + delta } : c)).filter((c) => c.q > 0),
          })),

        reorder: (no) => {
          const o = orderByNo(no);
          if (!o) return;
          const lines = o.items.filter((it) => !it.voucher).map(toCartLine);
          const added = lines.filter((l) => get().addToCart(l, { silent: true }));
          if (!added.length) return;
          toast(
            'Added to cart',
            `${cnt(
              added.reduce((a, b) => a + b.q, 0),
              'item',
            )} from ${o.no}`,
            'replay',
            { label: 'View', href: '/cart' },
          );
        },

        setMode: (mode) => set({ mode }),

        applyPromo: async (code) => {
          const c = code.trim().toUpperCase();
          if (!c) return 'Type a code first.';
          try {
            const p = await server().validatePromo(c);
            set({ promo: { code: p.code, pct: p.pct } });
            toast('Promo applied', `${p.code} · ${p.pct}% off`, 'sell');
            return null;
          } catch (e) {
            return remote?.errorMessage(e) ?? 'That code isn’t active. Try FIG10.';
          }
        },
        removePromo: () => set({ promo: null, promoDraft: '' }),
        setPromoDraft: (promoDraft) => set({ promoDraft }),
        setCheckout: (p) => set(p),

        canCheckout: () => {
          const s = get();
          if (!s.storeOpen) {
            toast('Kitchen is closed', 'Ordering reopens at 11:00 AM', 'schedule');
            return 'closed';
          }
          if (!useSession.getState().user) {
            set({ pendingCheckout: true });
            return 'auth';
          }
          return 'ok';
        },

        orderPlaced: (order) => {
          replaceOrder(order);
          set({ lastNo: order.no, cart: [], promo: null, promoDraft: '', note: '' });
        },

        /* account */
        addAddress: (n) => {
          const miss: string[] = [];
          if (!n.l1.trim()) miss.push('a street');
          // The form uses this optional value for floor/unit detail, not a postal code.
          if (miss.length) {
            toast('Almost there', 'Add ' + miss.join(' and '), 'error');
            return miss.join(' and ');
          }
          const tag = n.tag === 'Other' ? n.custom.trim() || 'Other' : n.tag;
          const a: Address = {
            tag,
            icon: addressIconFor(n.tag),
            l1: n.l1.trim() + (n.apt.trim() ? ', ' + n.apt.trim() : ''),
            l2: (n.city.trim() + ' ' + n.zip.trim()).trim(),
            note: n.note.trim(),
            door: n.door,
            phone: n.phone,
            latitude: n.latitude,
            longitude: n.longitude,
          };
          const existingIndex = get().addrs.findIndex((saved) => {
            if (n.latitude == null || n.longitude == null || saved.latitude == null || saved.longitude == null) return false;
            const rad = (v: number) => v * Math.PI / 180;
            const dLat = rad(saved.latitude - n.latitude);
            const dLng = rad(saved.longitude - n.longitude);
            const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(n.latitude)) * Math.cos(rad(saved.latitude)) * Math.sin(dLng / 2) ** 2;
            const meters = 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
            return meters <= 60 && saved.l1.trim().toLowerCase() === a.l1.trim().toLowerCase();
          });
          if (existingIndex >= 0) {
            set({ addr: existingIndex });
            toast('العنوان محفوظ بالفعل', 'تم اختيار العنوان الموجود بدلًا من إنشاء نسخة مكررة.', 'location_on');
            return null;
          }
          set((s) => ({ addrs: [...s.addrs, a], addr: n.def ? s.addrs.length : s.addr }));
          toast('Address saved', a.l1, 'location_on');
          return null;
        },
        removeAddress: (i) => {
          const a = get().addrs[i];
          if (!a) return;
          set((s) => ({
            addrs: s.addrs.filter((_, k) => k !== i),
            addr: s.addr === i ? 0 : s.addr > i ? s.addr - 1 : s.addr,
          }));
          toast('Address removed', a.l1, 'delete');
        },

        addCard: (c) => {
          const d = c.num.replace(/\D/g, '');
          const okNum = d.length >= 15;
          const okExp = /^(0[1-9]|1[0-2])\/\d{2}$/.test(c.exp);
          const okCvv = /^\d{3,4}$/.test(c.cvv);
          if (!okNum || !okExp || !okCvv || !c.name.trim()) {
            const msg = !okNum
              ? 'Card number looks too short'
              : !okExp
                ? 'Use MM/YY for the expiry date'
                : !okCvv
                  ? 'CVV is 3 or 4 digits'
                  : 'Add the name on the card';
            toast('Check card details', msg, 'error');
            return msg;
          }
          const b = cardBrandOf(d);
          const id = 'k' + Date.now();
          set((s) => ({
            cards: [
              ...s.cards,
              { id, brand: b.name, num: '•••• ' + d.slice(-4), exp: c.exp, bg: b.bg, name: c.name.trim().toUpperCase(), nick: c.nick.trim() },
            ],
            defCard: c.def ? id : s.defCard,
            payM: c.def ? 1 : s.payM,
          }));
          toast('Card added', `${b.name} •••• ${d.slice(-4)}`, 'credit_card');
          return null;
        },
        removeCard: (id) => {
          const s = get();
          const c = s.cards.find((x) => x.id === id);
          if (!c) return false;
          if (s.cards.length <= 1) {
            toast('Keep at least one card', 'Add another card before removing this one', 'info');
            return false;
          }
          const rest = s.cards.filter((x) => x.id !== id);
          set({ cards: rest, defCard: s.defCard === id ? rest[0].id : s.defCard });
          toast('Card removed', `${c.brand} ${c.num}`, 'delete');
          return true;
        },
        makeDefaultCard: (id) => {
          const c = get().cards.find((x) => x.id === id);
          set({ defCard: id, payM: 1 });
          if (c) toast('Default updated', `${c.brand} ${c.num}`, 'check_circle');
        },
        // Fig credit is kept by the server now, and gift cards aren't sold yet
        addGiftCard: () => toast('Gift cards are coming soon', 'Fig credit comes from Fig Club rewards and from help with an order', 'redeem'),

        redeem: async (r) => {
          const s = get();
          if (s.redeemed.includes(r.id)) return;
          if (s.points < r.pts) {
            toast('Not enough points', `You need ${r.pts - s.points} more`, 'info');
            return;
          }
          const known = new Set(s.vouchers.map((v) => v.id));
          const me = await write({
            keys: ['points', 'redeemed'],
            apply: (st) => ({ points: st.points - r.pts, redeemed: [...st.redeemed, r.id] }),
            call: (api) => api.redeem(r.id),
            fail: 'Reward not redeemed',
          });
          if (!me) return;
          get().applyMe(me);
          if (r.credit) {
            toast('Reward redeemed', `${money(r.credit)} added to Fig credit`, 'redeem');
            return;
          }
          // a dish reward becomes a voucher: a free line in the cart
          const v = me.vouchers.find((x) => !known.has(x.id) && x.reward === r.id) ?? me.vouchers.find((x) => x.reward === r.id);
          if (v && !get().cart.some((l) => l.voucher === v.id))
            set((st) => ({ cart: [...st.cart, { id: v.dish, s: v.s, ex: [], q: 1, deal: true, dealPct: 100, voucher: v.id }] }));
          toast('Reward redeemed', `${r.l} added to your cart free`, 'redeem', { label: 'View', href: '/cart' });
        },

        /* inbox (on this device) */
        pushInbox: (icon, title, sub) => {
          uid += 1;
          set((s) => ({ inbox: [{ id: `n${Date.now()}-${uid}`, icon, title, sub, time: 'Now', unread: true }, ...s.inbox].slice(0, 50) }));
        },
        readNotif: (id) => set((s) => ({ inbox: s.inbox.map((x) => (x.id === id ? { ...x, unread: false } : x)) })),
        readAllNotifs: () => set((s) => ({ inbox: s.inbox.map((x) => ({ ...x, unread: false })) })),
        deleteNotif: (id) => {
          const n = get().inbox.find((x) => x.id === id);
          set((s) => ({ inbox: s.inbox.filter((x) => x.id !== id) }));
          if (n) toast('Notification deleted', n.title, 'delete');
        },

        submitRating: async (no, stars, tags, text, tip = 0) => {
          const o = orderByNo(no);
          if (!o) return false;
          const res = await write({
            keys: ['orders'],
            apply: (s) => ({ orders: s.orders.map((x) => (x.id === o.id ? { ...x, rated: stars } : x)) }),
            call: (api) => api.rate(o.id, { stars, tags, text: text.trim(), tip }),
            done: (order) => {
              replaceOrder(order);
            },
            fail: 'Rating not sent',
          });
          return !!res;
        },

        submitIssue: async (no, type) => {
          const t = ISSUES[type]?.[0] ?? 'Issue';
          const o = no ? orderByNo(no) : undefined;
          try {
            const res = await server().reportIssue(o?.id ?? null, type, '');
            set({ credit: res.credit });
            const sub = res.credited
              ? `${t} reported. We added ${money(5)} Fig credit while the team looks into it.`
              : `${t} reported. The team will look into it.`;
            get().pushInbox('support_agent', `We’re on it · ${no ?? 'your order'}`, sub);
            toast('Issue reported', res.credited ? `${money(5)} credit added to your account` : 'The team will be in touch', 'support_agent');
          } catch (e) {
            toast('Issue not sent', remote?.errorMessage(e) ?? 'Try again in a moment.', 'error');
          }
        },

        addBooking: async (b) => {
          if (!useSession.getState().user) return null;
          const booking = await write({
            keys: [],
            call: (api) => api.book(b),
            done: (res, s) => ({ bookings: sortBookings([...s.bookings.filter((x) => x.id !== res.id), { ...res, mine: true }]) }),
            fail: 'Table not booked',
          });
          return booking ? { ...booking, mine: true } : null;
        },
        setBookingStatus: async (id, status) => {
          const b = get().bookings.find((x) => x.id === id);
          if (!b) return;
          // customers cancel their own; the console sets any status
          const asCustomer = useSession.getState().role !== 'admin';
          await write({
            keys: ['bookings'],
            apply: (s) => ({ bookings: s.bookings.map((x) => (x.id === id ? { ...x, status } : x)) }),
            call: (api) => (asCustomer ? api.cancelBooking(id) : api.setBookingStatus(id, status)),
            done: (res, s) => ({ bookings: s.bookings.map((x) => (x.id === id ? { ...res, mine: x.mine } : x)) }),
            fail: 'Booking not updated',
          });
        },
        toggleLike: (postId) => {
          if (!useSession.getState().user) {
            toast('Sign in to like stories', 'Your likes follow your account', 'favorite');
            return;
          }
          const on = !get().liked.includes(postId);
          void write({
            keys: ['liked', 'posts'],
            apply: (s) => ({
              liked: on ? [...s.liked, postId] : s.liked.filter((x) => x !== postId),
              posts: s.posts.map((p) => (p.id === postId ? { ...p, likes: Math.max(0, p.likes + (on ? 1 : -1)) } : p)),
            }),
            call: (api) => api.like(postId),
            done: (res, s) => ({
              liked: res.liked ? [...new Set([...s.liked, res.id])] : s.liked.filter((x) => x !== res.id),
              posts: s.posts.map((p) => (p.id === res.id ? { ...p, likes: res.likes } : p)),
            }),
            fail: 'Like not saved',
          });
        },
        setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
        setOrderNotif: (orderNotif) => set({ orderNotif }),

        /* admin */
        setStore: (p) => {
          const body: Partial<StoreSettings> = {
            ...(p.storeOpen !== undefined ? { open: p.storeOpen } : {}),
            ...(p.prep !== undefined ? { prep: p.prep } : {}),
            ...(p.fee !== undefined ? { fee: round2(p.fee) } : {}),
            ...(p.freeAt !== undefined ? { freeAt: p.freeAt } : {}),
            ...(p.sound !== undefined ? { sound: p.sound } : {}),
          };
          void write({
            keys: ['storeOpen', 'prep', 'fee', 'freeAt', 'sound'],
            apply: () => p,
            call: (api) => api.patchStore(body),
            fail: 'Settings not saved',
            catalog: true,
          });
        },
        toggleStoreOpen: () => {
          const open = get().storeOpen;
          get().setStore({ storeOpen: !open });
          toast(open ? 'Kitchen closed' : 'Kitchen open', open ? 'Customers can’t place new orders' : 'Taking orders again', open ? 'block' : 'storefront');
        },
        advanceOrder: (no) => {
          const o = orderByNo(no);
          if (!o || o.step >= 3) return;
          void write({
            keys: [],
            call: (api) => api.advanceOrder(o.id),
            done: (next) => {
              replaceOrder(next);
              const rider = next.stage === 'assigned' && next.rider ? ` · ${next.rider.name}` : '';
              toast('Status updated', `${no} → ${stepLabel(next, next.step)}${rider}`, 'sync');
            },
            fail: 'Order not updated',
          });
        },
        cancelOrder: (no) => {
          const o = orderByNo(no);
          if (!o) return;
          const paid = o.payment.status === 'paid' && o.payment.method !== 'cash';
          void write({
            keys: ['orders'],
            apply: (s) => ({ orders: s.orders.map((x) => (x.id === o.id ? { ...x, step: 4, stage: 'cancelled' } : x)) }),
            call: (api) => api.cancelOrder(o.id),
            done: (next) => {
              replaceOrder(next);
              toast('Order cancelled', paid ? `${no} · refund issued` : no, 'cancel');
            },
            fail: 'Order not cancelled',
          });
        },
        fireTicket: (no) => {
          const o = orderByNo(no);
          if (!o || o.step > 1) return;
          void write({
            keys: [],
            call: (api) => api.fireTicket(o.id),
            done: (next) => {
              replaceOrder(next);
              const ready = next.stage === 'packed';
              toast(ready ? 'Order ready' : 'Ticket fired', `${no} · ${o.customer.name}`, ready ? 'room_service' : 'eco');
            },
            fail: 'Ticket not updated',
          });
        },
        toggleKDone: (no, k) => {
          const o = orderByNo(no);
          if (!o) return;
          const done = !o.kitchen.done.includes(k);
          void write({
            keys: ['orders'],
            apply: (s) => ({
              orders: s.orders.map((x) =>
                x.id === o.id ? { ...x, kitchen: { ...x.kitchen, done: done ? [...x.kitchen.done, k] : x.kitchen.done.filter((i) => i !== k) } } : x,
              ),
            }),
            call: (api) => api.itemDone(o.id, k, done),
            done: (next) => {
              replaceOrder(next);
            },
            fail: 'Ticket not updated',
          });
        },
        toggleAvail: (id) => {
          const d = get().menu.find((m) => m.id === id);
          if (!d) return;
          void write({
            keys: ['menu'],
            apply: (s) => ({ menu: s.menu.map((p) => (p.id === id ? { ...p, avail: !p.avail } : p)) }),
            call: (api) => api.patchDish(id, { avail: !d.avail }),
            fail: 'Dish not updated',
            catalog: true,
          });
        },
        saveItem: async (e) => {
          if (!e.name.trim()) {
            toast('Name required', 'Give the dish a name first', 'error');
            return false;
          }
          const tag: Dish['tag'] = e.tag === 'None' ? '' : e.tag;
          const body = { name: e.name.trim(), price: round2(e.price), cat: e.cat, brand: e.brand || 'fire', tag, avail: e.avail, img: e.img };
          const id = e.id;
          const res = await write({
            keys: ['menu'],
            apply: id ? (s) => ({ menu: s.menu.map((p) => (p.id === id ? { ...p, ...body } : p)) }) : undefined,
            call: (api) => (id ? api.patchDish(id, body) : api.createDish({ ...body, desc: 'Freshly added to the Fig menu.', time: get().prep })),
            done: (dish, s) => {
              const { order: _o, ...d } = dish;
              return { menu: s.menu.some((p) => p.id === d.id) ? s.menu.map((p) => (p.id === d.id ? d : p)) : [...s.menu, d] };
            },
            fail: id ? 'Item not saved' : 'Item not added',
            catalog: true,
          });
          if (res) toast(id ? 'Item saved' : 'Item added', body.name, 'check');
          return !!res;
        },
        deleteItem: (id) => {
          const d = get().menu.find((m) => m.id === id);
          void write({
            keys: ['menu', 'cart', 'saved'],
            apply: (s) => ({ menu: s.menu.filter((p) => p.id !== id), cart: s.cart.filter((c) => c.id !== id), saved: s.saved.filter((x) => x !== id) }),
            call: (api) => api.deleteDish(id),
            done: () => {
              if (d) toast('Item deleted', d.name, 'delete');
            },
            fail: 'Item not deleted',
            catalog: true,
          });
        },
        toggleCat: (name) => {
          const cat = get().cats.find((x) => x.name === name);
          if (!cat) return;
          void write({
            keys: ['cats'],
            apply: (s) => ({ cats: s.cats.map((x) => (x.name === name ? { ...x, on: !x.on } : x)) }),
            call: (api) => api.patchCategory(cat.id, { on: !cat.on }),
            fail: 'Category not updated',
            catalog: true,
          });
        },
        moveCat: (i, d) => {
          const a = move(get().cats, i, d);
          if (!a) return;
          void write({
            keys: ['cats'],
            apply: () => ({ cats: a }),
            call: (api) =>
              api.reorder(
                'categories',
                a.map((x) => x.id),
              ),
            fail: 'Order not saved',
            catalog: true,
          });
        },
        addCat: async (name) => {
          const n = name.trim();
          if (!n) return false;
          if (get().cats.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
            toast('Already exists', n, 'error');
            return false;
          }
          const res = await write({
            keys: [],
            call: (api) => api.createCategory(n),
            done: (c, s) => ({ cats: [...s.cats, { id: c.id, name: c.name, on: c.on, img: c.img }] }),
            fail: 'Category not added',
            catalog: true,
          });
          if (res) toast('Category added', `${n} · assign dishes from Menu items`, 'category');
          return !!res;
        },
        toggleBrand: (id) => {
          const b = get().brands.find((x) => x.id === id);
          if (!b) return;
          void write({
            keys: ['brands'],
            apply: (s) => ({ brands: s.brands.map((x) => (x.id === id ? { ...x, on: !x.on } : x)) }),
            call: (api) => api.patchBrand(id, { on: !b.on }),
            fail: 'Kitchen not updated',
            catalog: true,
          });
        },
        createBrand: async (b) => {
          try {
            const created = await server().createBrand({ ...b, manualStatus: b.manualStatus ?? 'auto' });
            set((s) => ({ brands: [...s.brands, { ...created, icon: created.icon as IconName }] }));
            server().catalogChanged();
            toast('Kitchen added', created.name, 'storefront');
            return true;
          } catch (e) {
            toast('Kitchen not added', server().errorMessage(e), 'error');
            return false;
          }
        },
        deleteBrand: async (id) => {
          const brand = get().brands.find((x) => x.id === id);
          if (!brand) return false;
          try {
            await server().deleteBrand(id);
            set((s) => ({ brands: s.brands.filter((x) => x.id !== id) }));
            server().catalogChanged();
            toast('Kitchen deleted', brand.name, 'delete');
            return true;
          } catch (e) {
            toast('Kitchen not deleted', server().errorMessage(e), 'error');
            return false;
          }
        },
        saveBrand: async (b) => {
          const res = await write({
            keys: ['brands'],
            apply: (s) => ({ brands: s.brands.map((x) => (x.id === b.id ? { ...b } : x)) }),
            call: (api) => api.patchBrand(b.id, { name: b.name, tag: b.tag, icon: b.icon, img: b.img, on: b.on, lat: b.lat, lng: b.lng, address: b.address, phone: b.phone, description: b.description, workDays: b.workDays, openTime: b.openTime, closeTime: b.closeTime, manualStatus: b.manualStatus, deliveryFee: b.deliveryFee, prepTime: b.prepTime }),
            fail: 'Kitchen not saved',
            catalog: true,
          });
          if (res) toast('Kitchen saved', b.name, 'storefront');
          return !!res;
        },
        toggleSection: (k) => {
          const x = get().secs.find((y) => y.k === k);
          if (!x) return;
          void write({
            keys: ['secs'],
            apply: (s) => ({ secs: s.secs.map((y) => (y.k === k ? { ...y, on: !y.on } : y)) }),
            call: (api) => api.patchSection(k, { on: !x.on }),
            fail: 'Section not updated',
            catalog: true,
          });
        },
        moveSection: (i, d) => {
          const a = move(get().secs, i, d);
          if (!a) return;
          void write({
            keys: ['secs'],
            apply: () => ({ secs: a }),
            call: (api) =>
              api.reorder(
                'sections',
                a.map((x) => x.k),
              ),
            fail: 'Order not saved',
            catalog: true,
          });
        },
        toggleBanner: (id) => {
          const b = get().banners.find((y) => y.id === id);
          if (!b) return;
          void write({
            keys: ['banners'],
            apply: (s) => ({ banners: s.banners.map((y) => (y.id === id ? { ...y, on: !y.on } : y)) }),
            call: (api) => api.patchBanner(id, { on: !b.on }),
            fail: 'Banner not updated',
            catalog: true,
          });
        },
        moveBanner: (i, d) => {
          const a = move(get().banners, i, d);
          if (!a) return;
          void write({
            keys: ['banners'],
            apply: () => ({ banners: a }),
            call: (api) =>
              api.reorder(
                'banners',
                a.map((x) => x.id),
              ),
            fail: 'Order not saved',
            catalog: true,
          });
        },
        setDeal: (d) => {
          void write({
            keys: ['deal', 'cart'],
            apply: (s) => {
              const deal = { ...s.deal, ...d };
              return { deal, cart: s.cart.map((l) => settleLine(l, deal)) };
            },
            call: (api) => api.patchDeal(d),
            done: (deal, s) => ({ deal, cart: s.cart.map((l) => settleLine(l, deal)) }),
            fail: 'Deal not saved',
            catalog: true,
          });
        },
        savePost: async (e) => {
          if (!e.title.trim()) {
            toast('Title required', 'Give the story a headline', 'error');
            return false;
          }
          const exists = !!e.id && get().posts.some((p) => p.id === e.id);
          const body = {
            title: e.title.trim(),
            cat: e.cat,
            img: e.img,
            author: e.author,
            featured: e.featured,
            on: e.on,
            dish: e.dish,
            excerpt: e.excerpt,
            body: e.body,
          };
          const res = await write({
            keys: ['posts'],
            apply: exists ? (s) => ({ posts: s.posts.map((p) => (p.id === e.id ? { ...p, ...body } : p)) }) : undefined,
            call: (api) => (exists ? api.patchPost(e.id, body) : api.createPost(body)),
            done: (post, s) => {
              let posts = s.posts.some((p) => p.id === post.id) ? s.posts.map((p) => (p.id === post.id ? post : p)) : [post, ...s.posts];
              if (post.featured) posts = posts.map((p) => ({ ...p, featured: p.id === post.id }));
              return { posts };
            },
            fail: 'Story not saved',
            catalog: true,
          });
          if (res) toast(e.on ? 'Story published' : 'Draft saved', e.title, e.on ? 'public' : 'edit_note');
          return !!res;
        },
        deletePost: (id) => {
          const p = get().posts.find((x) => x.id === id);
          void write({
            keys: ['posts'],
            apply: (s) => ({ posts: s.posts.filter((x) => x.id !== id) }),
            call: (api) => api.deletePost(id),
            done: () => {
              if (p) toast('Story deleted', p.title, 'delete');
            },
            fail: 'Story not deleted',
            catalog: true,
          });
        },
        togglePost: (id) => {
          const p = get().posts.find((x) => x.id === id);
          if (!p) return;
          void write({
            keys: ['posts'],
            apply: (s) => ({ posts: s.posts.map((x) => (x.id === id ? { ...x, on: !x.on } : x)) }),
            call: (api) => api.patchPost(id, { on: !p.on }),
            done: () => toast(p.on ? 'Moved to drafts' : 'Story published', p.title, p.on ? 'edit_note' : 'public'),
            fail: 'Story not updated',
            catalog: true,
          });
        },
        addPromo: async (code, pct) => {
          const c = code.trim().toUpperCase();
          if (!c) {
            toast('Code required', 'Type a code first', 'error');
            return false;
          }
          if (get().promos.some((p) => p.code === c)) {
            toast('Already exists', c, 'error');
            return false;
          }
          const res = await write({
            keys: ['promos'],
            apply: (s) => ({ promos: [{ code: c, pct, used: 0, on: true }, ...s.promos] }),
            call: (api) => api.createPromo(c, pct),
            done: (p, s) => ({ promos: s.promos.map((x) => (x.code === p.code ? p : x)) }),
            fail: 'Promo not created',
            catalog: true,
          });
          if (res) toast('Promo created', `${c} · ${pct}% off`, 'sell');
          return !!res;
        },
        togglePromo: (code) => {
          const p = get().promos.find((x) => x.code === code);
          if (!p) return;
          void write({
            keys: ['promos'],
            apply: (s) => ({ promos: s.promos.map((y) => (y.code === code ? { ...y, on: !y.on } : y)) }),
            call: (api) => api.patchPromo(code, !p.on),
            fail: 'Promo not updated',
            catalog: true,
          });
        },
        replyReview: (id) => {
          const r = get().reviews.find((x) => x.id === id);
          if (!r) return;
          void write({
            keys: ['reviews'],
            apply: (s) => ({ reviews: s.reviews.map((x) => (x.id === id ? { ...x, replied: true } : x)) }),
            call: (api) => api.replyReview(id),
            done: (res, s) => {
              toast('Reply sent', 'To ' + r.name.split(' ')[0], 'reply');
              return { reviews: s.reviews.map((x) => (x.id === id ? res : x)) };
            },
            fail: 'Reply not sent',
          });
        },

        /** Settings → Reset demo data: this phone's cart, addresses, wallet and inbox (the account and menu are the server's). */
        resetDemo: () => {
          const fresh = initialState();
          set({
            saved: fresh.saved,
            cart: [],
            promo: null,
            promoDraft: '',
            addrs: fresh.addrs,
            addr: 0,
            cards: fresh.cards,
            defCard: fresh.defCard,
            payM: 0,
            inbox: fresh.inbox,
            prefs: fresh.prefs,
          });
        },
      };
    },
    {
      name: 'fig-app',
      version: 3,
      storage: createJSONStorage(() => deviceStorage),
      /**
       * What survives a relaunch: the cached catalog (so the menu opens instantly and offline), the cart,
       * saved dishes, addresses, the demo card wallet, notifications, settings and theme, and the account's
       * last-known orders and points (refreshed as soon as the server answers).
       */
      partialize: (s) => ({
        onboarded: s.onboarded,
        theme: s.theme,
        catalogVersion: s.catalogVersion,
        catalogEtag: s.catalogEtag,
        menu: s.menu,
        cats: s.cats,
        brands: s.brands,
        banners: s.banners,
        secs: s.secs,
        deal: s.deal,
        posts: s.posts,
        storeOpen: s.storeOpen,
        prep: s.prep,
        fee: s.fee,
        freeAt: s.freeAt,
        sound: s.sound,
        customerLocation: s.customerLocation,
        saved: s.saved,
        cart: s.cart,
        mode: s.mode,
        addrs: s.addrs,
        addr: s.addr,
        speed: s.speed,
        payM: s.payM,
        cards: s.cards,
        defCard: s.defCard,
        inbox: s.inbox,
        prefs: s.prefs,
        orderNotif: s.orderNotif,
        points: s.points,
        credit: s.credit,
        redeemed: s.redeemed,
        vouchers: s.vouchers,
        liked: s.liked,
        orders: s.orders,
        bookings: s.bookings.filter((b) => b.mine),
      }),
      // version 1 (before the API) cached no catalog or account: keep its cart and settings, the rest comes fresh
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<State>;
        if (version < 2) {
          const { cart, saved, addrs, addr, cards, defCard, inbox, prefs, theme, onboarded, orderNotif, mode, speed, payM } = p;
          return { cart, saved, addrs, addr, cards, defCard, inbox, prefs: { ...prefs, lang: 'العربية' }, theme, onboarded, orderNotif, mode, speed, payM } as AppStore;
        }
        if (version < 3) return { ...p, prefs: { ...p.prefs, lang: 'العربية' } } as AppStore;
        return p as AppStore;
      },
    },
  ),
);

/** The saved catalog, cart, wallet and settings have loaded from the device. */
export const useAppHydrated = () => {
  const [hydrated, setHydrated] = useState(() => useApp.persist.hasHydrated());
  useEffect(() => {
    if (useApp.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useApp.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
};

/* ------------------------------------------------------------------ selectors */

export const selectLiveMenu = (s: AppStore): Dish[] => {
  const cats = new Set(s.cats.filter((c) => c.on).map((c) => c.name));
  const offBrands = new Set(s.brands.filter((b) => !b.on).map((b) => b.id));
  return s.menu.filter((p) => cats.has(p.cat) && !offBrands.has(p.brand));
};

/** The console's orders: paid, cash or being paid — never an abandoned card checkout. */
export const selectBoard = (s: AppStore): Order[] => s.orders.filter((o) => ['due', 'paid'].includes(o.payment.status));

/** The signed-in customer's own orders (the console also loads everyone else's). */
export const selectMyOrders = (s: AppStore): Order[] => {
  const me = useSession.getState().user?.uid;
  return me ? s.orders.filter((o) => o.uid === me) : [];
};
export const selectCartCount = (s: AppStore): number => s.cart.reduce((a, c) => a + c.q, 0);
export const selectUnread = (s: AppStore): number => s.inbox.filter((n) => n.unread).length;
export const selectBanners = (s: AppStore): Banner[] => s.banners.filter((b) => b.on);
export const selectDefaultCard = (s: AppStore): Card | undefined => s.cards.find((c) => c.id === s.defCard);

/** Apple Pay on iPhone, Google Pay on Android — the online checkout supports. */
export const WALLET = process.env.EXPO_OS === 'android' ? 'Google Pay' : 'Apple Pay';

export const payLabel = (s: AppStore, short = false): string => {
  if (s.payM === 0) return WALLET;
  if (s.payM === 2) return short ? 'Cash' : 'Cash on delivery';
  if (s.payM === 3) return short ? 'Wallet' : 'Mobile Wallet';
  return short ? 'Card' : 'Credit or debit card';
};
