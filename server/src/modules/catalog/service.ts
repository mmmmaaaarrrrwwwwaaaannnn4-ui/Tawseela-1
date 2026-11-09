import { Banner, Brand, Category, Deal, Dish, HomeSection, Post, Promo, StoreSettings, type AdminCatalog } from '@fig/shared';
import type { Firestore, QuerySnapshot } from 'firebase-admin/firestore';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import { COL, catalogMetaRef, homeRef, storeRef } from '../../lib/collections';

/** Parses each document against its schema; a malformed one is skipped (and logged) rather than failing the catalog. */
function parseDocs<T extends z.ZodType>(snap: QuerySnapshot, schema: T, log: FastifyBaseLogger, idField = 'id'): z.infer<T>[] {
  const out: z.infer<T>[] = [];
  for (const d of snap.docs) {
    const r = schema.safeParse({ [idField]: d.id, ...d.data() });
    if (r.success) out.push(r.data);
    else log.warn({ doc: d.ref.path, issues: r.error.issues.slice(0, 3) }, 'skipping malformed document');
  }
  return out;
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

export const DEFAULT_STORE: StoreSettings = { open: true, prep: 18, fee: 2.99, freeAt: 40, sound: true };
export const NO_DEAL: Deal = { id: '', pct: 25, on: false };

export const readStore = (data: unknown): StoreSettings => StoreSettings.safeParse({ ...DEFAULT_STORE, ...(data as object) }).data ?? DEFAULT_STORE;
export const readDeal = (home: unknown): Deal => Deal.safeParse((home as { deal?: unknown } | undefined)?.deal).data ?? NO_DEAL;
export const readSections = (home: unknown): HomeSection[] =>
  z.array(HomeSection).safeParse((home as { sections?: unknown } | undefined)?.sections).data ?? [];

export async function catalogVersion(db: Firestore): Promise<number> {
  return ((await catalogMetaRef(db).get()).get('version') as number | undefined) ?? 0;
}

/** Reads the whole catalog. `admin` adds draft stories and the promo codes. */
export async function readCatalog(db: Firestore, log: FastifyBaseLogger, admin: boolean): Promise<AdminCatalog> {
  const [version, dishes, categories, brands, banners, home, store, posts, promos] = await Promise.all([
    catalogVersion(db),
    db.collection(COL.dishes).get(),
    db.collection(COL.categories).get(),
    db.collection(COL.brands).get(),
    db.collection(COL.banners).get(),
    homeRef(db).get(),
    storeRef(db).get(),
    admin ? db.collection(COL.posts).get() : db.collection(COL.posts).where('on', '==', true).get(),
    admin ? db.collection(COL.promos).get() : null,
  ]);
  const menu = parseDocs(dishes, Dish, log).sort(byOrder);
  const publishedAt = new Map(posts.docs.map((d) => [d.id, (d.get('publishedAt') as number | undefined) ?? 0]));
  return {
    version,
    dishes: menu,
    // a category tile falls back to its first dish's photo (the local edition's CAT_IMG)
    categories: parseDocs(categories, Category, log)
      .sort(byOrder)
      .map((c) => {
        const img = c.img ?? menu.find((m) => m.cat === c.name)?.img;
        return img ? { ...c, img } : c;
      }),
    brands: parseDocs(brands, Brand, log).sort(byOrder),
    banners: parseDocs(banners, Banner, log).sort(byOrder),
    sections: readSections(home.data()),
    deal: readDeal(home.data()),
    // newest first
    posts: parseDocs(posts, Post, log).sort((a, b) => (publishedAt.get(b.id) ?? 0) - (publishedAt.get(a.id) ?? 0)),
    store: readStore(store.data()),
    promos: promos ? parseDocs(promos, Promo, log, 'code').sort((a, b) => Number(b.on) - Number(a.on) || a.code.localeCompare(b.code)) : [],
  };
}

/**
 * In-memory cache keyed by catalog version: a request costs one small read (the version) unless the
 * catalog changed. Every console write bumps the version in the same batch, so the cache can't go stale.
 */
export function createCatalogCache(db: Firestore) {
  const cache = new Map<'public' | 'admin', { version: number; value: AdminCatalog }>();
  return {
    async get(log: FastifyBaseLogger, admin: boolean) {
      const key = admin ? 'admin' : 'public';
      const version = await catalogVersion(db);
      const hit = cache.get(key);
      if (hit && hit.version === version) return hit.value;
      const value = await readCatalog(db, log, admin);
      cache.set(key, { version: value.version, value });
      return value;
    },
    version: () => catalogVersion(db),
  };
}
