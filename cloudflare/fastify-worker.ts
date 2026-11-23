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

// Cloudflare routes Node HTTP requests by virtual port. Keep startup asynchronous
// without top-level await: Workers reject TLA in the entrypoint module.
const port = 8787;
const handlerPromise = app.listen({ host: '0.0.0.0', port }).then(() => httpServerHandler({ port }));

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    const handler = await handlerPromise;
    return handler.fetch(request, env, ctx);
  },
};
