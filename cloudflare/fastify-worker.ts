/**
 * Isolated Fastify-on-Workers compatibility probe.
 * This is not the production API and has no customer-data bindings.
 */
import Fastify from 'fastify';
import { httpServerHandler } from 'cloudflare:node';

const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });

app.get('/health', async () => ({
  ok: true,
  service: 'tawseela-fastify-workers-probe',
  productionApi: false,
  stage: 'fastify-http-bridge',
}));

app.post('/echo', async (request) => ({
  ok: true,
  method: request.method,
  body: request.body ?? null,
}));

app.setNotFoundHandler((_request, reply) =>
  reply.code(404).send({ error: { code: 'not_found', message: 'Probe route not found.' } }),
);

// Finish Fastify's plugin/route lifecycle before exposing its underlying Node HTTP
// server. httpServerHandler(server) owns the listen lifecycle on Workers.
const handlerPromise = app.ready().then(() => httpServerHandler(app.server));

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    const handler = await handlerPromise;
    return handler.fetch(request, env, ctx);
  },
};
