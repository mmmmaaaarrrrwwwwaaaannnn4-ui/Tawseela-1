/**
 * Isolated Fastify-on-Workers compatibility probe.
 * This is not the production API and has no customer-data bindings.
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

app.setNotFoundHandler((_request, reply) =>
  reply.code(404).send({ error: { code: 'not_found', message: 'Probe route not found.' } }),
);

// Fastify's ready() resolves after plugin initialization, but Node's listen()
// is callback-based. Wait for the listening event before routing Worker requests
// to the port; otherwise the bridge can see an unregistered server and return 500.
const ready = (async () => {
  await app.ready();
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    app.server.once('error', onError);
    app.server.listen(port, () => {
      app.server.off('error', onError);
      resolve();
    });
  });
})();

export default {
  async fetch(request: Request): Promise<Response> {
    await ready;
    return handleAsNodeRequest(port, request);
  },
};
