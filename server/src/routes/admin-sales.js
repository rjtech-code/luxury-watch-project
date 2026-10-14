import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { badRequest, conflict, notFound, wrap } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { requirePermission, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { NEXT_STATUS, updateOrderStatus } from '../services/orders.js';
import { razorpayClient } from '../services/razorpay.js';
import { config } from '../config.js';
import { contains } from './catalog.js';

export const adminSalesRouter = Router();

const PAID = { $in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] };
const dateRange = z.object({ from: z.string().date().optional(), to: z.string().date().optional(), granularity: z.enum(['day', 'week', 'month']).default('day') });

function range({ from, to }) {
  const end = to ? new Date(`${to}T23:59:59.999+05:30`) : new Date();
  const start = from ? new Date(`${from}T00:00:00+05:30`) : new Date(end.getTime() - 29 * 86400_000);
  return { start, end };
}
const inRange = (r) => ({ placedAt: { $gte: r.start, $lte: r.end } });

/** Order items of paid orders in the range, grouped by `key`, biggest revenue first. */
const paidItemsBy = (r, key, extra = {}) =>
  db.orders.aggregate([
    { $match: { ...inRange(r), paymentStatus: PAID } },
    { $lookup: { from: 'order_items', localField: 'id', foreignField: 'orderId', as: 'it' } },
    { $unwind: '$it' },
    { $group: { _id: key, units: { $sum: '$it.quantity' }, revenueMinor: { $sum: '$it.lineTotalMinor' }, ...extra } },
    { $sort: { revenueMinor: -1 } },
  ]);

/**
 * Revenue definitions (shown in the UI as well):
 *   Gross sales = total of orders that have been PAID (COD counts once delivered)
 *   Refunds     = amount refunded on those orders
 *   Net sales   = Gross sales - Refunds
 * Cancelled orders never count as sales.
 */
adminSalesRouter.get('/dashboard', requirePermission('sales.read'), validate({ query: dateRange }), wrap(async (req, res) => {
  const r = range(req.query);
  const g = req.query.granularity;
  const bucket = { $dateTrunc: { date: '$placedAt', unit: g, timezone: 'Asia/Kolkata', ...(g === 'week' && { startOfWeek: 'monday' }) } };
  const [[totals], pending, cancelled, returnsOpen, series, byProduct, byBrand, lowStock] = await Promise.all([
    db.orders.aggregate([
      { $match: { ...inRange(r), paymentStatus: PAID } },
      { $group: { _id: null, orders: { $sum: 1 }, grossMinor: { $sum: '$totalMinor' }, refundsMinor: { $sum: '$refundedMinor' }, discountMinor: { $sum: '$discountMinor' } } },
    ]),
    db.orders.count({ ...inRange(r), status: { $in: ['PENDING_PAYMENT', 'PROCESSING', 'PACKED'] } }),
    db.orders.count({ ...inRange(r), status: 'CANCELLED' }),
    db.returns.count({ status: 'REQUESTED' }),
    db.orders.aggregate([
      { $match: { ...inRange(r), paymentStatus: PAID } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: bucket, timezone: 'Asia/Kolkata' } }, orders: { $sum: 1 }, gross: { $sum: '$totalMinor' }, refunds: { $sum: '$refundedMinor' } } },
      { $sort: { _id: 1 } },
    ]),
    paidItemsBy(r, { name: '$it.productName', brand: '$it.brandName', productId: '$it.productId' }),
    paidItemsBy(r, '$it.brandName'),
    db.inventory.aggregate([
      { $match: { $expr: { $lte: [{ $subtract: ['$onHand', '$reserved'] }, '$lowStockThreshold'] } } },
      { $lookup: { from: 'product_variants', localField: 'variantId', foreignField: 'id', as: 'v' } },
      { $match: { 'v.isActive': true } },
      { $count: 'n' },
    ]),
  ]);

  // Top products by name; categories through each sold product's current category.
  const topMap = new Map();
  for (const x of byProduct) {
    const k = `${x._id.name}\u0000${x._id.brand}`;
    const cur = topMap.get(k) ?? { name: x._id.name, brand: x._id.brand, units: 0, revenueMinor: 0 };
    cur.units += x.units;
    cur.revenueMinor += x.revenueMinor;
    topMap.set(k, cur);
  }
  const topProducts = [...topMap.values()].sort((a, b) => b.revenueMinor - a.revenueMinor).slice(0, 10);
  const products = await db.products.find({ id: { $in: byProduct.map((x) => x._id.productId).filter(Boolean) } }, { projection: { id: 1, categoryId: 1 } });
  const categories = await db.categories.find({ id: { $in: products.map((p) => p.categoryId).filter(Boolean) } }, { projection: { id: 1, name: 1 } });
  const catOf = new Map(products.map((p) => [p.id, categories.find((c) => c.id === p.categoryId)?.name ?? 'Uncategorised']));
  const catMap = new Map();
  for (const x of byProduct) {
    const name = catOf.get(x._id.productId) ?? 'Uncategorised';
    const cur = catMap.get(name) ?? { name, units: 0, revenueMinor: 0 };
    cur.units += x.units;
    cur.revenueMinor += x.revenueMinor;
    catMap.set(name, cur);
  }

  const t = totals ?? { orders: 0, grossMinor: 0, refundsMinor: 0, discountMinor: 0 };
  res.json({
    range: { from: r.start, to: r.end, granularity: g },
    kpis: { orders: t.orders, grossMinor: t.grossMinor, refundsMinor: t.refundsMinor, netMinor: t.grossMinor - t.refundsMinor, discountMinor: t.discountMinor, averageOrderMinor: t.orders ? Math.round(t.grossMinor / t.orders) : 0, pendingOrders: pending, cancelledOrders: cancelled, openReturnRequests: returnsOpen, inventoryAlerts: lowStock[0]?.n ?? 0 },
    series: series.map((x) => ({ bucket: x._id, orders: x.orders, grossMinor: x.gross, refundsMinor: x.refunds, netMinor: x.gross - x.refunds })),
    topProducts,
    byBrand: byBrand.map((x) => ({ name: x._id, units: x.units, revenueMinor: x.revenueMinor })),
    byCategory: [...catMap.values()].sort((a, b) => b.revenueMinor - a.revenueMinor),
  });
}));

adminSalesRouter.get('/analytics', requirePermission('sales.read'), validate({ query: dateRange }), wrap(async (req, res) => {
  const r = range(req.query);
  const [newCustomers, [rep], perProduct] = await Promise.all([
    db.users.count({ role: 'CUSTOMER', createdAt: { $gte: r.start, $lte: r.end } }),
    db.orders.aggregate([
      { $match: { userId: { $ne: null }, paymentStatus: PAID } },
      { $group: { _id: '$userId', n: { $sum: 1 } } },
      { $group: { _id: null, buyers: { $sum: 1 }, repeat: { $sum: { $cond: [{ $gt: ['$n', 1] }, 1, 0] } } } },
    ]),
    paidItemsBy(r, '$it.productName', { orderIds: { $addToSet: '$id' } }),
  ]);
  const buyers = rep?.buyers ?? 0;
  const repeat = rep?.repeat ?? 0;
  res.json({
    newCustomers,
    repeatPurchase: { buyers, repeatBuyers: repeat, rate: buyers ? repeat / buyers : null },
    productPerformance: perProduct.slice(0, 50).map((x) => ({ name: x._id, units: x.units, revenueMinor: x.revenueMinor, orders: x.orderIds.length })),
    conversionFunnel: null /* not tracked: requires analytics events */,
  });
}));

const csvCell = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) || /^[=+\-@]/.test(t) ? `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"` : t; };

adminSalesRouter.get('/reports/sales.csv', requirePermission('reports.export'), validate({ query: dateRange }), wrap(async (req, res) => {
  const r = range(req.query);
  const rows = await db.orders.find(inRange(r), { sort: { placedAt: 1 }, limit: 50000 });
  const head = ['Order', 'Placed (UTC)', 'Status', 'Payment', 'Subtotal INR', 'Discount INR', 'Shipping INR', 'Tax INR (incl.)', 'Total INR', 'Refunded INR', 'Net INR', 'City'];
  const lines = rows.map((x) => [x.orderNumber, x.placedAt.toISOString(), x.status, x.paymentStatus, x.subtotalMinor / 100, x.discountMinor / 100, x.shippingMinor / 100, x.taxMinor / 100, x.totalMinor / 100, x.refundedMinor / 100, (x.totalMinor - x.refundedMinor) / 100, x.shippingAddress?.city].map(csvCell).join(','));
  await audit(req, 'report.export', 'sales', null, { from: r.start, to: r.end, rows: rows.length });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="sales-${r.start.toISOString().slice(0, 10)}_${r.end.toISOString().slice(0, 10)}.csv"` }).send([head.join(','), ...lines].join('\n'));
}));

// ---------------------------------------------------------------- orders
const orderList = z.object({ q: z.string().trim().max(80).optional(), status: z.string().max(30).optional(), payment: z.string().max(30).optional(), from: z.string().date().optional(), to: z.string().date().optional(), page: z.coerce.number().int().min(1).default(1) });

adminSalesRouter.get('/orders', requirePermission('orders.read'), validate({ query: orderList }), wrap(async (req, res) => {
  const q = req.query;
  const where = {};
  if (q.status) where.status = q.status;
  if (q.payment) where.paymentStatus = q.payment;
  if (q.q) where.$or = [{ orderNumber: contains(q.q) }, { contactEmail: contains(q.q) }, { contactPhone: contains(q.q) }];
  if (q.from || q.to) where.placedAt = { ...(q.from && { $gte: new Date(`${q.from}T00:00:00+05:30`) }), ...(q.to && { $lte: new Date(`${q.to}T23:59:59+05:30`) }) };
  const size = 20;
  const [n, rows] = await Promise.all([db.orders.count(where), db.orders.find(where, { sort: { placedAt: -1 }, skip: (q.page - 1) * size, limit: size })]);
  res.json({
    items: rows.map((x) => ({ orderNumber: x.orderNumber, status: x.status, paymentStatus: x.paymentStatus, totalMinor: x.totalMinor, refundedMinor: x.refundedMinor, placedAt: x.placedAt, contactEmail: x.contactEmail, customer: x.shippingAddress?.fullName ?? null })),
    total: n,
    pages: Math.max(1, Math.ceil(n / size)),
  });
}));

adminSalesRouter.get('/orders/:orderNumber', requirePermission('orders.read'), validate({ params: z.object({ orderNumber: z.string().max(30) }) }), wrap(async (req, res) => {
  const o = await db.orders.findOne({ orderNumber: req.params.orderNumber.toUpperCase() });
  if (!o) throw notFound('Order not found.');
  const [items, timeline, shipments, payments, returns] = await Promise.all([
    db.orderItems.find({ orderId: o.id }),
    db.orderStatusHistory.find({ orderId: o.id }, { sort: { createdAt: 1, _id: 1 } }),
    db.shipments.find({ orderId: o.id }),
    db.payments.find({ orderId: o.id }, { projection: { provider: 1, status: 1, amountMinor: 1, method: 1, providerPaymentId: 1, failureReason: 1 } }),
    db.returns.find({ orderId: o.id }),
  ]);
  res.json({ order: o, items, timeline, shipments, payments, returns, nextStatuses: NEXT_STATUS[o.status] ?? [] });
}));

adminSalesRouter.patch('/orders/:orderNumber/status', requirePermission('orders.update'), validate({
  params: z.object({ orderNumber: z.string().max(30) }),
  body: z.object({ status: z.enum(['PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED']), note: z.string().trim().max(300).optional(), shipment: z.object({ carrier: z.string().max(60).optional(), trackingNumber: z.string().max(80).optional(), trackingUrl: z.string().url().max(300).optional(), estimatedDeliveryAt: z.string().datetime().optional() }).strict().optional() }).strict(),
}), wrap(async (req, res) => {
  const o = await db.orders.findOne({ orderNumber: req.params.orderNumber.toUpperCase() });
  if (!o) throw notFound('Order not found.');
  const updated = await updateOrderStatus(o.id, req.body.status, { note: req.body.note, actorId: req.user.id, shipment: req.body.shipment });
  await audit(req, 'order.status', 'order', o.orderNumber, { from: o.status, to: req.body.status });
  res.json({ order: { orderNumber: updated.orderNumber, status: updated.status } });
}));

/** Refunds move money, so they are restricted to SUPER_ADMIN regardless of manager permissions. */
adminSalesRouter.post('/orders/:orderNumber/refund', requireRole('SUPER_ADMIN'), validate({
  params: z.object({ orderNumber: z.string().max(30) }),
  body: z.object({ amountMinor: z.number().int().positive(), note: z.string().trim().max(300).optional() }).strict(),
}), wrap(async (req, res) => {
  const o = await db.orders.findOne({ orderNumber: req.params.orderNumber.toUpperCase() });
  if (!o) throw notFound('Order not found.');
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(o.paymentStatus)) throw conflict('Only paid orders can be refunded.', 'NOT_REFUNDABLE');
  const remaining = Number(o.totalMinor) - Number(o.refundedMinor);
  if (req.body.amountMinor > remaining) throw badRequest('Refund exceeds the amount still refundable.');
  const pay = await db.payments.findOne({ orderId: o.id });

  let gatewayRefundId = null;
  if (pay?.provider === 'razorpay' && pay.providerPaymentId) {
    if (!config.razorpay.enabled) throw conflict('Razorpay is not configured, so a gateway refund cannot be issued.', 'PAYMENTS_NOT_CONFIGURED');
    const rf = await razorpayClient().payments.refund(pay.providerPaymentId, { amount: req.body.amountMinor, notes: { orderNumber: o.orderNumber } });
    gatewayRefundId = rf.id;
  }
  const refunded = Number(o.refundedMinor) + req.body.amountMinor;
  await db.orders.update({ id: o.id }, { refundedMinor: refunded, paymentStatus: refunded >= Number(o.totalMinor) ? 'REFUNDED' : 'PARTIALLY_REFUNDED', updatedAt: new Date() });
  await db.orderStatusHistory.insert({ orderId: o.id, status: o.status, note: `Refund of ₹${(req.body.amountMinor / 100).toLocaleString('en-IN')} recorded${gatewayRefundId ? ` (gateway ${gatewayRefundId})` : ' (manual: COD or offline)'}${req.body.note ? `: ${req.body.note}` : ''}`, actorId: req.user.id });
  await audit(req, 'order.refund', 'order', o.orderNumber, { amountMinor: req.body.amountMinor, gatewayRefundId });
  res.json({ ok: true, refundedMinor: refunded, gatewayRefundId });
}));

// ---------------------------------------------------------------- returns
adminSalesRouter.get('/returns', requirePermission('orders.read'), wrap(async (_req, res) => {
  const rows = await db.returns.find({}, { sort: { createdAt: -1 }, limit: 100 });
  const orders = new Map((await db.orders.find({ id: { $in: rows.map((r) => r.orderId) } }, { projection: { id: 1, orderNumber: 1, totalMinor: 1 } })).map((o) => [o.id, o]));
  res.json({
    items: rows
      .filter((r) => orders.has(r.orderId))
      .map((r) => ({ id: r.id, status: r.status, reason: r.reason, createdAt: r.createdAt, refundMinor: r.refundMinor, orderNumber: orders.get(r.orderId).orderNumber, totalMinor: orders.get(r.orderId).totalMinor })),
  });
}));

adminSalesRouter.patch('/returns/:id', requirePermission('orders.update'), validate({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ status: z.enum(['APPROVED', 'REJECTED', 'RECEIVED']), adminNote: z.string().trim().max(500).optional() }).strict(),
}), wrap(async (req, res) => {
  const r = await db.returns.updateOne({ id: req.params.id }, { status: req.body.status, adminNote: req.body.adminNote ?? null, resolvedAt: req.body.status === 'REJECTED' ? new Date() : null });
  if (!r) throw notFound('Return not found.');
  if (req.body.status === 'REJECTED') {
    await db.orders.update({ id: r.orderId, status: 'RETURN_REQUESTED' }, { status: 'DELIVERED', updatedAt: new Date() });
  }
  await audit(req, 'return.update', 'return', r.id, { status: req.body.status });
  res.json({ return: r });
}));

// ---------------------------------------------------------------- inventory
adminSalesRouter.get('/inventory', requirePermission('inventory.read'), validate({ query: z.object({ q: z.string().trim().max(80).optional(), alertsOnly: z.enum(['true', 'false']).optional(), page: z.coerce.number().int().min(1).default(1) }) }), wrap(async (req, res) => {
  const size = 25;
  const rx = req.query.q ? contains(req.query.q) : null;
  const [out] = await db.inventory.aggregate([
    ...(req.query.alertsOnly === 'true' ? [{ $match: { $expr: { $lte: [{ $subtract: ['$onHand', '$reserved'] }, '$lowStockThreshold'] } } }] : []),
    { $lookup: { from: 'product_variants', localField: 'variantId', foreignField: 'id', as: 'v' } },
    { $unwind: '$v' },
    { $lookup: { from: 'products', localField: 'v.productId', foreignField: 'id', as: 'p' } },
    { $unwind: '$p' },
    { $lookup: { from: 'brands', localField: 'p.brandId', foreignField: 'id', as: 'b' } },
    { $unwind: '$b' },
    ...(rx ? [{ $match: { $or: [{ 'p.name': rx }, { 'v.sku': rx }, { 'b.name': rx }] } }] : []),
    { $addFields: { avail: { $subtract: ['$onHand', '$reserved'] } } },
    {
      $facet: {
        total: [{ $count: 'n' }],
        items: [
          { $sort: { avail: 1, 'p.name': 1 } },
          { $skip: (req.query.page - 1) * size },
          { $limit: size },
          { $project: { _id: 0, variantId: '$v.id', sku: '$v.sku', product: '$p.name', brand: '$b.name', onHand: 1, reserved: 1, threshold: '$lowStockThreshold', status: '$p.status' } },
        ],
      },
    },
  ]);
  const n = out.total[0]?.n ?? 0;
  res.json({ items: out.items.map((r) => ({ ...r, available: Math.max(0, r.onHand - r.reserved), low: r.onHand - r.reserved <= r.threshold })), total: n, pages: Math.max(1, Math.ceil(n / size)) });
}));

adminSalesRouter.patch('/inventory/:variantId', requirePermission('inventory.write'), validate({
  params: z.object({ variantId: z.string().uuid() }),
  body: z.object({ onHand: z.number().int().min(0).max(100000).optional(), lowStockThreshold: z.number().int().min(0).max(1000).optional() }).strict(),
}), wrap(async (req, res) => {
  const before = await db.inventory.findOne({ variantId: req.params.variantId });
  if (!before) throw notFound('Inventory record not found.');
  if (req.body.onHand !== undefined && req.body.onHand < before.reserved) throw conflict(`${before.reserved} unit(s) are reserved by open orders, so stock cannot go below that.`, 'BELOW_RESERVED');
  // Conditional on reserved not having grown past the new on-hand figure in the meantime.
  const guard = req.body.onHand !== undefined ? { reserved: { $lte: req.body.onHand } } : {};
  const after = await db.inventory.updateOne({ variantId: req.params.variantId, ...guard }, { ...req.body, updatedAt: new Date() });
  if (!after) throw conflict('Stock was reserved by an order at the same time. Please reload and try again.', 'BELOW_RESERVED');
  await audit(req, 'inventory.update', 'variant', req.params.variantId, { before: { onHand: before.onHand, threshold: before.lowStockThreshold }, after: { onHand: after.onHand, threshold: after.lowStockThreshold } });
  // Back in stock: tell people who asked to be notified.
  if (before.onHand - before.reserved <= 0 && after.onHand - after.reserved > 0) await notifyRestock(req.params.variantId);
  res.json({ inventory: after });
}));

async function notifyRestock(variantId) {
  const { sendMail } = await import('../lib/mailer.js');
  const v = await db.productVariants.findOne({ id: variantId });
  const p = v && (await db.products.findOne({ id: v.productId }));
  if (!p) return;
  const subs = await db.restockSubscriptions.find({ productId: p.id, notifiedAt: null });
  for (const sub of subs) {
    await sendMail({ to: sub.email, subject: `${p.name} is back in stock`, text: `Good news: ${p.name} is available again.\n${config.webOrigin}/watches/${p.slug}` });
    await db.restockSubscriptions.update({ id: sub.id }, { notifiedAt: new Date() });
  }
}
