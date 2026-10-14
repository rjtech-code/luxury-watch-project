import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { notFound, wrap } from '../lib/errors.js';
import { sendMail } from '../lib/mailer.js';
import { strictLimiter } from '../middleware/security.js';
import { validate } from '../middleware/validate.js';
import { getSettings } from '../services/settings.js';
import { newReference } from './account.js';

export const publicRouter = Router();

const email = z.string().trim().toLowerCase().email().max(254);

/** Only fields that are safe and useful for the storefront. Payment and internal settings are never exposed. */
publicRouter.get('/site', wrap(async (_req, res) => {
  const st = await getSettings();
  const demo = await db.products.count({ isDemoData: true });
  res.set('Cache-Control', 'public, max-age=30');
  res.json({
    demoPricing: demo > 0, // true only while dev-only placeholder prices exist; the storefront then shows a notice
    brand: st.brand,
    announcement: st.announcement,
    currency: st.currency,
    taxLabel: st.tax?.enabled ? `${st.tax.label} ${st.tax.ratePercent}%${st.tax.inclusive ? ' included' : ''}` : null,
    returnWindowDays: st.policies.returnWindowDays,
    warrantyNote: st.policies.warrantyNote,
    loyaltyEnabled: Boolean(st.loyalty?.enabled),
    homepageSections: st.homepage.sections,
  });
}));

publicRouter.post('/newsletter', strictLimiter, validate({ body: z.object({ email }).strict() }), wrap(async (req, res) => {
  await db.newsletterSubscribers.updateOne({ email: req.body.email }, { $set: { unsubscribedAt: null }, $setOnInsert: { id: crypto.randomUUID(), confirmedAt: new Date(), createdAt: new Date() } }, { upsert: true });
  res.status(201).json({ ok: true, message: 'You are subscribed.' });
}));

const supportBody = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  phone: z.string().trim().max(20).optional(),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(3000),
}).strict();

async function createSupport(req, res, type, extra = {}) {
  const reference = newReference(type === 'WARRANTY' ? 'WR' : type === 'SERVICE' ? 'SV' : 'SR');
  await db.supportRequests.insert({ reference, type, userId: req.user?.id ?? null, ...req.body, data: extra.data ?? null });
  await sendMail({ to: req.body.email, subject: `We received your request · ${reference}`, text: `Thank you, ${req.body.name}. We have received your request and will reply to this email address.\n\nReference: ${reference}` });
  res.status(201).json({ ok: true, reference });
}

publicRouter.post('/support/contact', strictLimiter, validate({ body: supportBody }), wrap((req, res) => createSupport(req, res, 'CONTACT')));

publicRouter.post('/support/warranty', strictLimiter, validate({ body: supportBody.extend({ data: z.object({ brand: z.string().max(60), model: z.string().max(100), serialNumber: z.string().max(60), purchaseDate: z.string().max(20), orderNumber: z.string().max(30).optional() }).strict() }) }), wrap(async (req, res) => {
  const { data, ...rest } = req.body;
  req.body = rest;
  return createSupport(req, res, 'WARRANTY', { data });
}));

publicRouter.post('/support/service', strictLimiter, validate({ body: supportBody.extend({ data: z.object({ brand: z.string().max(60), model: z.string().max(100), issue: z.string().max(60), serialNumber: z.string().max(60).optional() }).strict() }) }), wrap(async (req, res) => {
  const { data, ...rest } = req.body;
  req.body = rest;
  return createSupport(req, res, 'SERVICE', { data });
}));

publicRouter.post('/restock', strictLimiter, validate({ body: z.object({ slug: z.string().max(120), email }).strict() }), wrap(async (req, res) => {
  const p = await db.products.findOne({ slug: req.body.slug }, { projection: { id: 1 } });
  if (!p) throw notFound('Watch not found.');
  await db.restockSubscriptions.insertIfAbsent({ productId: p.id, email: req.body.email }, {});
  res.status(201).json({ ok: true, message: 'We will email you when it is back in stock.' });
}));

publicRouter.get('/articles', wrap(async (_req, res) => {
  const rows = await db.articles.find({ status: 'PUBLISHED' }, { sort: { publishedAt: -1 }, projection: { slug: 1, title: 1, excerpt: 1, coverUrl: 1, category: 1, publishedAt: 1 } });
  res.json({ items: rows });
}));

publicRouter.get('/articles/:slug', validate({ params: z.object({ slug: z.string().max(120) }) }), wrap(async (req, res) => {
  const a = await db.articles.findOne({ slug: req.params.slug, status: 'PUBLISHED' });
  if (!a) throw notFound('Article not found.');
  const { id, status, createdAt, ...pub } = a;
  res.json({ article: pub });
}));
