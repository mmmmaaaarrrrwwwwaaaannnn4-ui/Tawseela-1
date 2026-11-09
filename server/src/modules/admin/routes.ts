import type { FastifyPluginAsync } from 'fastify';

import { requireAdmin } from '../../plugins/auth';
import adminCatalogRoutes from './catalog';
import adminOperationRoutes from './operations';
import adminUserRoutes from './users';

/** /v1/admin/* — the restaurant console. Every route needs the admin role. */
const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRoute', (route) => {
    route.schema = { ...route.schema, tags: ['admin'], security: [{ firebase: [] }] };
  });
  // before body validation, so non-admins get 403 rather than details about the payload
  app.addHook('preValidation', async (req) => {
    requireAdmin(req);
  });
  await app.register(adminCatalogRoutes);
  await app.register(adminOperationRoutes);
  await app.register(adminUserRoutes);
};

export default adminRoutes;
