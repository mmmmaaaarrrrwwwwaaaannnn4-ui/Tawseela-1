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

// Use Cloudflare's documented server-instance integration. Fastify completes
// its plugin lifecycle before its Node HTTP server is handed to the bridge.
const handlerPromise = app.ready().then(() => httpServerHandler(app.server));

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    const handler = await handlerPromise;
    return handler.fetch(request, env, ctx);
  },
};
