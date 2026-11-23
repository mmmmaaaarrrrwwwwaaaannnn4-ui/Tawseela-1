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

// Cloudflare's Node HTTP bridge routes requests by the port passed to
// httpServerHandler. Start Fastify on that virtual port before exporting it;
// passing an un-listening Fastify server instance caused the Worker to hang.
const port = 8787;
await app.listen({ host: '0.0.0.0', port });
const handler = httpServerHandler({ port });

export default {
  fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    return handler.fetch(request, env, ctx);
  },
};
