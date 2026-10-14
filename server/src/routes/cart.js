import { Router } from 'express';
import { z } from 'zod';
import { db, withTx } from '../db/client.js';
import { config } from '../config.js';
import { badRequest, conflict, notFound, wrap } from '../lib/errors.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { validate } from '../middleware/validate.js';
import { cartView, findCoupon, loadLines } from '../services/cart.js';

export const cartRouter = Router();
const GUEST_COOKIE = 'lw_cart';
const MAX_QTY = 10;

async function findCart(req) {
  if (req.user) {
    return db.carts.findOne({ userId: req.user.id });
  }
  const raw = req.cookies?.[GUEST_COOKIE];
  if (!raw) return null;
  return db.carts.findOne({ guestTokenHash: sha256(raw) });
}

async function getOrCreateCart(req, res) {
  const existing = await findCart(req);
  if (existing) return existing;
  if (req.user) {
    await db.carts.insertIfAbsent({ userId: req.user.id }, {});
    return findCart(req);
  }
  const raw = randomToken(32);
  const c = await db.carts.insert({ guestTokenHash: sha256(raw) });
  res.cookie(GUEST_COOKIE, raw, { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/', maxAge: 60 * 86400_000 });
  return c;
}

/** On login/sign-up, fold the guest cart into the user's cart (quantities add, capped by stock at checkout). */
export async function mergeGuestCart(req, res, user) {
  const raw = req.cookies?.[GUEST_COOKIE];
  if (!raw) return;
  const guest = await db.carts.findOne({ guestTokenHash: sha256(raw) });
  res.clearCookie(GUEST_COOKIE, { path: '/' });
  if (!guest) return;
  await withTx(async (session) => {
    await db.carts.insertIfAbsent({ userId: user.id }, {}, { session });
    const mine = await db.carts.findOne({ userId: user.id }, { session });
    const items = await db.cartItems.find({ cartId: guest.id }, { session });
    for (const it of items) {
      await db.cartItems.updateOne(
        { cartId: mine.id, variantId: it.variantId },
        [{ $set: { quantity: { $min: [{ $add: [{ $ifNull: ['$quantity', 0] }, it.quantity] }, MAX_QTY] }, addedAt: { $ifNull: ['$addedAt', new Date()] } } }],
        { session, upsert: true },
      );
    }
    if (guest.couponCode && !mine.couponCode) await db.carts.update({ id: mine.id }, { couponCode: guest.couponCode }, { session });
    await db.cartItems.delete({ cartId: guest.id }, { session });
    await db.carts.delete({ id: guest.id }, { session });
  });
}


cartRouter.get(
  '/',
  wrap(async (req, res) => {
    const cart = await findCart(req);
    if (!cart) {
      return res.json({ cart: await cartView({ id: '00000000-0000-0000-0000-000000000000', couponCode: null }) });
    }
    res.json({ cart: await cartView(cart, req.user?.id) });
  }),
);

cartRouter.post(
  '/items',
  validate({ body: z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(MAX_QTY).default(1) }).strict() }),
  wrap(async (req, res) => {
    const variant = await db.productVariants.findOne({ id: req.body.variantId });
    const product = variant && (await db.products.findOne({ id: variant.productId }));
    if (!product || product.status !== 'ACTIVE' || !variant.isActive) throw notFound('This watch is no longer available.');
    const price = Number(variant.priceMinor ?? product.priceMinor ?? NaN);
    const line = (await db.inventory.findOne({ variantId: variant.id })) ?? {};
    if (!Number.isFinite(price) || price <= 0) throw conflict('This watch is available on request only and cannot be added to the cart.', 'PRICE_ON_REQUEST');

    const cart = await getOrCreateCart(req, res);
    const available = Math.max(0, (line.onHand ?? 0) - (line.reserved ?? 0));
    const current = await db.cartItems.findOne({ cartId: cart.id, variantId: req.body.variantId });
    const wanted = Math.min(MAX_QTY, (current?.quantity ?? 0) + req.body.quantity);
    if (available === 0) throw conflict('This watch is currently out of stock.', 'OUT_OF_STOCK');
    if (wanted > available) throw conflict(`Only ${available} available.`, 'INSUFFICIENT_STOCK');

    await db.cartItems.updateOne({ cartId: cart.id, variantId: req.body.variantId }, { $set: { quantity: wanted }, $setOnInsert: { addedAt: new Date() } }, { upsert: true });
    await db.carts.update({ id: cart.id }, { updatedAt: new Date() });
    res.status(201).json({ cart: await cartView(cart, req.user?.id) });
  }),
);

cartRouter.patch(
  '/items/:variantId',
  validate({ params: z.object({ variantId: z.string().uuid() }), body: z.object({ quantity: z.number().int().min(0).max(MAX_QTY) }).strict() }),
  wrap(async (req, res) => {
    const cart = await findCart(req);
    if (!cart) throw notFound('Your cart is empty.');
    const { variantId } = req.params;
    if (req.body.quantity === 0) {
      await db.cartItems.delete({ cartId: cart.id, variantId });
    } else {
      const inv = await db.inventory.findOne({ variantId });
      const available = Math.max(0, (inv?.onHand ?? 0) - (inv?.reserved ?? 0));
      if (req.body.quantity > available) throw conflict(available ? `Only ${available} available.` : 'This watch is currently out of stock.', 'INSUFFICIENT_STOCK');
      const updated = await db.cartItems.update({ cartId: cart.id, variantId }, { quantity: req.body.quantity });
      if (!updated) throw notFound('That item is not in your cart.');
    }
    res.json({ cart: await cartView(cart, req.user?.id) });
  }),
);

cartRouter.delete(
  '/items/:variantId',
  validate({ params: z.object({ variantId: z.string().uuid() }) }),
  wrap(async (req, res) => {
    const cart = await findCart(req);
    if (!cart) return res.json({ cart: await cartView({ id: '00000000-0000-0000-0000-000000000000', couponCode: null }) });
    await db.cartItems.delete({ cartId: cart.id, variantId: req.params.variantId });
    res.json({ cart: await cartView(cart, req.user?.id) });
  }),
);

cartRouter.post(
  '/coupon',
  validate({ body: z.object({ code: z.string().trim().min(2).max(40) }).strict() }),
  wrap(async (req, res) => {
    const cart = await getOrCreateCart(req, res);
    const code = req.body.code.toUpperCase();
    const coupon = await findCoupon(code);
    if (!coupon) throw badRequest('This coupon code is not valid.');
    await db.carts.update({ id: cart.id }, { couponCode: coupon.code });
    const view = await cartView({ ...cart, couponCode: coupon.code }, req.user?.id);
    if (view.couponError) {
      await db.carts.update({ id: cart.id }, { couponCode: null });
      throw badRequest(view.couponError);
    }
    res.json({ cart: view });
  }),
);

cartRouter.delete(
  '/coupon',
  wrap(async (req, res) => {
    const cart = await findCart(req);
    if (!cart) return res.json({ ok: true });
    await db.carts.update({ id: cart.id }, { couponCode: null });
    res.json({ cart: await cartView({ ...cart, couponCode: null }, req.user?.id) });
  }),
);

export { findCart };
