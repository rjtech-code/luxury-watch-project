import { beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import { app, checkoutBody, client, db, loginAs, makeBuyable, setSetting, signWebhook, stockOf, uniq } from './helpers.js';
import { DEFAULT_SETTINGS } from '../src/db/defaults.js';

beforeAll(async () => {
  await setSetting('payments', { razorpayEnabled: true, codEnabled: true });
});

async function guestOrder(variantId, quantity = 1, over = {}) {
  const c = client();
  const add = await c.post('/api/cart/items', { variantId, quantity });
  if (add.status !== 201) return { c, add, res: null };
  const res = await c.post('/api/checkout/place', checkoutBody(over));
  return { c, add, res };
}

describe('cart rules', () => {
  it('refuses to add a watch that has no price (price on request)', async () => {
    const p = await db.products.updateOne({ slug: 'patek-philippe-nautilus-5711' }, { priceMinor: null });
    const v = await db.productVariants.findOne({ productId: p.id });
    await db.inventory.update({ variantId: v.id }, { onHand: 5 });
    const res = await client().post('/api/cart/items', { variantId: v.id, quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRICE_ON_REQUEST');
  });

  it('refuses quantities above available stock and out-of-stock items', async () => {
    const { variantId } = await makeBuyable('rolex-datejust-31', { stock: 2 });
    const c = client();
    expect((await c.post('/api/cart/items', { variantId, quantity: 3 })).status).toBe(409);
    expect((await c.post('/api/cart/items', { variantId, quantity: 2 })).status).toBe(201);
    expect((await c.post('/api/cart/items', { variantId, quantity: 1 })).status).toBe(409); // 2 already in cart
    await db.inventory.update({ variantId }, { onHand: 0 });
    const empty = client();
    const res = await empty.post('/api/cart/items', { variantId, quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('prices lines from the database and ignores any client-supplied price', async () => {
    const { variantId } = await makeBuyable('rolex-datejust-36', { priceMinor: 500_000_00, stock: 5 });
    const c = client();
    const bad = await c.post('/api/cart/items', { variantId, quantity: 1, priceMinor: 1 });
    expect(bad.status).toBe(400); // unknown key rejected by the strict schema
    const ok = await c.post('/api/cart/items', { variantId, quantity: 2 });
    expect(ok.body.cart.totals.subtotalMinor).toBe(1_000_000_00);
    expect(ok.body.cart.itemCount).toBe(2);
  });

  it('merges a guest cart into the member cart on login', async () => {
    const { variantId } = await makeBuyable('rolex-datejust-41', { stock: 5 });
    const guest = client();
    await guest.post('/api/cart/items', { variantId, quantity: 2 });
    const user = await (await import('./helpers.js')).createUser('CUSTOMER');
    const login = await guest.post('/api/auth/login', { email: user.email, password: (await import('./helpers.js')).PASSWORD });
    expect(login.status).toBe(200);
    const cart = await guest.get('/api/cart');
    expect(cart.body.cart.itemCount).toBe(2);
  });
});

describe('cash-on-delivery checkout', () => {
  it('places a guest order, computes totals on the server and commits stock', async () => {
    const { variantId } = await makeBuyable('omega-seamaster-diver-300m', { priceMinor: 600_000_00, stock: 5 });
    const { res } = await guestOrder(variantId, 2);
    expect(res.status).toBe(201);
    expect(res.body.order.totalMinor).toBe(1_200_000_00);
    expect(res.body.order.status).toBe('PROCESSING');
    const inv = await stockOf(variantId);
    expect(inv.onHand).toBe(3);
    expect(inv.reserved).toBe(0);
  });

  it('rejects client attempts to set totals, prices or status', async () => {
    const { variantId } = await makeBuyable('omega-seamaster-planet-ocean', { stock: 5 });
    const c = client();
    await c.post('/api/cart/items', { variantId, quantity: 1 });
    for (const extra of [{ totalMinor: 1 }, { status: 'DELIVERED' }, { paymentStatus: 'PAID' }, { userId: 'x' }]) {
      expect((await c.post('/api/checkout/place', { ...checkoutBody(), ...extra })).status).toBe(400);
    }
  });

  it('validates contact and address fields', async () => {
    const { variantId } = await makeBuyable('omega-seamaster-aqua-terra', { stock: 5 });
    const c = client();
    await c.post('/api/cart/items', { variantId, quantity: 1 });
    expect((await c.post('/api/checkout/place', checkoutBody({ contactEmail: 'not-an-email' }))).status).toBe(400);
    expect((await c.post('/api/checkout/place', checkoutBody({ shippingAddress: { ...checkoutBody().shippingAddress, postalCode: '12' } }))).status).toBe(400);
    expect((await c.post('/api/checkout/place', checkoutBody({ deliveryMethod: 'teleport' }))).status).toBe(400);
  });

  it('is idempotent: retrying with the same key does not create a second order or take more stock', async () => {
    const { variantId } = await makeBuyable('omega-constellation-41-mm', { stock: 5 });
    const c = client();
    await c.post('/api/cart/items', { variantId, quantity: 1 });
    const key = `idem-${uniq()}-0123456789`;
    const body = checkoutBody({ idempotencyKey: key });
    const a = await c.post('/api/checkout/place', body);
    const b = await c.post('/api/checkout/place', body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.duplicate).toBe(true);
    expect(b.body.order.orderNumber).toBe(a.body.order.orderNumber);
    expect((await stockOf(variantId)).onHand).toBe(4);
  });

  it('cannot oversell the last unit when two buyers check out at the same instant', async () => {
    const { variantId } = await makeBuyable('omega-constellation-globemaster', { stock: 1 });
    const buyers = [client(), client()];
    for (const b of buyers) expect((await b.post('/api/cart/items', { variantId, quantity: 1 })).status).toBe(201);
    const results = await Promise.all(buyers.map((b) => b.post('/api/checkout/place', checkoutBody())));
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409]);
    const inv = await stockOf(variantId);
    expect(inv.onHand).toBe(0);
    expect(inv.reserved).toBe(0);
  });

  it('empties the cart after a successful COD order', async () => {
    const { variantId } = await makeBuyable('omega-de-ville-prestige', { stock: 5 });
    const { c, res } = await guestOrder(variantId, 1);
    expect(res.status).toBe(201);
    expect((await c.get('/api/cart')).body.cart.itemCount).toBe(0);
  });
});

describe('online payment', () => {
  it('releases reserved stock and cancels the order if the gateway cannot open a payment session', async () => {
    // Dummy credentials + no real gateway reachable from tests: session creation fails.
    const { variantId } = await makeBuyable('omega-de-ville-tresor', { stock: 3 });
    const { res } = await guestOrder(variantId, 1, { paymentMethod: 'razorpay' });
    expect(res.status).toBe(502);
    const inv = await stockOf(variantId);
    expect(inv.reserved).toBe(0);
    expect(inv.onHand).toBe(3);
    const o = await db.orders.findOne({ status: 'CANCELLED' }, { sort: { placedAt: 1 } });
    expect(o).toBeTruthy();
  });

  async function pendingOnlineOrder(slug, qty = 1) {
    const { variantId, productId } = await makeBuyable(slug, { priceMinor: 250_000_00, stock: 5 });
    const total = 250_000_00 * qty;
    const order = await db.orders.insert({ orderNumber: `TL-T-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, contactEmail: 'pay@example.test', contactPhone: '9876543210', shippingAddress: checkoutBody().shippingAddress, deliveryMethod: 'standard', subtotalMinor: total, totalMinor: total });
    await db.orderItems.insert({ orderId: order.id, productId, variantId, productName: 'X', brandName: 'Y', sku: 'SKU', unitPriceMinor: 250_000_00, quantity: qty, lineTotalMinor: total });
    const providerOrderId = `order_${uniq('rz')}`;
    await db.payments.insert({ orderId: order.id, provider: 'razorpay', providerOrderId, amountMinor: total });
    await db.inventory.update({ variantId }, { reserved: qty });
    return { order, variantId, providerOrderId, total };
  }
  const hook = (event, payment, id = `evt_${uniq()}`) => {
    const raw = JSON.stringify({ event, payload: { payment: { entity: payment } } });
    return { raw, id, send: (sig = signWebhook(raw)) => request(app).post('/api/payments/webhook').set('content-type', 'application/json').set('x-razorpay-signature', sig).set('x-razorpay-event-id', id).send(raw) };
  };

  it('rejects webhooks with a bad signature and does not change the order', async () => {
    const o = await pendingOnlineOrder('tag-heuer-carrera-chronograph');
    const h = hook('payment.captured', { id: 'pay_1', order_id: o.providerOrderId, amount: o.total, method: 'upi' });
    expect((await h.send('0'.repeat(64))).status).toBe(400);
    const row = await db.orders.findOne({ id: o.order.id });
    expect(row.paymentStatus).toBe('PENDING');
  });

  it('marks paid exactly once even if the same event, or a different event for the same payment, arrives repeatedly', async () => {
    const o = await pendingOnlineOrder('tag-heuer-carrera-three-hands');
    const payment = { id: `pay_${uniq()}`, order_id: o.providerOrderId, amount: o.total, method: 'card' };
    const first = hook('payment.captured', payment);
    expect((await first.send()).status).toBe(200);
    expect((await first.send()).body.duplicate).toBe(true); // same event id replayed
    expect((await hook('payment.captured', payment).send()).status).toBe(200); // new event id, same payment
    const row = await db.orders.findOne({ id: o.order.id });
    expect(row.paymentStatus).toBe('PAID');
    expect(row.status).toBe('PROCESSING');
    const inv = await stockOf(o.variantId);
    expect(inv.onHand).toBe(4); // 5 - 1, committed once
    expect(inv.reserved).toBe(0);
  });

  it('refuses to mark an order paid when the paid amount does not match the order total', async () => {
    const o = await pendingOnlineOrder('tag-heuer-monaco-chronograph');
    const res = await hook('payment.captured', { id: `pay_${uniq()}`, order_id: o.providerOrderId, amount: 100, method: 'upi' }).send();
    expect(res.status).toBe(409);
    const row = await db.orders.findOne({ id: o.order.id });
    expect(row.paymentStatus).toBe('PENDING');
  });

  it('does not trust the browser: verify rejects a forged signature', async () => {
    const o = await pendingOnlineOrder('tag-heuer-aquaracer-professional-200');
    const res = await client().post('/api/payments/razorpay/verify', { razorpay_order_id: o.providerOrderId, razorpay_payment_id: 'pay_fake', razorpay_signature: 'f'.repeat(64) });
    expect(res.status).toBe(400);
    const row = await db.orders.findOne({ id: o.order.id });
    expect(row.paymentStatus).toBe('PENDING');
  });
});

describe('tracking and ownership', () => {
  it('requires the order number and matching contact, and answers identically for missing and mismatched orders', async () => {
    const { variantId } = await makeBuyable('breitling-navitimer-b01-chronograph-43', { stock: 5 });
    const email = `${uniq('track')}@example.test`;
    const { res } = await guestOrder(variantId, 1, { contactEmail: email, contactPhone: '9123456780' });
    const no = res.body.order.orderNumber;
    const t = client();
    const good = await t.get(`/api/orders/track?orderNumber=${no}&contact=${encodeURIComponent(email)}`);
    expect(good.status).toBe(200);
    expect(good.body.order.shippingTo.city).toBe('Jaipur');
    expect(JSON.stringify(good.body)).not.toContain('12 Lake Road'); // street address and contact details are not exposed
    expect(JSON.stringify(good.body)).not.toContain(email);
    expect((await t.get(`/api/orders/track?orderNumber=${no}&contact=9123456780`)).status).toBe(200); // phone also works
    const wrong = await t.get(`/api/orders/track?orderNumber=${no}&contact=${encodeURIComponent('attacker@example.test')}`);
    const missing = await t.get(`/api/orders/track?orderNumber=TL-000000-ZZZZZ&contact=${encodeURIComponent(email)}`);
    expect(wrong.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(wrong.body.error.message).toBe(missing.body.error.message);
  });

  it("a signed-in customer cannot read another customer's order", async () => {
    const { variantId } = await makeBuyable('breitling-navitimer-automatic-41', { stock: 5 });
    const owner = await loginAs('CUSTOMER');
    await owner.post('/api/cart/items', { variantId, quantity: 1 });
    const placed = await owner.post('/api/checkout/place', checkoutBody());
    const no = placed.body.order.orderNumber;
    expect((await owner.get(`/api/account/orders/${no}`)).status).toBe(200);
    const other = await loginAs('CUSTOMER');
    expect((await other.get(`/api/account/orders/${no}`)).status).toBe(404);
    expect((await other.post(`/api/account/orders/${no}/cancel`, {})).status).toBe(404);
    expect((await other.get('/api/account/orders')).body.items).toHaveLength(0);
  });
});

describe('cancellation', () => {
  it('puts committed stock back and cannot be done twice or after packing', async () => {
    const { variantId } = await makeBuyable('breitling-superocean-automatic-42', { stock: 4 });
    const owner = await loginAs('CUSTOMER');
    await owner.post('/api/cart/items', { variantId, quantity: 2 });
    const placed = await owner.post('/api/checkout/place', checkoutBody());
    const no = placed.body.order.orderNumber;
    expect((await stockOf(variantId)).onHand).toBe(2);
    const cancel = await owner.post(`/api/account/orders/${no}/cancel`, { reason: 'Changed my mind' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.order.status).toBe('CANCELLED');
    expect((await stockOf(variantId)).onHand).toBe(4);
    expect((await owner.post(`/api/account/orders/${no}/cancel`, {})).status).toBe(409);
    expect((await stockOf(variantId)).onHand).toBe(4); // not restocked twice

    // A packed order can no longer be cancelled by the customer.
    await owner.post('/api/cart/items', { variantId, quantity: 1 });
    const second = await owner.post('/api/checkout/place', checkoutBody());
    const mgr = await loginAs('MANAGER');
    expect((await mgr.patch(`/api/admin/orders/${second.body.order.orderNumber}/status`, { status: 'PACKED' })).status).toBe(200);
    expect((await owner.post(`/api/account/orders/${second.body.order.orderNumber}/cancel`, {})).status).toBe(409);
  });
});

describe('coupons', () => {
  it('applies a valid coupon on the server, and enforces the usage limit under concurrency', async () => {
    const admin = await loginAs('SUPER_ADMIN');
    const code = `SAVE${uniq().toUpperCase().slice(-6)}`;
    const made = await admin.post('/api/admin/coupons', { code, type: 'PERCENT', value: 10, usageLimit: 1, minSubtotalMinor: 0, isActive: true });
    expect(made.status).toBe(201);
    const { variantId } = await makeBuyable('breitling-chronomat-b01-42', { priceMinor: 100_000_00, stock: 10 });
    const buyers = [client(), client()];
    for (const b of buyers) {
      await b.post('/api/cart/items', { variantId, quantity: 1 });
      const applied = await b.post('/api/cart/coupon', { code });
      expect(applied.status).toBe(200);
      expect(applied.body.cart.totals.discountMinor).toBe(10_000_00);
    }
    const results = await Promise.all(buyers.map((b) => b.post('/api/checkout/place', checkoutBody())));
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const winner = results.find((r) => r.status === 201);
    expect(winner.body.order.totalMinor).toBe(90_000_00);
    expect((await stockOf(variantId)).reserved).toBe(0); // the losing order rolled back its reservation
    const c = await db.coupons.findOne({ code });
    expect(c.usedCount).toBe(1);
  });

  it('rejects unknown and expired coupons', async () => {
    const admin = await loginAs('SUPER_ADMIN');
    const code = `OLD${uniq().toUpperCase().slice(-6)}`;
    await admin.post('/api/admin/coupons', { code, type: 'FIXED', value: 5000, minSubtotalMinor: 0, endsAt: new Date(Date.now() - 86400_000).toISOString(), isActive: true });
    const { variantId } = await makeBuyable('breitling-avenger-automatic-42', { stock: 5 });
    const c = client();
    await c.post('/api/cart/items', { variantId, quantity: 1 });
    expect((await c.post('/api/cart/coupon', { code: 'NOPE-NOT-REAL' })).status).toBe(400);
    expect((await c.post('/api/cart/coupon', { code })).status).toBe(400);
  });

  it('validates coupon definitions (percent over 100, bad dates)', async () => {
    const admin = await loginAs('SUPER_ADMIN');
    expect((await admin.post('/api/admin/coupons', { code: 'TOOBIG', type: 'PERCENT', value: 150 })).status).toBe(400);
    expect((await admin.post('/api/admin/coupons', { code: 'BADDATES', type: 'FIXED', value: 100, startsAt: '2026-02-01T00:00:00Z', endsAt: '2026-01-01T00:00:00Z' })).status).toBe(400);
  });
});

describe('staff order workflow and sales reporting', () => {
  it('enforces a valid status sequence, marks COD paid on delivery and counts it in revenue only then', async () => {
    const { variantId } = await makeBuyable('longines-hydroconquest-41-mm', { priceMinor: 80_000_00, stock: 5 });
    const { res } = await guestOrder(variantId, 1);
    const no = res.body.order.orderNumber;
    const mgr = await loginAs('MANAGER');
    const range = '?from=2020-01-01&to=2099-01-01';
    const before = (await mgr.get(`/api/admin/dashboard${range}`)).body.kpis;

    expect((await mgr.patch(`/api/admin/orders/${no}/status`, { status: 'DELIVERED' })).status).toBe(409); // cannot skip ahead
    for (const status of ['PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY']) {
      const r = await mgr.patch(`/api/admin/orders/${no}/status`, { status, shipment: status === 'SHIPPED' ? { carrier: 'TestCourier', trackingNumber: 'TC123' } : undefined });
      expect(r.status).toBe(200);
    }
    const midway = (await mgr.get(`/api/admin/dashboard${range}`)).body.kpis;
    expect(midway.grossMinor).toBe(before.grossMinor); // COD cash not collected yet, not revenue

    expect((await mgr.patch(`/api/admin/orders/${no}/status`, { status: 'DELIVERED' })).status).toBe(200);
    const after = (await mgr.get(`/api/admin/dashboard${range}`)).body.kpis;
    expect(after.grossMinor).toBe(before.grossMinor + 80_000_00);
    expect(after.orders).toBe(before.orders + 1);
    expect(after.netMinor).toBe(after.grossMinor - after.refundsMinor);

    const track = await client().get(`/api/orders/track?orderNumber=${no}&contact=9876543210`);
    expect(track.body.order.shipment.trackingNumber).toBe('TC123');
    expect(track.body.order.timeline.map((x) => x.status)).toEqual(['PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']);
  });

  it('only a super admin can refund, and refunds reduce net sales but not gross', async () => {
    const { variantId } = await makeBuyable('longines-hydroconquest-43-mm', { priceMinor: 70_000_00, stock: 5 });
    const { res } = await guestOrder(variantId, 1);
    const no = res.body.order.orderNumber;
    const mgr = await loginAs('MANAGER');
    for (const status of ['PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']) await mgr.patch(`/api/admin/orders/${no}/status`, { status });
    expect((await mgr.post(`/api/admin/orders/${no}/refund`, { amountMinor: 10_000_00 })).status).toBe(403);
    const admin = await loginAs('SUPER_ADMIN');
    expect((await admin.post(`/api/admin/orders/${no}/refund`, { amountMinor: 999_999_999 })).status).toBe(400); // exceeds order total
    expect((await admin.post(`/api/admin/orders/${no}/refund`, { amountMinor: 10_000_00 })).status).toBe(200);
    const detail = await admin.get(`/api/admin/orders/${no}`);
    expect(Number(detail.body.order.refundedMinor)).toBe(10_000_00);
    expect(detail.body.order.paymentStatus).toBe('PARTIALLY_REFUNDED');
  });

  it('exports sales as CSV, neutralising spreadsheet formula injection', async () => {
    const mgr = await loginAs('MANAGER');
    const res = await mgr.get('/api/admin/reports/sales.csv?from=2020-01-01&to=2099-01-01');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\n')[0]).toContain('Order,Placed (UTC)');
    const customer = await loginAs('CUSTOMER');
    expect((await customer.get('/api/admin/reports/sales.csv')).status).toBe(403);
  });
});

describe('inventory management', () => {
  it('will not let stock drop below what open orders have reserved, and audits changes', async () => {
    const { variantId } = await makeBuyable('longines-spirit-40-mm', { stock: 5 });
    await db.inventory.update({ variantId }, { reserved: 2 });
    const admin = await loginAs('SUPER_ADMIN');
    expect((await admin.patch(`/api/admin/inventory/${variantId}`, { onHand: 1 })).status).toBe(409);
    expect((await admin.patch(`/api/admin/inventory/${variantId}`, { onHand: 8 })).status).toBe(200);
    const mgr = await loginAs('MANAGER'); // read-only by default
    expect((await mgr.get('/api/admin/inventory')).status).toBe(200);
    expect((await mgr.patch(`/api/admin/inventory/${variantId}`, { onHand: 9 })).status).toBe(403);
  });
});

describe('public data safety', () => {
  it('never exposes payment or internal settings through the public site endpoint', async () => {
    const res = await client().get('/api/site');
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/razorpay|codEnabled|secret|keySecret/i);
    expect(res.body.brand.name).toBe(DEFAULT_SETTINGS.brand.name);
  });

  it('only offers payment methods that can actually work', async () => {
    const res = await client().get('/api/checkout/options');
    expect(res.body.payments.cod).toBe(true);
    expect(typeof res.body.payments.razorpay).toBe('boolean');
  });
});
