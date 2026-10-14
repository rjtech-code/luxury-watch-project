import { db, withTx } from '../db/client.js';
import { config } from '../config.js';
import { badRequest, conflict, HttpError, notFound } from '../lib/errors.js';
import { orderNumber } from '../lib/crypto.js';
import { couponProblem, priceOrder } from '../lib/pricing.js';
import { sendMail } from '../lib/mailer.js';
import { findCoupon, loadLines, userCouponUsage } from './cart.js';
import { getSettings } from './settings.js';
import { razorpayClient } from './razorpay.js';

const UNPAID_HOLD_MINUTES = 30;
export const CANCELLABLE = ['PENDING_PAYMENT', 'PROCESSING'];

/**
 * Stock model per variant:  available = on_hand - reserved.
 *  - placing an order RESERVES stock (atomic conditional update, so two buyers can never both get the last piece)
 *  - payment confirmed / COD placed COMMITS it (reserved and on_hand both drop)
 *  - cancel or expiry of an unpaid order RELEASES the reservation
 *  - cancelling a committed order puts the units back on hand
 */
async function reserve(session, variantId, qty, label) {
  const ok = await db.inventory.updateOne(
    { variantId, $expr: { $gte: [{ $subtract: ['$onHand', '$reserved'] }, qty] } },
    { $inc: { reserved: qty }, $set: { updatedAt: new Date() } },
    { session },
  );
  if (!ok) throw conflict(`"${label}" no longer has enough stock.`, 'INSUFFICIENT_STOCK');
}

/** Pipeline update that lowers a counter by n without going below zero. */
const decrease = (field, n) => ({ [field]: { $max: [{ $subtract: [`$${field}`, n] }, 0] } });

async function commitStock(session, items) {
  for (const it of items) {
    if (!it.variantId) continue;
    await db.inventory.update({ variantId: it.variantId }, [{ $set: { ...decrease('onHand', it.quantity), ...decrease('reserved', it.quantity), updatedAt: new Date() } }], { session });
  }
}

async function releaseReservation(session, items) {
  for (const it of items) {
    if (!it.variantId) continue;
    await db.inventory.update({ variantId: it.variantId }, [{ $set: { ...decrease('reserved', it.quantity), updatedAt: new Date() } }], { session });
  }
}

async function restockCommitted(session, items) {
  for (const it of items) {
    if (!it.variantId) continue;
    await db.inventory.update({ variantId: it.variantId }, { $inc: { onHand: it.quantity }, $set: { updatedAt: new Date() } }, { session });
  }
}

const history = (session, orderId, status, note, actorId = null) => db.orderStatusHistory.insert({ orderId, status, note, actorId }, { session });

export async function placeOrder({ cart, user, input }) {
  const settings = await getSettings({ fresh: true });
  if (!settings.delivery[input.deliveryMethod]) throw badRequest('Please choose a valid delivery method.');
  if (input.paymentMethod === 'razorpay' && !settings.payments.razorpayEnabled) throw badRequest('Online payment is not available.');
  if (input.paymentMethod === 'cod' && !settings.payments.codEnabled) throw badRequest('Cash on delivery is not available.');

  // Fail early, before touching any stock, if the gateway is needed but not configured.
  if (input.paymentMethod === 'razorpay' && !config.razorpay.enabled) {
    throw new HttpError(503, 'Online payments are not configured yet. Please contact the store.', 'PAYMENTS_NOT_CONFIGURED');
  }

  if (input.idempotencyKey) {
    const dup = await db.orders.findOne({ idempotencyKey: input.idempotencyKey });
    if (dup) return { order: dup, duplicate: true };
  }

  const placed = await withTx(async (session) => {
    const lines = await loadLines(cart.id, session);
    if (!lines.length) throw badRequest('Your cart is empty.');
    const bad = lines.find((l) => !l.purchasable);
    if (bad) throw conflict(`"${bad.name}" is no longer available. Please remove it from your cart.`, 'ITEM_UNAVAILABLE');

    for (const l of lines) await reserve(session, l.variantId, l.quantity, l.name);

    const subtotal = lines.reduce((a, l) => a + l.unitPriceMinor * l.quantity, 0);
    let coupon = null;
    if (cart.couponCode) {
      const row = await findCoupon(cart.couponCode, session);
      const problem = couponProblem(row, { subtotalMinor: subtotal, userUsageCount: await userCouponUsage(user?.id, row?.code, session) });
      if (problem) throw badRequest(problem);
      // Atomic usage-limit check so concurrent orders can't exceed the limit.
      const bumped = await db.coupons.updateOne(
        { id: row.id, $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
        { $inc: { usedCount: 1 } },
        { session },
      );
      if (!bumped) throw badRequest('This coupon has reached its usage limit.');
      coupon = row;
    }

    const totals = priceOrder({
      lines: lines.map((l) => ({ unitPriceMinor: l.unitPriceMinor, quantity: l.quantity })),
      settings,
      options: { deliveryMethod: input.deliveryMethod, isGift: input.isGift },
      coupon,
    });

    const isCod = input.paymentMethod === 'cod';
    const points = settings.loyalty?.enabled ? Math.floor((totals.totalMinor / 10000) * settings.loyalty.pointsPerHundredRupees) : 0;

    const order = await db.orders.insert({
      orderNumber: orderNumber(),
      userId: user?.id ?? null,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      shippingAddress: input.shippingAddress,
      deliveryMethod: input.deliveryMethod,
      status: isCod ? 'PROCESSING' : 'PENDING_PAYMENT',
      paymentStatus: 'PENDING',
      ...totals,
      couponCode: coupon?.code ?? null,
      isGift: input.isGift,
      giftMessage: input.isGift ? input.giftMessage ?? null : null,
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      loyaltyPointsEarned: points,
    }, { session });

    const items = await db.orderItems.insertMany(
      lines.map((l) => ({
        orderId: order.id,
        productId: l.productId,
        variantId: l.variantId,
        productName: l.name,
        brandName: l.brandName,
        sku: l.sku,
        imageUrl: l.image ?? null,
        unitPriceMinor: l.unitPriceMinor,
        quantity: l.quantity,
        lineTotalMinor: l.unitPriceMinor * l.quantity,
      })),
      { session },
    );

    const payment = await db.payments.insert({ orderId: order.id, provider: isCod ? 'cod' : 'razorpay', amountMinor: totals.totalMinor, method: isCod ? 'cod' : null }, { session });
    await history(session, order.id, order.status, isCod ? 'Order placed (cash on delivery)' : 'Order placed, awaiting payment');

    if (isCod) {
      await commitStock(session, items);
      await db.cartItems.delete({ cartId: cart.id }, { session });
      await db.carts.update({ id: cart.id }, { couponCode: null }, { session });
    }
    return { order, items, payment };
  });

  let gateway = null;
  if (input.paymentMethod === 'razorpay') {
    try {
      const rzp = await razorpayClient().orders.create({
        amount: placed.order.totalMinor,
        currency: 'INR',
        receipt: placed.order.orderNumber,
        notes: { orderNumber: placed.order.orderNumber },
      });
      await db.payments.update({ id: placed.payment.id }, { providerOrderId: rzp.id, updatedAt: new Date() });
      gateway = { provider: 'razorpay', keyId: config.razorpay.keyId, razorpayOrderId: rzp.id, amountMinor: placed.order.totalMinor, currency: 'INR' };
    } catch (err) {
      // Could not open a payment session: cancel the order so stock is released immediately.
      await cancelOrder(placed.order.id, { reason: 'Payment session could not be created', system: true });
      throw new HttpError(502, 'We could not start the payment. Please try again.', 'GATEWAY_ERROR');
    }
  } else {
    await notifyOrder(placed.order, 'Order confirmed', 'Thank you for your order. You will pay cash on delivery.');
  }
  return { order: placed.order, items: placed.items, gateway, duplicate: false };
}

/**
 * Idempotent: safe to call from the checkout callback, the webhook, or both, in any order and any
 * number of times. The payment is claimed with a conditional update, so only the first call changes anything.
 */
export async function markPaid({ providerOrderId, providerPaymentId, amountMinor, method }) {
  const result = await withTx(async (session) => {
    const payment = await db.payments.findOne({ providerOrderId }, { session });
    if (!payment) throw notFound('Payment not found.');
    if (payment.status === 'PAID') return { already: true, orderId: payment.orderId };
    if (Number(amountMinor) !== Number(payment.amountMinor)) {
      throw new HttpError(409, 'Paid amount does not match the order total.', 'AMOUNT_MISMATCH');
    }
    const claimed = await db.payments.updateOne(
      { id: payment.id, status: { $ne: 'PAID' } },
      { status: 'PAID', providerPaymentId: providerPaymentId ?? null, method: method ?? payment.method, updatedAt: new Date() },
      { session },
    );
    if (!claimed) return { already: true, orderId: payment.orderId };

    const order = await db.orders.findOne({ id: payment.orderId }, { session });
    const items = await db.orderItems.find({ orderId: order.id }, { session });

    if (order.status === 'CANCELLED') {
      // Money arrived for an order we already cancelled/expired: flag for a manual refund, do not ship.
      await db.orders.update({ id: order.id }, { paymentStatus: 'PAID', updatedAt: new Date() }, { session });
      await history(session, order.id, 'CANCELLED', 'Payment received after cancellation: refund required');
      return { already: false, orderId: order.id, lateAfterCancel: true };
    }

    await commitStock(session, items);
    const updated = await db.orders.updateOne({ id: order.id }, { paymentStatus: 'PAID', status: 'PROCESSING', updatedAt: new Date() }, { session });
    await history(session, order.id, 'PROCESSING', 'Payment confirmed');

    for (const it of items) if (it.productId) await db.products.update({ id: it.productId }, { $inc: { popularity: it.quantity } }, { session });

    if (order.userId && order.loyaltyPointsEarned > 0) {
      await db.users.update({ id: order.userId }, { $inc: { loyaltyPoints: order.loyaltyPointsEarned } }, { session });
      await db.loyaltyLedger.insert({ userId: order.userId, orderId: order.id, points: order.loyaltyPointsEarned, reason: `Order ${order.orderNumber}` }, { session });
    }
    // Empty whichever cart (member or guest) these items came from.
    const variantIds = items.map((i) => i.variantId).filter(Boolean);
    if (order.userId && variantIds.length) {
      const cart = await db.carts.findOne({ userId: order.userId }, { session });
      if (cart) {
        await db.cartItems.delete({ cartId: cart.id, variantId: { $in: variantIds } }, { session });
        await db.carts.update({ id: cart.id }, { couponCode: null }, { session });
      }
    }
    return { already: false, orderId: order.id, order: updated };
  });

  if (!result.already && result.order) await notifyOrder(result.order, 'Payment received', 'Thank you. Your payment was received and your order is being prepared.');
  return result;
}

export async function markPaymentFailed({ providerOrderId, reason }) {
  await db.payments.update({ providerOrderId, status: { $ne: 'PAID' } }, { status: 'FAILED', failureReason: reason?.slice(0, 300) ?? null, updatedAt: new Date() });
}

/** Cancels an order and puts stock back correctly depending on whether it was committed. */
export async function cancelOrder(orderId, { reason, actorId = null, system = false } = {}) {
  return withTx(async (session) => {
    const order = await db.orders.findOne({ id: orderId }, { session });
    if (!order) throw notFound('Order not found.');
    if (order.status === 'CANCELLED') return order;
    if (!system && !CANCELLABLE.includes(order.status)) throw conflict('This order can no longer be cancelled.', 'NOT_CANCELLABLE');

    // Conditional on the status we just read, so a concurrent cancel or status change cannot double-restock.
    const updated = await db.orders.updateOne({ id: order.id, status: order.status, paymentStatus: order.paymentStatus }, { status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() }, { session });
    if (!updated) throw conflict('This order was changed at the same time. Please try again.', 'CONCURRENT_UPDATE');

    const items = await db.orderItems.find({ orderId: order.id }, { session });
    const payment = await db.payments.findOne({ orderId: order.id }, { session });
    const committed = order.paymentStatus === 'PAID' || payment?.provider === 'cod';
    if (committed) await restockCommitted(session, items);
    else await releaseReservation(session, items);

    if (order.couponCode) await db.coupons.update({ code: order.couponCode }, [{ $set: decrease('usedCount', 1) }], { session });
    if (order.userId && order.loyaltyPointsEarned > 0 && order.paymentStatus === 'PAID') {
      await db.users.update({ id: order.userId }, [{ $set: decrease('loyaltyPoints', order.loyaltyPointsEarned) }], { session });
      await db.loyaltyLedger.insert({ userId: order.userId, orderId: order.id, points: -order.loyaltyPointsEarned, reason: `Cancelled ${order.orderNumber}` }, { session });
    }
    await history(session, order.id, 'CANCELLED', reason ?? 'Order cancelled', actorId);
    return updated;
  });
}

/** Releases stock held by online-payment orders that were never paid. Run on a timer. */
export async function expireUnpaidOrders(log = console) {
  const cutoff = new Date(Date.now() - UNPAID_HOLD_MINUTES * 60_000);
  const stale = await db.orders.find({ status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', placedAt: { $lt: cutoff } }, { projection: { id: 1 } });
  for (const o of stale) {
    try {
      await cancelOrder(o.id, { reason: 'Payment not completed in time', system: true });
    } catch (err) {
      log.error?.({ err, orderId: o.id }, 'failed to expire order');
    }
  }
  return stale.length;
}

async function notifyOrder(order, subject, line) {
  try {
    await sendMail({ to: order.contactEmail, subject: `${subject} · ${order.orderNumber}`, text: `${line}\n\nOrder number: ${order.orderNumber}\nTotal: ₹${(order.totalMinor / 100).toLocaleString('en-IN')}\n\nYou can track your order any time with your order number and this email address.` });
    if (order.userId) await db.notifications.insert({ userId: order.userId, type: 'order', title: subject, body: `Order ${order.orderNumber}`, href: `/account/orders/${order.orderNumber}` });
  } catch {
    /* notification failure must never fail an order */
  }
}

export const STATUS_FLOW = ['PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

/** Allowed manual transitions for staff. */
export const NEXT_STATUS = {
  PENDING_PAYMENT: ['CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED', 'DELIVERED'],
  RETURNED: [],
  CANCELLED: [],
};

export async function updateOrderStatus(orderId, nextStatus, { note, actorId, shipment } = {}) {
  const order = await db.orders.findOne({ id: orderId });
  if (!order) throw notFound('Order not found.');
  if (nextStatus === 'CANCELLED') {
    if (!['PENDING_PAYMENT', 'PROCESSING', 'PACKED'].includes(order.status)) throw conflict('Only orders that have not shipped can be cancelled.', 'NOT_CANCELLABLE');
    return cancelOrder(orderId, { reason: note ?? 'Cancelled by staff', actorId, system: true });
  }
  if (!NEXT_STATUS[order.status]?.includes(nextStatus)) throw conflict(`Cannot move an order from ${order.status} to ${nextStatus}.`, 'BAD_TRANSITION');
  if (order.paymentStatus !== 'PAID' && order.status !== 'RETURN_REQUESTED') {
    const pay = await db.payments.findOne({ orderId: order.id });
    if (pay?.provider !== 'cod') throw conflict('This order has not been paid yet.', 'NOT_PAID');
  }
  const updated = await withTx(async (session) => {
    const patch = { status: nextStatus, updatedAt: new Date() };
    if (nextStatus === 'DELIVERED') {
      patch.deliveredAt = new Date();
      // Cash is collected on delivery, so a COD order only becomes "paid" (and counts as revenue) now.
      const pay = await db.payments.findOne({ orderId }, { session });
      if (pay?.provider === 'cod' && order.paymentStatus !== 'PAID') {
        patch.paymentStatus = 'PAID';
        await db.payments.update({ id: pay.id }, { status: 'PAID', updatedAt: new Date() }, { session });
      }
    }
    const row = await db.orders.updateOne({ id: orderId, status: order.status }, patch, { session });
    if (!row) throw conflict('This order was changed at the same time. Please reload and try again.', 'CONCURRENT_UPDATE');
    await history(session, orderId, nextStatus, note ?? null, actorId);
    if (shipment && (shipment.carrier || shipment.trackingNumber)) {
      const values = { carrier: shipment.carrier ?? null, trackingNumber: shipment.trackingNumber ?? null, trackingUrl: shipment.trackingUrl ?? null, estimatedDeliveryAt: shipment.estimatedDeliveryAt ? new Date(shipment.estimatedDeliveryAt) : null };
      const existing = await db.shipments.findOne({ orderId }, { session });
      if (existing) await db.shipments.update({ id: existing.id }, values, { session });
      else await db.shipments.insert({ orderId, ...values }, { session });
    }
    if (nextStatus === 'SHIPPED') await db.shipments.update({ orderId }, { shippedAt: new Date() }, { session });
    if (nextStatus === 'DELIVERED') await db.shipments.update({ orderId }, { deliveredAt: new Date() }, { session });
    return row;
  });
  await notifyOrder(updated, `Order ${nextStatus.replace(/_/g, ' ').toLowerCase()}`, `Your order status is now: ${nextStatus.replace(/_/g, ' ').toLowerCase()}.`);
  return updated;
}
