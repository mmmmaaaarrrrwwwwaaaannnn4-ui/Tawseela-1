import {
  AdminCatalog,
  ApiError,
  Banner,
  BannerPatch,
  Brand,
  BrandPatch,
  Category,
  CategoryInput,
  CategoryPatch,
  Deal,
  DealPatch,
  Dish,
  DishInput,
  DishPatch,
  HomeSection,
  HomeSectionKey,
  Post,
  PostInput,
  PostPatch,
  Promo,
  PromoInput,
  PromoPatch,
  RESTAURANT_TZ,
  Reorder,
  SectionPatch,
  StorePatch,
  StoreSettings,
} from '@fig/shared';
import { FieldValue, type DocumentReference, type Transaction, type WriteBatch } from 'firebase-admin/firestore';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { COL, bumpCatalog, homeRef, slug, storeRef } from '../../lib/collections';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { createCatalogCache, readDeal, readSections, readStore } from '../catalog/service';

const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError };
const idParam = z.object({ id: z.string().min(1).max(64) });

/** "Nov 5" (Fig's shortToday), in the restaurant's time zone. */
const displayDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: RESTAURANT_TZ });
/** ~200 words a minute, at least one (Fig's savePost). */
const readingMins = (body: string) => {
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  return Math.max(1, Math.round(words / 200));
};

/**
 * /v1/admin — the console's catalog writes (Fig's saveItem, toggleAvail, deleteItem, addCat, toggleCat,
 * moveCat, toggleBrand, saveBrand, toggleSection, moveSection, toggleBanner, moveBanner, setDeal,
 * savePost, togglePost, deletePost, addPromo, togglePromo, setStore). Each write bumps the catalog
 * version in the same batch, so every app picks it up on its next revalidation.
 */
const adminCatalogRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, now } = app.deps;
  const cache = createCatalogCache(db);
  const col = (name: string) => db.collection(name);

  /** Reads a document that must exist. */
  async function existing(ref: DocumentReference, what: string) {
    const snap = await ref.get();
    if (!snap.exists) throw notFound(what);
    return snap;
  }

  /** Applies a patch to one document and bumps the catalog version in the same batch. */
  async function patch<T extends z.ZodType>(ref: DocumentReference, what: string, data: Record<string, unknown>, schema: T, idField = 'id') {
    await existing(ref, what);
    const batch = db.batch();
    batch.update(ref, { ...data, updatedAt: FieldValue.serverTimestamp() });
    bumpCatalog(db, batch);
    await batch.commit();
    const snap = await ref.get();
    return schema.parse({ [idField]: snap.id, ...snap.data() }) as z.infer<T>;
  }

  async function nextOrder(name: string) {
    const last = await col(name).orderBy('order', 'desc').limit(1).get();
    return ((last.docs[0]?.get('order') as number | undefined) ?? -1) + 1;
  }

  async function reorder(name: string, ids: string[]) {
    if (new Set(ids).size !== ids.length) throw badRequest('Each item can appear once.');
    const batch = db.batch();
    ids.forEach((id, order) => batch.update(col(name).doc(id), { order }));
    bumpCatalog(db, batch);
    await batch.commit().catch(() => {
      throw badRequest('One of those items doesn’t exist any more. Refresh and try again.');
    });
  }

  /** The dish's category and kitchen must exist. */
  async function checkRefs(cat: string | undefined, brand: string | undefined) {
    const [cats, b] = await Promise.all([cat ? col(COL.categories).where('name', '==', cat).limit(1).get() : null, brand ? col(COL.brands).doc(brand).get() : null]);
    if (cats && cats.empty) throw badRequest(`There’s no ${cat} category. Add it under Categories first.`);
    if (b && !b.exists) throw badRequest('That kitchen doesn’t exist.');
  }

  /** Read-modify-write of config/home inside a transaction, with the version bump. */
  async function updateHome<T>(fn: (home: { sections: HomeSection[]; deal: Deal }, tx: Transaction) => Promise<T> | T): Promise<T> {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(homeRef(db));
      const home = { sections: readSections(snap.data()), deal: readDeal(snap.data()) };
      const out = await fn(home, tx);
      tx.set(homeRef(db), { sections: home.sections, deal: home.deal, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      bumpCatalog(db, tx);
      return out;
    });
  }

  app.get('/catalog', { schema: { summary: 'Everything, including draft stories and promo codes', response: { 200: AdminCatalog, ...errors } } }, async (req) =>
    cache.get(req.log, true),
  );

  /* ---------- dishes ---------- */

  app.post('/dishes', { schema: { summary: 'Add a dish (saveItem without an id)', body: DishInput, response: { 201: Dish, ...errors } } }, async (req, reply) => {
    await checkRefs(req.body.cat, req.body.brand);
    const store = readStore((await storeRef(db).get()).data());
    let id = slug(req.body.name);
    if ((await col(COL.dishes).doc(id).get()).exists) id = `${id}-${now().toString(36).slice(-4)}`;
    const doc = {
      ...req.body,
      time: req.body.time ?? store.prep,
      kcal: req.body.kcal ?? 600,
      desc: req.body.desc ?? 'Freshly added to the Fig menu.',
      rating: 5,
      reviews: 0,
      order: await nextOrder(COL.dishes),
      createdAt: FieldValue.serverTimestamp(),
    };
    const batch = db.batch();
    batch.create(col(COL.dishes).doc(id), doc);
    bumpCatalog(db, batch);
    await batch.commit();
    return reply.code(201).send(Dish.parse({ id, ...doc }));
  });

  app.patch(
    '/dishes/:id',
    { schema: { summary: 'Edit a dish, or mark it sold out / available (saveItem, toggleAvail)', params: idParam, body: DishPatch, response: { 200: Dish, ...errors } } },
    async (req) => {
      await checkRefs(req.body.cat, req.body.brand);
      return patch(col(COL.dishes).doc(req.params.id), 'That dish', req.body, Dish);
    },
  );

  app.delete('/dishes/:id', { schema: { summary: 'Remove a dish (deleteItem)', params: idParam, response: { 204: z.null(), ...errors } } }, async (req, reply) => {
    const ref = col(COL.dishes).doc(req.params.id);
    await existing(ref, 'That dish');
    const deal = readDeal((await homeRef(db).get()).data());
    if (deal.id === req.params.id && deal.on) throw conflict('in_use', 'This dish is today’s deal. Pick another deal first.');
    const batch = db.batch();
    batch.delete(ref);
    bumpCatalog(db, batch);
    await batch.commit();
    return reply.code(204).send(null);
  });

  /* ---------- categories ---------- */

  app.post('/categories', { schema: { summary: 'Add a category (addCat)', body: CategoryInput, response: { 201: Category, ...errors } } }, async (req, reply) => {
    const name = req.body.name;
    const all = await col(COL.categories).get();
    if (all.docs.some((d) => String(d.get('name')).toLowerCase() === name.toLowerCase())) throw conflict('duplicate', `${name} already exists.`);
    let id = slug(name);
    if (all.docs.some((d) => d.id === id)) id = `${id}-${now().toString(36).slice(-4)}`;
    const doc = { name, on: true, order: await nextOrder(COL.categories) };
    const batch = db.batch();
    batch.create(col(COL.categories).doc(id), doc);
    bumpCatalog(db, batch);
    await batch.commit();
    return reply.code(201).send(Category.parse({ id, ...doc }));
  });

  app.put('/categories/order', { schema: { summary: 'Reorder categories (moveCat): ids in their new order', body: Reorder, response: { 204: z.null(), ...errors } } }, async (req, reply) => {
    await reorder(COL.categories, req.body.ids);
    return reply.code(204).send(null);
  });

  app.patch('/categories/:id', { schema: { summary: 'Show or hide a category (toggleCat)', params: idParam, body: CategoryPatch, response: { 200: Category, ...errors } } }, async (req) =>
    patch(col(COL.categories).doc(req.params.id), 'That category', req.body, Category),
  );

  /* ---------- kitchens and banners ---------- */

  app.post('/brands', { schema: { summary: 'Create a kitchen', body: z.object({ name: Brand.shape.name, tag: Brand.shape.tag, icon: Brand.shape.icon, img: Brand.shape.img, on: Brand.shape.on.default(true), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), address: Brand.shape.address, phone: Brand.shape.phone, description: Brand.shape.description, workDays: Brand.shape.workDays, openTime: Brand.shape.openTime, closeTime: Brand.shape.closeTime, manualStatus: Brand.shape.manualStatus.default('auto'), deliveryFee: Brand.shape.deliveryFee, prepTime: Brand.shape.prepTime }), response: { 201: Brand, ...errors } } }, async (req, reply) => {
    const all = await col(COL.brands).get();
    if (all.docs.some((d) => String(d.get('name')).toLowerCase() === req.body.name.toLowerCase())) throw conflict('duplicate', 'A kitchen with this name already exists.');
    let id = slug(req.body.name);
    if (all.docs.some((d) => d.id === id)) id = `${id}-${now().toString(36).slice(-4)}`;
    const doc = { ...req.body, order: await nextOrder(COL.brands), createdAt: FieldValue.serverTimestamp() };
    const batch = db.batch();
    batch.create(col(COL.brands).doc(id), doc);
    bumpCatalog(db, batch);
    await batch.commit();
    return reply.code(201).send(Brand.parse({ id, ...doc }));
  });

  app.patch('/brands/:id', { schema: { summary: 'Edit or toggle a kitchen (saveBrand, toggleBrand)', params: idParam, body: BrandPatch, response: { 200: Brand, ...errors } } }, async (req) => {
    if ((req.body.lat === undefined) !== (req.body.lng === undefined)) throw badRequest('Latitude and longitude must be provided together.');
    if (req.body.lat === null || req.body.lng === null) throw badRequest('Choose a valid kitchen location on the map.');
    return patch(col(COL.brands).doc(req.params.id), 'That kitchen', req.body, Brand);
  });

  app.delete('/brands/:id', { schema: { summary: 'Delete a kitchen with no assigned dishes', params: idParam, response: { 204: z.null(), ...errors } } }, async (req, reply) => {
    const ref = col(COL.brands).doc(req.params.id);
    await existing(ref, 'That kitchen');
    const dishes = await col(COL.dishes).where('brand', '==', req.params.id).limit(1).get();
    if (!dishes.empty) throw conflict('kitchen_has_dishes', 'Move or delete this kitchen’s dishes before deleting it.');
    const batch = db.batch();
    batch.delete(ref);
    bumpCatalog(db, batch);
    await batch.commit();
    return reply.code(204).send(null);
  });

  app.put('/banners/order', { schema: { summary: 'Reorder banners (moveBanner): ids in their new order', body: Reorder, response: { 204: z.null(), ...errors } } }, async (req, reply) => {
    await reorder(COL.banners, req.body.ids);
    return reply.code(204).send(null);
  });

  app.patch('/banners/:id', { schema: { summary: 'Edit or toggle a banner (toggleBanner)', params: idParam, body: BannerPatch, response: { 200: Banner, ...errors } } }, async (req) =>
    patch(col(COL.banners).doc(req.params.id), 'That banner', req.body, Banner),
  );

  /* ---------- Home sections and the deal of the day ---------- */

  app.put(
    '/sections/order',
    { schema: { summary: 'Reorder Home sections (moveSection): section keys in their new order', body: Reorder, response: { 200: z.array(HomeSection), ...errors } } },
    async (req) =>
      updateHome((home) => {
        const keys = req.body.ids;
        if (keys.length !== home.sections.length || !home.sections.every((s) => keys.includes(s.k))) {
          throw badRequest(`Send every section key once: ${home.sections.map((s) => s.k).join(', ')}.`);
        }
        home.sections = keys.map((k) => home.sections.find((s) => s.k === k)!);
        return home.sections;
      }),
  );

  app.patch(
    '/sections/:k',
    { schema: { summary: 'Show or hide a Home section (toggleSection)', params: z.object({ k: HomeSectionKey }), body: SectionPatch, response: { 200: HomeSection, ...errors } } },
    async (req) =>
      updateHome((home) => {
        const i = home.sections.findIndex((s) => s.k === req.params.k);
        if (i < 0) throw notFound('That section');
        home.sections[i] = { ...home.sections[i], ...req.body };
        return home.sections[i];
      }),
  );

  app.patch('/deal', { schema: { summary: 'Deal of the day: dish, percentage, on/off (setDeal)', body: DealPatch, response: { 200: Deal, ...errors } } }, async (req) => {
    if (req.body.id && !(await col(COL.dishes).doc(req.body.id).get()).exists) throw badRequest('The deal must be a dish on the menu.');
    return updateHome((home) => {
      home.deal = { ...home.deal, ...req.body };
      if (home.deal.on && !home.deal.id) throw badRequest('Pick a dish for the deal first.');
      return home.deal;
    });
  });

  /* ---------- store settings ---------- */

  app.patch('/store', { schema: { summary: 'Open or close, prep time, delivery fee, free-delivery threshold, kitchen sound (setStore)', body: StorePatch, response: { 200: StoreSettings, ...errors } } }, async (req) => {
    const batch = db.batch();
    batch.set(storeRef(db), { ...readStore((await storeRef(db).get()).data()), ...req.body, updatedAt: FieldValue.serverTimestamp() });
    bumpCatalog(db, batch);
    await batch.commit();
    return readStore((await storeRef(db).get()).data());
  });

  /* ---------- promo codes (not in the public catalog) ---------- */

  app.post('/promos', { schema: { summary: 'Create a promo code (addPromo)', body: PromoInput, response: { 201: Promo, ...errors } } }, async (req, reply) => {
    const ref = col(COL.promos).doc(req.body.code);
    const doc = { pct: req.body.pct, used: 0, on: true, createdAt: FieldValue.serverTimestamp() };
    await ref.create(doc).catch(() => {
      throw conflict('duplicate', `${req.body.code} already exists.`);
    });
    return reply.code(201).send(Promo.parse({ code: req.body.code, ...doc }));
  });

  app.patch(
    '/promos/:code',
    { schema: { summary: 'Turn a promo code on or off (togglePromo)', params: z.object({ code: z.string().min(1).max(20) }), body: PromoPatch, response: { 200: Promo, ...errors } } },
    async (req) => patch(col(COL.promos).doc(req.params.code.toUpperCase()), 'That code', { on: req.body.on }, Promo, 'code'),
  );

  /* ---------- journal ---------- */

  async function unfeatureOthers(batch: WriteBatch, keep: string) {
    const featured = await col(COL.posts).where('featured', '==', true).get();
    featured.docs.filter((d) => d.id !== keep).forEach((d) => batch.update(d.ref, { featured: false }));
  }

  app.post('/posts', { schema: { summary: 'Write a story (savePost, new)', body: PostInput, response: { 201: Post, ...errors } } }, async (req, reply) => {
    const ref = col(COL.posts).doc();
    const at = now();
    const doc = { ...req.body, likes: 0, date: displayDate(at), mins: readingMins(req.body.body), publishedAt: at, createdAt: FieldValue.serverTimestamp() };
    const batch = db.batch();
    batch.set(ref, doc);
    if (doc.featured) await unfeatureOthers(batch, ref.id);
    bumpCatalog(db, batch);
    await batch.commit();
    return reply.code(201).send(Post.parse({ id: ref.id, ...doc }));
  });

  app.patch('/posts/:id', { schema: { summary: 'Edit, publish or unpublish a story (savePost, togglePost)', params: idParam, body: PostPatch, response: { 200: Post, ...errors } } }, async (req) => {
    const ref = col(COL.posts).doc(req.params.id);
    await existing(ref, 'That story');
    const batch = db.batch();
    batch.update(ref, { ...req.body, ...(req.body.body !== undefined ? { mins: readingMins(req.body.body) } : {}), updatedAt: FieldValue.serverTimestamp() });
    if (req.body.featured) await unfeatureOthers(batch, ref.id);
    bumpCatalog(db, batch);
    await batch.commit();
    const snap = await ref.get();
    return Post.parse({ id: snap.id, ...snap.data() });
  });

  app.delete('/posts/:id', { schema: { summary: 'Delete a story (deletePost)', params: idParam, response: { 204: z.null(), ...errors } } }, async (req, reply) => {
    const ref = col(COL.posts).doc(req.params.id);
    await existing(ref, 'That story');
    const batch = db.batch();
    batch.delete(ref);
    bumpCatalog(db, batch);
    await batch.commit();
    return reply.code(204).send(null);
  });
};

export default adminCatalogRoutes;
