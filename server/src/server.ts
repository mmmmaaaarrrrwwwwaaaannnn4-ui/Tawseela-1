import { buildApp } from './app';
import { databaseLabel, loadConfig, usingEmulators } from './config';
import { createDeps } from './lib/deps';
import { advanceLiveOrders } from './modules/orders/service';

const config = loadConfig();
const deps = createDeps(config);
const app = await buildApp(deps);

// Demo kitchen: new orders move placed → confirmed → packed → assigned → out for delivery → delivered on
// their own, so tracking can be shown end to end. Off (DEMO_KITCHEN_SECONDS=0) once real staff work the queues.
let kitchen: NodeJS.Timeout | undefined;
if (config.DEMO_KITCHEN_SECONDS > 0) {
  const every = config.DEMO_KITCHEN_SECONDS * 1000;
  kitchen = setInterval(() => {
    advanceLiveOrders(deps.db, deps.now(), every).catch((err) => app.log.warn({ err }, 'demo kitchen tick failed'));
  }, Math.min(every, 4000));
}

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  clearInterval(kitchen);
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.HOST, port: config.PORT });
app.log.info(
  `Tawseela API on :${config.PORT} — ${usingEmulators(config) ? 'Firebase emulators' : `Firebase project ${config.FIREBASE_PROJECT_ID}`} ` +
    `(Firestore ${databaseLabel(config)}), Kashier ${config.KASHIER_MODE} ${config.KASHIER_MERCHANT_ID ? 'configured' : 'off'}, ImageKit ${deps.imagekit ? 'on' : 'off'}, ` +
    `demo kitchen ${config.DEMO_KITCHEN_SECONDS ? `every ${config.DEMO_KITCHEN_SECONDS}s` : 'off'}`,
);
