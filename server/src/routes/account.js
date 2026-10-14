import { Router } from 'express';
import { z } from 'zod';
import { db, withTx } from '../db/client.js';
import { badRequest, conflict, notFound, wrap } from '../lib/errors.js';
import { randomToken } from '../lib/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { cancelOrder, CANCELLABLE } from '../services/orders.js';
import { getSettings } from '../services/settings.js';
import { orderDetailForPublic } from './checkout.js';
import { publicUser } from './auth.js';

export const accountRouter = Router();
accountRouter.use(requireAuth);

const phone = z.string().trim().regex(/^\+?[0-9\s-]{8,15}$/, 'Enter a valid phone number');

accountRouter.get(
  '/overview',
  wrap(async (req, res) => {
    const uid = req.user.id;
    const [orders, wishlist, addresses, recent] = await Promise.all([
      db.orders.count({ userId: uid }),
      db.wishlistItems.count({ userId: uid }),
      db.addresses.count({ userId: uid }),
      db.orders.find({ userId: uid }, { sort: { placedAt: -1 }, limit: 5, projection: { orderNumber: 1, status: 1, totalMinor: 1, placedAt: 1 } }),
    ]);
    const settings = await getSettings();
    res.json({
      totalOrders: orders,
      wishlistItems: wishlist,
      savedAddresses: addresses,
      loyalty: settings.loyalty?.enabled ? { points: req.user.loyaltyPoints } : null,
      recentOrders: recent.map((r) => ({ ...r, totalMinor: Number(r.totalMinor) })),
    });
  }),
);

accountRouter.patch(
  '/profile',
  validate({
    body: z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        phone: phone.nullable().optional(),
        notificationPrefs: z.object({ orderUpdates: z.boolean(), offers: z.boolean(), restock: z.boolean() }).strict().optional(),
      })
      .strict(),
  }),
  wrap(async (req, res) => {
    const u = await db.users.updateOne({ id: req.user.id }, { ...req.body, updatedAt: new Date() });
    res.json({ user: await publicUser(u), notificationPrefs: u.notificationPrefs });
  }),
);

accountRouter.get('/notification-prefs', (req, res) => res.json({ notificationPrefs: req.user.notificationPrefs }));

// ---- addresses
const addressBody = z
  .object({
    label: z.string().trim().max(30).optional().nullable(),
    fullName: z.string().trim().min(2).max(80),
    phone,
    line1: z.string().trim().min(3).max(120),
    line2: z.string().trim().max(120).optional().nullable(),
    city: z.string().trim().min(2).max(60),
    state: z.string().trim().min(2).max(60),
    postalCode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code'),
    isDefault: z.boolean().default(false),
  })
  .strict();

accountRouter.get('/addresses', wrap(async (req, res) => {
  res.json({ items: await db.addresses.find({ userId: req.user.id }, { sort: { isDefault: -1, createdAt: -1 } }) });
}));

accountRouter.post('/addresses', validate({ body: addressBody }), wrap(async (req, res) => {
  const count = await db.addresses.count({ userId: req.user.id });
  if (count >= 10) throw badRequest('You can save up to 10 addresses.');
  const created = await withTx(async (session) => {
    const makeDefault = req.body.isDefault || count === 0;
    if (makeDefault) await db.addresses.update({ userId: req.user.id }, { isDefault: false }, { session });
    return db.addresses.insert({ ...req.body, isDefault: makeDefault, userId: req.user.id }, { session });
  });
  res.status(201).json({ address: created });
}));

accountRouter.put('/addresses/:id', validate({ params: z.object({ id: z.string().uuid() }), body: addressBody }), wrap(async (req, res) => {
  const updated = await withTx(async (session) => {
    const own = await db.addresses.findOne({ id: req.params.id, userId: req.user.id }, { session });
    if (!own) return null;
    if (req.body.isDefault) await db.addresses.update({ userId: req.user.id }, { isDefault: false }, { session });
    return db.addresses.updateOne({ id: own.id }, req.body, { session });
  });
  if (!updated) throw notFound('Address not found.');
  res.json({ address: updated });
}));

accountRouter.delete('/addresses/:id', validate({ params: z.object({ id: z.string().uuid() }) }), wrap(async (req, res) => {
  const gone = await db.addresses.delete({ id: req.params.id, userId: req.user.id });
  if (!gone) throw notFound('Address not found.');
  res.json({ ok: true });
}));

// ---- orders (always scoped to the signed-in user)
async function ownOrder(req) {
  const o = await db.orders.findOne({ orderNumber: req.params.orderNumber.toUpperCase(), userId: req.user.id });
  if (!o) throw notFound('Order not found.');
  return o;
}
const orderParams = z.object({ orderNumber: z.string().max(30) });

accountRouter.get('/orders', validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1) }) }), wrap(async (req, res) => {
  const size = 10;
  const where = { userId: req.user.id };
  const n = await db.orders.count(where);
  const rows = await db.orders.find(where, { sort: { placedAt: -1 }, limit: size, skip: (req.query.page - 1) * size });
  const counts = new Map((await db.orderItems.aggregate([{ $match: { orderId: { $in: rows.map((r) => r.id) } } }, { $group: { _id: '$orderId', n: { $sum: '$quantity' } } }])).map((r) => [r._id, r.n]));
  res.json({
    items: rows.map((r) => ({ orderNumber: r.orderNumber, status: r.status, paymentStatus: r.paymentStatus, totalMinor: Number(r.totalMinor), placedAt: r.placedAt, itemCount: counts.get(r.id) ?? 0 })),
    total: n,
    pages: Math.max(1, Math.ceil(n / size)),
  });
}));

accountRouter.get('/orders/:orderNumber', validate({ params: orderParams }), wrap(async (req, res) => {
  res.json({ order: await orderDetailForPublic(await ownOrder(req)) });
}));

accountRouter.post('/orders/:orderNumber/cancel', validate({ params: orderParams, body: z.object({ reason: z.string().trim().max(300).optional() }).strict() }), wrap(async (req, res) => {
  const o = await ownOrder(req);
  if (!CANCELLABLE.includes(o.status)) throw conflict('This order can no longer be cancelled.', 'NOT_CANCELLABLE');
  await cancelOrder(o.id, { reason: req.body.reason ?? 'Cancelled by customer', actorId: req.user.id });
  res.json({ order: await orderDetailForPublic(await ownOrder(req)) });
}));

accountRouter.post('/orders/:orderNumber/return', validate({ params: orderParams, body: z.object({ reason: z.string().trim().min(5).max(500) }).strict() }), wrap(async (req, res) => {
  const o = await ownOrder(req);
  const settings = await getSettings();
  if (o.status !== 'DELIVERED') throw conflict('Only delivered orders can be returned.', 'NOT_RETURNABLE');
  if (!o.deliveredAt || Date.now() - new Date(o.deliveredAt).getTime() > settings.policies.returnWindowDays * 86400_000) {
    throw conflict(`The ${settings.policies.returnWindowDays}-day return window has passed.`, 'RETURN_WINDOW_CLOSED');
  }
  await withTx(async (session) => {
    if (!(await db.orders.updateOne({ id: o.id, status: 'DELIVERED' }, { status: 'RETURN_REQUESTED', updatedAt: new Date() }, { session }))) throw conflict('Only delivered orders can be returned.', 'NOT_RETURNABLE');
    await db.returns.insert({ orderId: o.id, reason: req.body.reason }, { session });
    await db.orderStatusHistory.insert({ orderId: o.id, status: 'RETURN_REQUESTED', note: req.body.reason, actorId: req.user.id }, { session });
  });
  res.json({ order: await orderDetailForPublic(await ownOrder(req)) });
}));

// ---- wishlist (server-side for members; guests keep theirs in the browser)
const slugParam = z.object({ slug: z.string().max(120) });
accountRouter.get('/wishlist', wrap(async (req, res) => {
  const items = await db.wishlistItems.find({ userId: req.user.id }, { sort: { addedAt: -1 } });
  const slugs = new Map((await db.products.find({ id: { $in: items.map((i) => i.productId) } }, { projection: { id: 1, slug: 1 } })).map((p) => [p.id, p.slug]));
  res.json({ slugs: items.map((i) => slugs.get(i.productId)).filter(Boolean) });
}));
accountRouter.put('/wishlist/:slug', validate({ params: slugParam }), wrap(async (req, res) => {
  const p = await db.products.findOne({ slug: req.params.slug }, { projection: { id: 1 } });
  if (!p) throw notFound('Watch not found.');
  await db.wishlistItems.insertIfAbsent({ userId: req.user.id, productId: p.id }, {});
  res.json({ ok: true });
}));
accountRouter.delete('/wishlist/:slug', validate({ params: slugParam }), wrap(async (req, res) => {
  const p = await db.products.findOne({ slug: req.params.slug }, { projection: { id: 1 } });
  if (p) await db.wishlistItems.delete({ userId: req.user.id, productId: p.id });
  res.json({ ok: true });
}));

// ---- reviews
accountRouter.get('/reviews', wrap(async (req, res) => {
  const rows = await db.reviews.find({ userId: req.user.id }, { sort: { createdAt: -1 } });
  const products = new Map((await db.products.find({ id: { $in: rows.map((r) => r.productId) } }, { projection: { id: 1, name: 1, slug: 1 } })).map((p) => [p.id, p]));
  res.json({
    items: rows
      .filter((r) => products.has(r.productId))
      .map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, status: r.status, createdAt: r.createdAt, productName: products.get(r.productId).name, productSlug: products.get(r.productId).slug })),
  });
}));

accountRouter.post('/reviews', validate({ body: z.object({ productSlug: z.string().max(120), rating: z.number().int().min(1).max(5), title: z.string().trim().max(100).optional(), body: z.string().trim().min(10).max(2000) }).strict() }), wrap(async (req, res) => {
  const p = await db.products.findOne({ slug: req.body.productSlug }, { projection: { id: 1 } });
  if (!p) throw notFound('Watch not found.');
  const delivered = (await db.orders.find({ userId: req.user.id, status: 'DELIVERED' }, { projection: { id: 1 } })).map((o) => o.id);
  const bought = await db.orderItems.count({ orderId: { $in: delivered }, productId: p.id });
  const review = { productId: p.id, userId: req.user.id, rating: req.body.rating, title: req.body.title ?? null, body: req.body.body, verifiedPurchase: bought > 0 };
  if (!(await db.reviews.insertIfAbsent({ userId: req.user.id, productId: p.id }, review))) throw conflict('You have already reviewed this watch.', 'ALREADY_REVIEWED');
  res.status(201).json({ review: await db.reviews.findOne({ userId: req.user.id, productId: p.id }), message: 'Thank you. Your review will appear once it has been approved.' });
}));

accountRouter.delete('/reviews/:id', validate({ params: z.object({ id: z.string().uuid() }) }), wrap(async (req, res) => {
  const r = await db.reviews.deleteOne({ id: req.params.id, userId: req.user.id });
  if (r) await recomputeRating(r.productId);
  res.json({ ok: true });
}));

export async function recomputeRating(productId) {
  const [stats] = await db.reviews.aggregate([{ $match: { productId, status: 'APPROVED' } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
  await db.products.update({ id: productId }, { ratingAvg: stats ? Math.round(stats.avg * 100) / 100 : null, ratingCount: stats?.n ?? 0 });
}

// ---- notifications
accountRouter.get('/notifications', wrap(async (req, res) => {
  const rows = await db.notifications.find({ userId: req.user.id }, { sort: { createdAt: -1 }, limit: 50 });
  res.json({ items: rows, unread: rows.filter((r) => !r.readAt).length });
}));
accountRouter.post('/notifications/read-all', wrap(async (req, res) => {
  await db.notifications.update({ userId: req.user.id, readAt: null }, { readAt: new Date() });
  res.json({ ok: true });
}));

// ---- support requests
accountRouter.get('/support', wrap(async (req, res) => {
  const rows = await db.supportRequests.find({ userId: req.user.id }, { sort: { createdAt: -1 }, projection: { reference: 1, type: 1, status: 1, subject: 1, createdAt: 1 } });
  res.json({ items: rows });
}));

export const newReference = (prefix) => `${prefix}-${randomToken(5).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7)}`;
