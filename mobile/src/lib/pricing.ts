/*
 * Pricing comes from `@fig/shared`, the same functions the server charges with, so the total the app
 * shows is the total the order is placed for. (They're the local edition's lib/pricing.ts, unchanged in
 * arithmetic; the server adds `settleLine` and the credit option.)
 */
export { SPEEDS, computeTotals, extrasOf, lineMeta, lineUnit, round2, settleLine, sizesOf, unitOf, type Totals } from '@fig/shared';
