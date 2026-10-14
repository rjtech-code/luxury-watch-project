import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { db, ping } from './db/client.js';
import { HttpError, notFound } from './lib/errors.js';
import { csrfGuard, loadUser, requireRole } from './middleware/auth.js';
import { apiLimiter } from './middleware/security.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { cartRouter } from './routes/cart.js';
import { checkoutRouter, ordersRouter, paymentsRouter, razorpayWebhook } from './routes/checkout.js';
import { accountRouter } from './routes/account.js';
import { publicRouter } from './routes/public.js';
import { adminSalesRouter } from './routes/admin-sales.js';
import { adminManageRouter, UPLOAD_DIR } from './routes/admin-manage.js';

export const logger = pino({ level: config.isTest ? 'silent' : process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] });

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.use(cors({ origin: config.webOrigin, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-LW-CSRF'], maxAge: 600 }));

  // Webhook needs the raw bytes for signature verification, so it is registered before the JSON parser.
  app.post('/api/payments/webhook', express.raw({ type: '*/*', limit: '256kb' }), razorpayWebhook);

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    try {
      await ping();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny', setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff') }),
  );

  app.use('/api', apiLimiter, csrfGuard, loadUser);

  app.use('/api/auth', authRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/checkout', checkoutRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/account', accountRouter);
  app.use('/api/admin', requireRole('MANAGER', 'SUPER_ADMIN'), adminSalesRouter, adminManageRouter);
  app.use('/api', publicRouter);

  // ---- SEO: robots + sitemap (point your web server's /sitemap.xml and /robots.txt at these)
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /admin\nDisallow: /manager\nDisallow: /checkout\nDisallow: /cart\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  });
  app.get('/sitemap.xml', async (_req, res, next) => {
    try {
      const [products, brands, collections, articles] = await Promise.all([
        db.products.find({ status: 'ACTIVE' }, { projection: { slug: 1, updatedAt: 1 } }),
        db.brands.find({ isActive: true }, { projection: { slug: 1 } }),
        db.collections.find({}, { projection: { slug: 1 } }),
        db.articles.find({ status: 'PUBLISHED' }, { projection: { slug: 1, publishedAt: 1 } }),
      ]);
      const statics = ['', '/shop', '/brands', '/collections', '/new-arrivals', '/best-sellers', '/limited-editions', '/journal', '/about', '/craftsmanship', '/contact', '/faq', '/shipping', '/returns', '/warranty', '/privacy', '/terms', '/showcase', '/mens-watches', '/womens-watches', '/smart-watches', '/occasion', '/track-order'];
      const url = (loc, lastmod) => `<url><loc>${config.siteUrl}${loc}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}</url>`;
      const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...statics.map((p) => url(p)),
        ...products.map((p) => url(`/watches/${p.slug}`, p.updatedAt)),
        ...brands.map((b) => url(`/brands/${b.slug}`)),
        ...collections.map((c) => url(`/collections/${c.slug}`)),
        ...articles.map((a) => url(`/journal/${a.slug}`, a.publishedAt)),
        '</urlset>'].join('\n');
      res.type('application/xml').send(xml);
    } catch (err) { next(err); }
  });

  app.use('/api', (_req, _res, next) => next(notFound('Endpoint not found.')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Invalid JSON body.' } });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request body too large.' } });
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'File is too large.' } });
    if (err?.code === 11000) return res.status(409).json({ error: { code: 'DUPLICATE', message: 'That record already exists.' } });
    req.log?.error({ err }, 'unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
  });

  return app;
}
