import { db } from '../db/client.js';
import { priceOrder, couponProblem } from '../lib/pricing.js';
import { getSettings } from './settings.js';

const byKey = (rows, key = 'id') => new Map(rows.map((r) => [r[key], r]));

/** First image URL per product id, in sort order. */
export async function firstImages(productIds, session) {
  if (!productIds.length) return new Map();
  const rows = await db.productImages.aggregate([
    { $match: { productId: { $in: productIds } } },
    { $sort: { sortOrder: 1 } },
    { $group: { _id: '$productId', url: { $first: '$url' } } },
  ], { session });
  return new Map(rows.map((r) => [r._id, r.url]));
}

/** Cart lines with live DB prices and stock. This is the single source of truth for what a line costs. */
export async function loadLines(cartId, session) {
  const items = await db.cartItems.find({ cartId }, { sort: { addedAt: 1 }, session });
  if (!items.length) return [];
  const variants = byKey(await db.productVariants.find({ id: { $in: items.map((i) => i.variantId) } }, { session }));
  const productIds = [...new Set([...variants.values()].map((v) => v.productId))];
  const products = byKey(await db.products.find({ id: { $in: productIds } }, { session }));
  const brands = byKey(await db.brands.find({ id: { $in: [...new Set([...products.values()].map((p) => p.brandId))] } }, { session }));
  const stock = byKey(await db.inventory.find({ variantId: { $in: [...variants.keys()] } }, { session }), 'variantId');
  const images = await firstImages(productIds, session);

  return items.flatMap((it) => {
    const v = variants.get(it.variantId);
    const p = v && products.get(v.productId);
    const b = p && brands.get(p.brandId);
    if (!b) return []; // the variant or its product no longer exists
    const inv = stock.get(v.id);
    const unitPriceMinor = Number(v.priceMinor ?? p.priceMinor ?? NaN);
    const available = Math.max(0, (inv?.onHand ?? 0) - (inv?.reserved ?? 0));
    const purchasable = p.status === 'ACTIVE' && v.isActive && Number.isFinite(unitPriceMinor) && unitPriceMinor > 0;
    return [{
      variantId: v.id,
      productId: p.id,
      name: p.name,
      slug: p.slug,
      brandName: b.name,
      sku: v.sku,
      status: p.status,
      isActiveVariant: v.isActive,
      unitPriceMinor,
      quantity: it.quantity,
      onHand: inv?.onHand ?? null,
      reserved: inv?.reserved ?? null,
      image: images.get(p.id) ?? null,
      available,
      purchasable,
      issue: !purchasable ? 'unavailable' : it.quantity > available ? (available === 0 ? 'out_of_stock' : 'low_stock') : null,
    }];
  });
}

export async function findCoupon(code, session) {
  if (!code) return null;
  return db.coupons.findOne({ code: String(code).trim().toUpperCase() }, { session });
}

export async function userCouponUsage(userId, code, session) {
  if (!userId || !code) return 0;
  return db.orders.count({ userId, couponCode: code, status: { $ne: 'CANCELLED' } }, { session });
}

/** Full cart view: lines, validated coupon, and totals computed by the same pricing function used at checkout. */
export async function cartView(cart, userId = null, deliveryMethod = 'standard') {
  const lines = await loadLines(cart.id);
  const settings = await getSettings();
  const buyable = lines.filter((l) => l.purchasable);
  const subtotalMinor = buyable.reduce((a, l) => a + l.unitPriceMinor * l.quantity, 0);

  let coupon = null;
  let couponError = null;
  if (cart.couponCode) {
    const row = await findCoupon(cart.couponCode);
    couponError = couponProblem(row, { subtotalMinor, userUsageCount: await userCouponUsage(userId, row?.code) });
    coupon = couponError ? null : row;
  }

  const totals = priceOrder({
    lines: buyable.map((l) => ({ unitPriceMinor: l.unitPriceMinor, quantity: l.quantity })),
    settings,
    options: { deliveryMethod: settings.delivery[deliveryMethod] ? deliveryMethod : 'standard', isGift: false },
    coupon,
  });

  return {
    id: cart.id,
    lines: lines.map((l) => ({
      variantId: l.variantId,
      productId: l.productId,
      name: l.name,
      slug: l.slug,
      brandName: l.brandName,
      image: l.image,
      unitPriceMinor: Number.isFinite(l.unitPriceMinor) ? l.unitPriceMinor : null,
      quantity: l.quantity,
      available: l.available,
      issue: l.issue,
      lineTotalMinor: l.purchasable ? l.unitPriceMinor * l.quantity : 0,
    })),
    itemCount: lines.reduce((a, l) => a + l.quantity, 0),
    coupon: coupon ? { code: coupon.code, description: coupon.description } : null,
    couponError: cart.couponCode ? couponError : null,
    totals,
    hasIssues: lines.some((l) => l.issue),
    currency: 'INR',
    taxLabel: settings.tax?.enabled ? `${settings.tax.label} ${settings.tax.ratePercent}%${settings.tax.inclusive ? ' (included)' : ''}` : null,
  };
}
