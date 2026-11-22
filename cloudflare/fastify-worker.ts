/**
 * Isolated Fastify-on-Workers compatibility probe.
 *
 * This is deliberately NOT the Tawseela API: it has no Firebase, payment,
 * storage, notification, or customer-data bindings. Its only purpose is to
 * prove Fastify 5 can be served through Cloudflare's Node HTTP bridge.
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

app.setNotFoundHandler((_request, reply) => {
  return reply.code(404).send({
    error: { code: 'not_found', message: 'Probe route not found.' },
  });
});

const port = 8787;
const bridge = httpServerHandler({ port });

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    // Fastify's ready() is asynchronous; await it per request instead of
    // using top-level await, which Workers rejects for synchronously loaded
    // Node-compatibility entrypoint modules.
    await app.ready();

    if (!app.server.listening) {
      app.server.listen(port);
    }

    return bridge(request, env, ctx);
  },
};
