import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { AppError } from './lib/errors';
import type { Deps } from './lib/deps';
import adminRoutes from './modules/admin/routes';
import bookingRoutes from './modules/bookings/routes';
import catalogRoutes from './modules/catalog/routes';
import meRoutes from './modules/me/routes';
import opsRoutes from './modules/ops/routes';
import orderRoutes from './modules/orders/routes';
import webhookRoutes from './modules/payments/webhook';
import auth from './plugins/auth';

declare module 'fastify' {
  interface FastifyInstance {
    deps: Deps;
  }
}

export async function buildApp(deps: Deps, opts: { logger?: FastifyServerOptions['logger'] } = {}) {
  const { config } = deps;
  const app = Fastify({
    logger: opts.logger ?? {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
      redact: ['req.headers.authorization', 'req.headers.x-kashier-signature'],
    },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('deps', deps);

  // JSON API: no HTML is served apart from the docs, so CSP stays off.
  await app.register(helmet, { contentSecurityPolicy: false });
  const origins = config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  await app.register(cors, { origin: origins.length ? origins : false });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // the test suites place many orders from one address in seconds
    allowList: () => config.NODE_ENV === 'test',
    errorResponseBuilder: (_req, ctx) => new AppError(ctx.statusCode, 'rate_limited', `Too many requests. Try again in ${ctx.after}.`),
  });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 4 } });

  if (config.API_DOCS) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Tawseela API',
          version: '1.0.0',
          description:
            'Catalog, orders and payments, bookings, the team queues and the restaurant console. Send the Firebase ID token as ' +
            '`Authorization: Bearer <token>`. Errors are `{ error: { code, message, details? } }`.',
        },
        components: { securitySchemes: { firebase: { type: 'http', scheme: 'bearer', bearerFormat: 'Firebase ID token' } } },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({
        error: {
          code: 'invalid_request',
          message: 'Some fields are missing or invalid.',
          details: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
        },
      });
    }
    if (err instanceof AppError) {
      if (err.status >= 500) req.log.error({ err }, err.message);
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } });
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ err, cause: err.cause }, 'response did not match its schema');
    } else if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: { code: err.code?.toLowerCase() ?? 'request_error', message: err.message } });
    } else {
      req.log.error({ err }, 'unhandled error');
    }
    return reply.code(500).send({ error: { code: 'internal', message: 'Something went wrong on our side. Try again in a moment.' } });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.code(404).send({ error: { code: 'not_found', message: `No route for ${req.method} ${req.url.split('?')[0]}.` } }),
  );

  await app.register(auth);

  // a POST without a body (e.g. the console's one-tap advance) validates as `{}`, so optional bodies default cleanly
  app.addHook('preValidation', async (req) => {
    if (req.body == null && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) req.body = {};
  });

  app.get('/health', { schema: { hide: true } }, async () => ({ ok: true }));

  await app.register(
    async (v1) => {
      await v1.register(catalogRoutes);
      await v1.register(meRoutes);
      await v1.register(orderRoutes);
      await v1.register(bookingRoutes);
      await v1.register(webhookRoutes);
      await v1.register(adminRoutes, { prefix: '/admin' });
      await v1.register(opsRoutes, { prefix: '/ops' });
    },
    { prefix: '/v1' },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
