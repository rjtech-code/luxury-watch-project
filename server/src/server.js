import { config } from './config.js';
import { createApp, logger } from './app.js';
import { closeDb } from './db/client.js';
import { migrate } from './db/migrate.js';
import { expireUnpaidOrders } from './services/orders.js';

await migrate(); // make sure every collection and index exists
const app = createApp();
const server = app.listen(config.port, () => {
  logger.info(`API listening on http://localhost:${config.port}`);
  if (!config.razorpay.enabled) logger.warn('Razorpay is not configured: online payments are disabled.');
  if (!config.smtp.host) logger.warn('SMTP is not configured: emails are printed to the log instead of being sent.');
});

// Release stock held by online-payment orders that were never completed.
const sweep = setInterval(() => expireUnpaidOrders(logger).catch((err) => logger.error({ err }, 'expiry sweep failed')), 5 * 60_000);
sweep.unref();

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  clearInterval(sweep);
  server.close(async () => {
    await closeDb().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
