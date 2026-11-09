import { ApiError, Catalog } from '@fig/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { COL } from '../../lib/collections';
import { AppError } from '../../lib/errors';
import { createCatalogCache } from './service';

export const etagOf = (version: number) => `W/"catalog-${version}"`;

const catalogRoutes: FastifyPluginAsyncZod = async (app) => {
  const cache = createCatalogCache(app.deps.db);

  app.get(
    '/catalog',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Menu, categories, kitchens, banners, Home sections, deal of the day, published stories and store settings',
        description: 'Send `If-None-Match` with the last ETag to get `304 Not Modified` while nothing changed. No sign-in needed.',
        // the 304 has no body at all (a serialized `null` would leave Android's HTTP client waiting for it)
        response: { 200: Catalog, 304: z.void() },
      },
    },
    async (req, reply) => {
      const version = await cache.version();
      const etag = etagOf(version);
      reply.header('Cache-Control', 'no-cache');
      if (req.headers['if-none-match'] === etag) return reply.code(304).header('ETag', etag).removeHeader('content-type').send(undefined);
      const { promos: _promos, ...catalog } = await cache.get(req.log, false);
      return reply.header('ETag', etagOf(catalog.version)).send(catalog);
    },
  );

  app.post(
    '/promos/validate',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['catalog'],
        summary: 'Check a promo code (Fig’s applyPromo)',
        body: z.object({ code: z.string().trim().min(1).max(20) }),
        response: { 200: z.object({ code: z.string(), pct: z.number() }), 404: ApiError },
      },
    },
    async (req) => {
      const code = req.body.code.toUpperCase();
      const doc = /^[A-Z0-9]{3,20}$/.test(code) ? await app.deps.db.collection(COL.promos).doc(code).get() : null;
      if (!doc?.exists || doc.get('on') !== true) throw new AppError(404, 'promo_invalid', 'That code isn’t active. Try FIG10.');
      return { code, pct: doc.get('pct') as number };
    },
  );
};

export default catalogRoutes;
