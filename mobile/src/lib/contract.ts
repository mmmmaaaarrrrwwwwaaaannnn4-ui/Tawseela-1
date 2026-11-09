/*
 * The API contract the app codes against — `@fig/shared` (fullstack/shared): the Zod schemas of every
 * entity, request and response, the pricing rules, roles and the order workflow. The server validates
 * with the same schemas, so both sides agree. App-only helpers on top live here.
 */
import { ApiError as ApiErrorSchema, Role, type Order, type KashierCheckout, type Rider } from '@fig/shared';

export * from '@fig/shared';

export const isRole = (v: unknown): v is Role => Role.safeParse(v).success;

/** Every error response: `{ error: { code, message, details? } }`. */
export type ApiErrorBody = ApiErrorSchema;
export const isApiErrorBody = (v: unknown): v is ApiErrorBody => ApiErrorSchema.safeParse(v).success;

/** An order as the team queue (GET /v1/ops/orders) returns it — the same Order every endpoint uses. */
export type OpsOrder = Order;

/** GET /v1/ops/riders — active delivery riders with how many orders they have on the road. */
export type RiderLoad = Rider & { active: number };

/** POST /v1/admin/uploads (multipart, field `file`, optional `folder`) */
export type UploadResult = { url: string; fileId: string };

/** What POST /v1/orders returns for a card / wallet order: the Kashier checkout session URL. */
export type KashierCheckoutInit = KashierCheckout;
