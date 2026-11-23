/**
 * Isolated Fastify-on-Workers compatibility probe.
 * Temporary diagnostic response; never handles production/customer data.
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

const handlerPromise = app.ready().then(() => httpServerHandler(app.server));

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    try {
      const handler = await handlerPromise;
      return await handler.fetch(request, env, ctx);
    } catch (error) {
      const detail = error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) };
      console.error('Fastify Worker bridge failure', detail);
      return Response.json({ ok: false, diagnostic: detail }, { status: 500 });
    }
  },
};
