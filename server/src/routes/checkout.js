import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { badRequest, conflict, notFound, wrap } from '../lib/errors.js';
import { priceOrder } from '../lib/pricing.js';
import { validate } from '../middleware/validate.js';
import { strictLimiter } from '../middleware/security.js';
import { cartView, findCoupon, loadLines } from '../services/cart.js';
import { getSettings } from '../services/settings.js';
import { cancelOrder, markPaid, markPaymentFailed, placeOrder, CANCELLABLE } from '../services/orders.js';
import { razorpayClient, verifyCheckoutSignature, verifyWebhookSignature } from '../services/razorpay.js';
import { findCart } from './cart.js';

export const checkoutRouter = Router();
export const paymentsRouter = Router();
export const ordersRouter = Router();

const phone = z.string().trim().regex(/^\+?[0-9\s-]{8,15}$/, 'Enter a valid phone number');
const addressSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80),
    phone,
    line1: z.string().trim().min(3).max(120),
    line2: z.string().trim().max(120).optional().nullable(),
    city: z.string().trim().min(2).max(60),
    state: z.string().trim().min(2).max(60),
    postalCode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code'),
    country: z.literal('IN').default('IN'),
  })
  .strict();

checkoutRouter.get(
  '/options',
  wrap(async (_req, res) => {
    const st = await getSettings();
    res.json({
      delivery: Object.entries(st.delivery).map(([key, m]) => ({ key, label: m.label, feeMinor: m.feeMinor, freeAboveMinor: m.freeAboveMinor, etaDays: m.etaDays })),
      giftWrap: st.giftWrap,
      payments: {
        // Only advertise what can actually work right now.
        razorpay: Boolean(st.payments.razorpayEnabled) && (await import('../config.js')).config.razorpay.enabled,
        cod: Boolean(st.payments.codEnabled),
      },
      tax: st.tax,
      policies: st.policies,
    });
  }),
);

checkoutRouter.post(
  '/quote',
  validate({ body: z.object({ deliveryMethod: z.string().max(40).default('standard'), isGift: z.boolean().default(false) }).strict() }),
  wrap(async (req, res) => {
    const cart = await findCart(req);
    if (!cart) throw badRequest('Your cart is empty.');
    const settings = await getSettings();
    if (!settings.delivery[req.body.deliveryMethod]) throw badRequest('Unknown delivery method.');
    const lines = (await loadLines(cart.id)).filter((l) => l.purchasable);
    if (!lines.length) throw badRequest('Your cart is empty.');
    const view = await cartView(cart, req.user?.id, req.body.deliveryMethod);
    const coupon = view.coupon ? await findCoupon(view.coupon.code) : null;
    const totals = priceOrder({ lines, settings, options: req.body, coupon });
    res.json({ totals, cart: view });
  }),
);

checkoutRouter.post(
  '/place',
  validate({
    body: z
      .object({
        contactEmail: z.string().trim().toLowerCase().email().max(254),
        contactPhone: phone,
        shippingAddress: addressSchema,
        deliveryMethod: z.string().max(40),
        paymentMethod: z.enum(['razorpay', 'cod']),
        isGift: z.boolean().default(false),
        giftMessage: z.string().trim().max(300).optional(),
        notes: z.string().trim().max(500).optional(),
        idempotencyKey: z.string().min(16).max(80).optional(),
      })
      .strict(),
  }),
  wrap(async (req, res) => {
    const cart = await findCart(req);
    if (!cart) throw badRequest('Your cart is empty.');
    const { order, gateway, duplicate } = await placeOrder({ cart, user: req.user ?? null, input: req.body });
    res.status(duplicate ? 200 : 201).json({
      order: { orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus, totalMinor: Number(order.totalMinor) },
      gateway,
      duplicate,
    });
  }),
);

/** Public order lookup. Requires the order number AND the email or phone used at checkout. */
const trackQuery = z.object({ orderNumber: z.string().trim().toUpperCase().max(30), contact: z.string().trim().max(254) });
const digits = (v) => v.replace(/\D/g, '').slice(-10);

export async function orderDetailForPublic(order) {
  const [items, history, shipment, payment] = await Promise.all([
    db.orderItems.find({ orderId: order.id }, { projection: { productName: 1, brandName: 1, imageUrl: 1, quantity: 1, unitPriceMinor: 1, lineTotalMinor: 1 } }),
    db.orderStatusHistory.find({ orderId: order.id }, { sort: { createdAt: 1, _id: 1 } }),
    db.shipments.findOne({ orderId: order.id }, { projection: { carrier: 1, trackingNumber: 1, trackingUrl: 1, estimatedDeliveryAt: 1 } }),
    db.payments.findOne({ orderId: order.id }, { projection: { provider: 1 } }),
  ]);
  const timeline = history.map((h) => ({ status: h.status, note: h.note, at: h.createdAt }));
  const settings = await getSettings();
  return {
    orderNumber: order.orderNumber,
    placedAt: order.placedAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentProvider: payment?.provider ?? null,
    deliveryMethod: order.deliveryMethod,
    totals: { subtotalMinor: Number(order.subtotalMinor), discountMinor: Number(order.discountMinor), shippingMinor: Number(order.shippingMinor), giftWrapMinor: Number(order.giftWrapMinor), taxMinor: Number(order.taxMinor), totalMinor: Number(order.totalMinor), refundedMinor: Number(order.refundedMinor) },
    shippingTo: { fullName: order.shippingAddress.fullName, city: order.shippingAddress.city, state: order.shippingAddress.state, postalCode: order.shippingAddress.postalCode },
    items,
    timeline,
    shipment: shipment ?? null,
    canCancel: CANCELLABLE.includes(order.status),
    canReturn: order.status === 'DELIVERED' && order.deliveredAt && Date.now() - new Date(order.deliveredAt).getTime() <= settings.policies.returnWindowDays * 86400_000,
  };
}

export async function findOrderForContact(orderNo, contact) {
  const order = await db.orders.findOne({ orderNumber: orderNo });
  const c = contact.trim();
  const ok = order && (c.includes('@') ? order.contactEmail === c.toLowerCase() : digits(c).length >= 8 && digits(order.contactPhone) === digits(c));
  return ok ? order : null; // identical result for "no such order" and "wrong contact"
}

ordersRouter.get(
  '/track',
  strictLimiter,
  validate({ query: trackQuery }),
  wrap(async (req, res) => {
    const order = await findOrderForContact(req.query.orderNumber, req.query.contact);
    if (!order) throw notFound('We could not find an order matching those details.');
    res.json({ order: await orderDetailForPublic(order) });
  }),
);

ordersRouter.post(
  '/cancel',
  strictLimiter,
  validate({ body: trackQuery.extend({ reason: z.string().trim().max(300).optional() }).strict() }),
  wrap(async (req, res) => {
    const order = await findOrderForContact(req.body.orderNumber, req.body.contact);
    if (!order) throw notFound('We could not find an order matching those details.');
    if (!CANCELLABLE.includes(order.status)) throw conflict('This order can no longer be cancelled.', 'NOT_CANCELLABLE');
    await cancelOrder(order.id, { reason: req.body.reason ?? 'Cancelled by customer' });
    const fresh = await findOrderForContact(req.body.orderNumber, req.body.contact);
    res.json({ order: await orderDetailForPublic(fresh) });
  }),
);

// ---------------------------------------------------------------- payments

/** Called by the browser after Razorpay Checkout. The browser's word is never trusted on its own. */
paymentsRouter.post(
  '/razorpay/verify',
  validate({ body: z.object({ razorpay_order_id: z.string().max(80), razorpay_payment_id: z.string().max(80), razorpay_signature: z.string().max(200) }).strict() }),
  wrap(async (req, res) => {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    if (!verifyCheckoutSignature({ orderId, paymentId, signature })) throw badRequest('Payment signature could not be verified.');

    // Second, independent check straight from Razorpay: the payment must be captured/authorised for this order.
    let remote;
    try {
      remote = await razorpayClient().payments.fetch(paymentId);
    } catch {
      return res.status(202).json({ status: 'pending', message: 'Payment received; confirmation is in progress.' });
    }
    if (remote.order_id !== orderId) throw badRequest('Payment does not belong to this order.');
    if (!['captured', 'authorized'].includes(remote.status)) {
      return res.status(202).json({ status: 'pending', message: 'Payment is still being confirmed.' });
    }
    const result = await markPaid({ providerOrderId: orderId, providerPaymentId: paymentId, amountMinor: remote.amount, method: remote.method });
    const order = await db.orders.findOne({ id: result.orderId }, { projection: { orderNumber: 1, paymentStatus: 1 } });
    res.json({ status: 'paid', orderNumber: order.orderNumber });
  }),
);

/** Mounted with express.raw() so the HMAC is computed over the exact bytes Razorpay signed. */
export async function razorpayWebhook(req, res, next) {
  try {
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    if (!verifyWebhookSignature(raw, req.get('x-razorpay-signature'))) return res.status(400).json({ error: { message: 'Invalid signature' } });
    const event = JSON.parse(raw);
    const eventId = req.get('x-razorpay-event-id') ?? `${event.event}:${event.payload?.payment?.entity?.id ?? event.created_at}`;

    const fresh = await db.paymentEvents.insertIfAbsent({ eventId }, { eventId, provider: 'razorpay', type: event.event });
    if (!fresh) return res.json({ ok: true, duplicate: true }); // replay: do nothing

    const pay = event.payload?.payment?.entity;
    try {
      if (['payment.captured', 'order.paid'].includes(event.event)) {
        const entity = pay ?? event.payload?.order?.entity;
        const p = event.payload?.payment?.entity ?? {};
        await markPaid({ providerOrderId: p.order_id ?? entity?.id, providerPaymentId: p.id ?? null, amountMinor: p.amount ?? entity?.amount_paid, method: p.method });
      } else if (event.event === 'payment.failed' && pay) {
        await markPaymentFailed({ providerOrderId: pay.order_id, reason: pay.error_description });
      } else if (event.event === 'refund.processed') {
        const refund = event.payload?.refund?.entity;
        if (refund?.payment_id) {
          const p = await db.payments.findOne({ providerPaymentId: refund.payment_id });
          if (p) {
            await db.orders.update({ id: p.orderId }, [{ $set: { refundedMinor: { $min: [{ $add: ['$refundedMinor', Number(refund.amount) || 0] }, '$totalMinor'] }, paymentStatus: 'REFUNDED', updatedAt: new Date() } }]);
          }
        }
      }
    } catch (err) {
      // Let Razorpay retry: forget the event id so the retry is processed instead of skipped.
      await db.paymentEvents.delete({ eventId });
      throw err;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
