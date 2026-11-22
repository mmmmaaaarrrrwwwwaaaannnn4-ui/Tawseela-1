/**
 * Isolated Fastify-on-Workers compatibility probe.
 *
 * This is deliberately NOT the Tawseela API: it has no Firebase, payment,
 * storage, notification, or customer-data bindings.
 */
import Fastify from 'fastify';
import { handleAsNodeRequest } from 'cloudflare:node';

const port = 8787;
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

// Workers disallow top-level await in entrypoint modules. Initialize Fastify
// once, then route each request only after its async plugin setup has completed.
const ready = app.ready().then(() => {
  app.server.listen(port);
});

export default {
  async fetch(request: Request): Promise<Response> {
    await ready;
    return handleAsNodeRequest(port, request);
  },
};
