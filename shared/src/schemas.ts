import { z } from 'zod';

import { POST_CATS, SEAT_AREAS } from './menu';
import { OrderStage, Role } from './roles';

/*
 * The Fig & Fennel domain model and API contract. The server validates requests (and its own responses)
 * with these schemas; the app types its API calls with them. Field names follow the local edition's
 * types (src/data/types.ts) so the screens change as little as possible; server-only fields (ids,
 * timestamps, uid, stage, timeline, payment) are added where an entity needs them.
 */

const id = z.string().min(1).max(64);
const url = z.url().max(2048);
const money = z.number().min(0).max(10_000);
/** epoch milliseconds */
const ms = z.number().int();

/* ---------- catalog ---------- */

export const DishTag = z.enum(['', 'Bestseller', 'New', 'Spicy']);
export type DishTag = z.infer<typeof DishTag>;

export const Dish = z.object({
  id,
  name: z.string().min(1).max(80),
  /** category name */
  cat: z.string().min(1).max(40),
  price: money,
  rating: z.number().min(0).max(5),
  reviews: z.number().int().min(0),
  /** prep time in minutes */
  time: z.number().int().min(1).max(240),
  kcal: z.number().int().min(0).max(10_000),
  img: url,
  tag: DishTag,
  desc: z.string().max(600),
  avail: z.boolean(),
  /** kitchen (brand) id */
  brand: id,
  /** position on the menu */
  order: z.number().int(),
});
export type Dish = z.infer<typeof Dish>;

export const Category = z.object({
  id,
  name: z.string().min(1).max(40),
  on: z.boolean(),
  /** tile photo (the first dish's photo when not set) */
  img: url.optional(),
  order: z.number().int(),
});
export type Category = z.infer<typeof Category>;

export const Brand = z.object({
  id,
  name: z.string().min(1).max(60),
  tag: z.string().max(80),
  /** Material Symbols glyph name */
  icon: z.string().min(1).max(40),
  img: url,
  on: z.boolean(),
  /** Verified kitchen location. Null keeps legacy catalog entries readable until an admin pins them. */
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  address: z.string().max(240).default(''),
  phone: z.string().max(30).default(''),
  description: z.string().max(600).default(''),
  workDays: z.array(z.enum(['sat','sun','mon','tue','wed','thu','fri'])).default([]),
  openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:00'),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('23:00'),
  manualStatus: z.enum(['auto', 'open', 'closed']).default('auto'),
  deliveryFee: money.nullable().default(null),
  prepTime: z.number().int().min(1).max(240).default(30),
  order: z.number().int(),
});
export type Brand = z.infer<typeof Brand>;
export const BrandInput = z.object({
  name: Brand.shape.name,
  tag: Brand.shape.tag,
  icon: Brand.shape.icon,
  img: Brand.shape.img,
});
export type BrandInput = z.infer<typeof BrandInput>;


export const Banner = z.object({
  id,
  /** eyebrow label */
  eb: z.string().max(40),
  title: z.string().min(1).max(80),
  cta: z.string().max(30),
  /** opens the menu on this category ('All' for everything) */
  cat: z.string().max(40).optional(),
  /** or opens this dish */
  dish: id.optional(),
  img: url,
  on: z.boolean(),
  order: z.number().int(),
});
export type Banner = z.infer<typeof Banner>;

export const HomeSectionKey = z.enum(['hero', 'cats', 'deal', 'brands', 'popular', 'again', 'reserve', 'rated', 'journal']);
export type HomeSectionKey = z.infer<typeof HomeSectionKey>;

/** One Home screen section; `sections` in the catalog is in display order. */
export const HomeSection = z.object({ k: HomeSectionKey, l: z.string().max(40), icon: z.string().max(40), on: z.boolean() });
export type HomeSection = z.infer<typeof HomeSection>;

/** Deal of the day: `pct` off one dish. */
export const Deal = z.object({ id: z.string().max(64), pct: z.number().int().min(5).max(90), on: z.boolean() });
export type Deal = z.infer<typeof Deal>;

/** Store settings the console edits (Fig's storeOpen, prep, fee, freeAt, sound). */
export const StoreSettings = z.object({
  /** taking orders */
  open: z.boolean(),
  /** typical prep time in minutes */
  prep: z.number().int().min(1).max(120),
  /** delivery fee */
  fee: money,
  /** free delivery from this subtotal */
  freeAt: money,
  /** kitchen display chime for new tickets */
  sound: z.boolean(),
});
export type StoreSettings = z.infer<typeof StoreSettings>;

export const PostCategory = z.enum(POST_CATS);
export type PostCategory = z.infer<typeof PostCategory>;

export const Post = z.object({
  id,
  title: z.string().min(1).max(140),
  cat: PostCategory,
  img: url,
  author: z.string().max(60),
  /** display date, e.g. "Oct 10" */
  date: z.string().max(20),
  /** reading time */
  mins: z.number().int().min(1).max(120),
  featured: z.boolean(),
  /** published (false = draft) */
  on: z.boolean(),
  /** the dish the story links to */
  dish: id.nullable(),
  likes: z.number().int().min(0),
  excerpt: z.string().max(400),
  body: z.string().max(20_000),
});
export type Post = z.infer<typeof Post>;

export const PromoCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,20}$/, 'Use 3–20 letters or digits');

export const Promo = z.object({
  code: z.string(),
  pct: z.number().int().min(5).max(50),
  used: z.number().int().min(0),
  on: z.boolean(),
});
export type Promo = z.infer<typeof Promo>;

/** Everything the customer app reads to render the menu and Home, in one cacheable response. */
export const Catalog = z.object({
  /** increases with every console change — also the response ETag */
  version: z.number().int(),
  dishes: z.array(Dish),
  categories: z.array(Category),
  brands: z.array(Brand),
  banners: z.array(Banner),
  sections: z.array(HomeSection),
  deal: Deal,
  /** published stories only, newest first */
  posts: z.array(Post),
  store: StoreSettings,
});
export type Catalog = z.infer<typeof Catalog>;

/** The console's catalog: drafts included, plus the promo codes. */
export const AdminCatalog = Catalog.extend({ promos: z.array(Promo) });
export type AdminCatalog = z.infer<typeof AdminCatalog>;

/* ---------- cart & orders ---------- */

export const CartLine = z.object({
  /** dish id */
  id,
  /** size index */
  s: z.number().int().min(0).max(5),
  /** extra ids */
  ex: z.array(z.string().max(20)).max(8),
  q: z.number().int().min(1).max(20),
  /** bought through the deal of the day or a reward (a discounted line) */
  deal: z.boolean().optional(),
  /** the discount on a deal line; 100 for a reward */
  dealPct: z.number().min(0).max(100).optional(),
  /** a redeemed reward voucher (Me.vouchers[].id) — the line is free */
  voucher: z.string().max(64).optional(),
});
export type CartLine = z.infer<typeof CartLine>;

export const FulfilmentMode = z.enum(['delivery', 'pickup']);
export type FulfilmentMode = z.infer<typeof FulfilmentMode>;

/** Cash goes straight to the kitchen; online card orders are paid through Kashier Direct API. */
export const PayMethod = z.enum(['cash', 'card', 'apple_pay', 'google_pay', 'wallet']);
export type PayMethod = z.infer<typeof PayMethod>;

export const PayStatus = z.enum(['due', 'awaiting_payment', 'processing', 'paid', 'failed', 'canceled', 'refunded']);
export type PayStatus = z.infer<typeof PayStatus>;

export const OrderStepSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const AddressSnapshot = z.object({
  tag: z.string().max(30),
  l1: z.string().min(1).max(120),
  l2: z.string().max(120),
  note: z.string().max(200),
  /** leave at the door */
  door: z.boolean().optional(),
  /** who to call about this delivery */
  phone: z.string().max(30).optional(),
  /** exact drop-off pin captured from the address map */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type AddressSnapshot = z.infer<typeof AddressSnapshot>;

/** A priced line, frozen at order time (so history survives menu edits). */
export const OrderItem = CartLine.extend({
  name: z.string(),
  /** size and extras, e.g. '12" · Extra cheese' (lineMeta) */
  meta: z.string(),
  /** unit price charged */
  unit: z.number(),
});
export type OrderItem = z.infer<typeof OrderItem>;

/** The delivery rider an order is assigned to. */
export const Rider = z.object({ uid: z.string(), name: z.string(), phone: z.string().nullable() });
export type Rider = z.infer<typeof Rider>;

/** One fulfilment step: who moved the order, and when. */
export const OrderEvent = z.object({
  stage: OrderStage,
  at: ms,
  by: z.object({ uid: z.string(), name: z.string(), role: Role }).nullable(),
  note: z.string().max(300).optional(),
});
export type OrderEvent = z.infer<typeof OrderEvent>;

export const Kitchen = z.object({
  /** the kitchen started cooking (fireTicket) */
  fired: z.boolean(),
  firedAt: ms.nullable(),
  /** item indexes ticked off on the kitchen display / packer's checklist (toggleKDone) */
  done: z.array(z.number().int().min(0)),
});
export type Kitchen = z.infer<typeof Kitchen>;

/** Immutable map snapshot captured when the order is placed. */
export const OrderLocations = z.object({
  restaurants: z.array(z.object({
    id: id,
    name: z.string(),
    image: z.string().max(2048),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    address: z.string().max(240),
  })).default([]),
  customer: z.object({
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    image: z.string().max(2048).nullable(),
  }),
});
export type OrderLocations = z.infer<typeof OrderLocations>;

export const Order = z.object({
  /** the same as `no` — orders are addressed by their number */
  id,
  /** "EK-4822" */
  no: z.string(),
  uid: z.string(),
  customer: z.object({ name: z.string(), email: z.string(), phone: z.string().nullable() }),
  placedAt: ms,
  /** the customer's view of `stage` (stepOfStage) */
  step: OrderStepSchema,
  /** where the order is in the restaurant: call center → packer → warehouse → rider */
  stage: OrderStage,
  rider: Rider.nullable(),
  /** each stage reached, oldest first */
  timeline: z.array(OrderEvent),
  items: z.array(OrderItem),
  subtotal: z.number(),
  fee: z.number(),
  speedFee: z.number(),
  /** promo discount */
  discount: z.number(),
  /** Fig credit spent on this order */
  credit: z.number(),
  total: z.number(),
  mode: FulfilmentMode,
  /** 0 Standard · 1 Priority */
  speed: z.number().int().min(0).max(1),
  address: AddressSnapshot.nullable(),
  /** restaurant and customer pins frozen for this order */
  locations: OrderLocations.optional(),
  note: z.string(),
  promo: z.string().nullable(),
  /** payment label, e.g. "Apple Pay", "Visa •••• 4242", "Cash" */
  pay: z.string(),
  payment: z.object({ method: PayMethod, status: PayStatus }),
  kitchen: Kitchen,
  /** stars, once rated */
  rated: z.number().int().min(1).max(5).optional(),
  tip: z.number().optional(),
  /** being moved along by the server's demo kitchen (DEMO_KITCHEN_SECONDS) */
  live: z.boolean(),
});
export type Order = z.infer<typeof Order>;

export const CreateOrder = z.object({
  items: z.array(CartLine).min(1).max(50),
  mode: FulfilmentMode,
  /** 0 Standard · 1 Priority (ignored for pickup) */
  speed: z.number().int().min(0).max(1),
  address: AddressSnapshot.nullable(),
  note: z.string().max(300).default(''),
  promo: z.string().max(20).nullable().default(null),
  method: PayMethod,
  /** display label for the payment, e.g. "Visa •••• 4242" */
  payLabel: z.string().max(40).optional(),
  /** spend the account's Fig credit on this order */
  useCredit: z.boolean().default(false),
  /** the total the customer saw — the server refuses the order (409 price_changed) if its own differs */
  expectedTotal: money,
});
export type CreateOrder = z.input<typeof CreateOrder>;

/** Kashier hosted checkout session returned by the server. */
export const KashierCheckout = z.object({ sessionId: z.string(), sessionUrl: z.string().url() });
export type KashierCheckout = z.infer<typeof KashierCheckout>;

export const CreateOrderResult = z.object({ order: Order, payment: KashierCheckout.nullable() });
export type CreateOrderResult = z.infer<typeof CreateOrderResult>;

export const RateOrder = z.object({
  stars: z.number().int().min(1).max(5),
  tags: z.array(z.string().max(40)).max(10).default([]),
  text: z.string().max(1000).default(''),
  tip: z.number().min(0).max(100).default(0),
});
export type RateOrder = z.input<typeof RateOrder>;

export const ReportIssue = z.object({
  /** index into ISSUE_TYPES */
  type: z.number().int().min(0).max(4),
  text: z.string().max(1000).default(''),
});
export type ReportIssue = z.input<typeof ReportIssue>;

/** A problem not tied to an order (from Help). */
export const ReportGeneralIssue = ReportIssue.extend({ orderId: z.string().max(64).nullable().default(null) });

export const IssueResult = z.object({
  /** whether this report added Fig credit (once per order) */
  credited: z.boolean(),
  /** the account's Fig credit now */
  credit: z.number(),
});
export type IssueResult = z.infer<typeof IssueResult>;

/* ---------- account ---------- */

/** A redeemed dish reward, waiting to be added to the cart (CartLine.voucher = id). */
export const Voucher = z.object({ id, reward: id, dish: id, s: z.number().int().min(0) });
export type Voucher = z.infer<typeof Voucher>;

export const Me = z.object({
  uid: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  photo: z.string().nullable(),
  /** sign-in method: password, google.com, apple.com */
  provider: z.string(),
  /** what this account can do — `user` for customers */
  role: Role,
  /** role === 'admin' */
  admin: z.boolean(),
  /** Fig Club */
  points: z.number().int(),
  tier: z.enum(['Bronze', 'Silver', 'Gold', 'Platinum']),
  /** Fig credit, in dollars */
  credit: z.number(),
  /** reward ids already redeemed */
  redeemed: z.array(z.string()),
  vouchers: z.array(Voucher),
  /** journal posts this account liked */
  liked: z.array(z.string()),
});
export type Me = z.infer<typeof Me>;

export const UpdateMe = z
  .object({ name: z.string().trim().min(1).max(80), phone: z.string().trim().max(30).nullable() })
  .partial();
export type UpdateMe = z.infer<typeof UpdateMe>;

export const LikeResult = z.object({ id: z.string(), liked: z.boolean(), likes: z.number().int() });
export type LikeResult = z.infer<typeof LikeResult>;

/* ---------- bookings & reviews ---------- */

/** 0 Booked · 1 Seated · 2 Cancelled */
export const BookingStatus = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type BookingStatus = z.infer<typeof BookingStatus>;

export const Booking = z.object({
  id,
  /** "R-2841" */
  code: z.string(),
  uid: z.string().nullable(),
  name: z.string(),
  party: z.number().int().min(1).max(10),
  /** '7:30' (evening) */
  time: z.string().regex(/^\d{1,2}:\d{2}$/),
  seat: z.string().max(40),
  status: BookingStatus,
  /** YYYY-MM-DD in the restaurant's time zone (the app's `day` offset is days from today) */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occ: z.string().max(40).nullable(),
  req: z.string().max(500),
});
export type Booking = z.infer<typeof Booking>;

export const CreateBooking = z.object({
  party: Booking.shape.party,
  time: Booking.shape.time,
  seat: z.enum(SEAT_AREAS),
  date: Booking.shape.date,
  occ: Booking.shape.occ.default(null),
  req: Booking.shape.req.default(''),
});
export type CreateBooking = z.input<typeof CreateBooking>;

export const Review = z.object({
  id,
  name: z.string(),
  stars: z.number().int().min(1).max(5),
  text: z.string(),
  dish: z.string(),
  /** epoch ms — the app shows "2h ago" */
  at: ms,
  replied: z.boolean(),
  reply: z.string().nullable(),
});
export type Review = z.infer<typeof Review>;

export const CustomerTier = z.enum(['Regular', 'VIP', 'New']);

export const Customer = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  addr: z.string(),
  phone: z.string(),
  tier: CustomerTier,
  orders: z.number().int(),
  spent: z.number(),
});
export type Customer = z.infer<typeof Customer>;

/* ---------- console writes ---------- */

/** The item editor (Fig's ItemDraft); 'None' is accepted for no badge. */
export const DishInput = z.object({
  name: z.string().trim().min(1).max(80),
  price: z.number().min(0.5).max(1000),
  cat: z.string().min(1).max(40),
  brand: id,
  tag: z
    .enum(['', 'None', 'Bestseller', 'New', 'Spicy'])
    .transform((t) => (t === 'None' ? '' : t))
    .default(''),
  avail: z.boolean().default(true),
  img: url,
  desc: z.string().max(600).optional(),
  time: z.number().int().min(1).max(240).optional(),
  kcal: z.number().int().min(0).max(10_000).optional(),
});
export type DishInput = z.input<typeof DishInput>;
export const DishPatch = z.object({
  name: DishInput.shape.name,
  price: DishInput.shape.price,
  cat: DishInput.shape.cat,
  brand: DishInput.shape.brand,
  tag: z.enum(['', 'None', 'Bestseller', 'New', 'Spicy']).transform((t) => (t === 'None' ? '' : t)),
  avail: z.boolean(),
  img: url,
  desc: z.string().max(600),
  time: z.number().int().min(1).max(240),
  kcal: z.number().int().min(0).max(10_000),
}).partial();
export type DishPatch = z.input<typeof DishPatch>;

export const CategoryInput = z.object({ name: z.string().trim().min(1).max(40) });
export const CategoryPatch = z.object({ on: z.boolean(), img: url }).partial();
export const BrandPatch = z.object({
  name: Brand.shape.name,
  tag: Brand.shape.tag,
  icon: Brand.shape.icon,
  img: Brand.shape.img,
  on: Brand.shape.on,
  lat: Brand.shape.lat,
  lng: Brand.shape.lng,
  address: Brand.shape.address,
  phone: Brand.shape.phone,
  description: Brand.shape.description,
  workDays: Brand.shape.workDays,
  openTime: Brand.shape.openTime,
  closeTime: Brand.shape.closeTime,
  manualStatus: Brand.shape.manualStatus,
  deliveryFee: Brand.shape.deliveryFee,
  prepTime: Brand.shape.prepTime,
}).partial();
export const BannerPatch = z.object({
  eb: Banner.shape.eb,
  title: Banner.shape.title,
  cta: Banner.shape.cta,
  cat: Banner.shape.cat,
  dish: Banner.shape.dish,
  img: Banner.shape.img,
  on: Banner.shape.on,
}).partial();
export const SectionPatch = z.object({ on: z.boolean(), l: z.string().min(1).max(40) }).partial();
export const DealPatch = Deal.partial();
export const StorePatch = StoreSettings.partial();
export const PromoInput = z.object({ code: PromoCode, pct: z.number().int().min(5).max(50) });
export const PromoPatch = z.object({ on: z.boolean() });
export const PostInput = z.object({
  title: z.string().trim().min(1).max(140),
  cat: PostCategory,
  img: url,
  author: z.string().max(60),
  featured: z.boolean().default(false),
  on: z.boolean().default(false),
  dish: id.nullable().default(null),
  excerpt: z.string().max(400).default(''),
  body: z.string().max(20_000).default(''),
});
export type PostInput = z.input<typeof PostInput>;
export const PostPatch = z.object({
  title: PostInput.shape.title,
  cat: PostCategory,
  img: url,
  author: z.string().max(60),
  featured: z.boolean(),
  on: z.boolean(),
  dish: id.nullable(),
  excerpt: z.string().max(400),
  body: z.string().max(20_000),
}).partial();
/** ids (or section keys) in their new order */
export const Reorder = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(200) });

/** Move an order to another stage (see movesFor in roles.ts for who may). */
export const AdvanceOrder = z.object({
  to: OrderStage,
  /** the rider, when assigning */
  riderUid: z.string().min(1).max(128).optional(),
  note: z.string().max(300).optional(),
});
export type AdvanceOrder = z.infer<typeof AdvanceOrder>;

/** The console's one-tap advance: `to` defaults to the next stage, a rider is picked if needed. */
export const AdminAdvanceOrder = AdvanceOrder.partial();

/** The call center corrects the delivery address or contact before the order is packed. */
export const OrderContactPatch = z
  .object({ address: AddressSnapshot, phone: z.string().trim().max(30).nullable(), note: z.string().max(300) })
  .partial();
export type OrderContactPatch = z.infer<typeof OrderContactPatch>;

/** Tick an item off (or set it explicitly). */
export const ItemDonePatch = z.object({ done: z.boolean().optional() });

export const BookingStatusPatch = z.object({ status: BookingStatus });

/* ---------- users and roles (admin) ---------- */

/** An account as the console's Users & roles screen shows it. */
export const UserRow = z.object({
  uid: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  role: Role,
  disabled: z.boolean(),
  /** sign-in method: password, google.com, apple.com — `demo` for seeded customers */
  provider: z.string(),
  createdAt: ms.nullable(),
  orders: z.number().int(),
  spent: z.number(),
});
export type UserRow = z.infer<typeof UserRow>;

export const CreateUser = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email().max(120)),
  /** first password; they can change it with "Forgot password" */
  password: z.string().min(8).max(128),
  role: Role,
  phone: z.string().trim().max(30).nullable().optional(),
});
export type CreateUser = z.input<typeof CreateUser>;

export const UserPatch = z
  .object({ role: Role, disabled: z.boolean(), name: z.string().trim().min(1).max(80), phone: z.string().trim().max(30).nullable() })
  .partial();
export type UserPatch = z.infer<typeof UserPatch>;

/* ---------- errors ---------- */

/** Every error response: `{ error: { code, message, details? } }`. */
export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
export type ApiError = z.infer<typeof ApiError>;
