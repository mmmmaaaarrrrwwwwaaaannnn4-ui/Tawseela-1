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

// The Node HTTP bridge forwards Worker requests to this in-isolate server.
await app.listen({ port: 8787, host: '127.0.0.1' });

export default httpServerHandler({ port: 8787 });
