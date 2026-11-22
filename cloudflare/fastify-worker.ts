/**
 * Isolated Fastify-on-Workers compatibility probe.
 *
 * This is deliberately NOT the Tawseela API: it has no Firebase, payment,
 * storage, notification, or customer-data bindings.
 */
import Fastify from 'fastify';
import { httpServerHandler } from 'cloudflare:node';

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

// Complete Fastify's asynchronous plugin/router initialization before exposing
// its underlying Node HTTP server to Cloudflare's request bridge.
await app.ready();
app.server.listen(port);

export default httpServerHandler({ port });
