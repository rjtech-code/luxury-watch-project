import { inclusiveTax, percentOf } from './money.js';

/**
 * Pure order-pricing function. Takes already-loaded, trusted data (DB prices, settings, coupon row)
 * and returns every figure that ends up on the order. Never accepts client-supplied prices.
 *
 * lines:    [{ unitPriceMinor, quantity }]
 * settings: { tax, delivery, giftWrap }
 * options:  { deliveryMethod, isGift }
 * coupon:   a coupons row that has ALREADY passed validateCoupon(), or null
 */
export function priceOrder({ lines, settings, options = {}, coupon = null }) {
  const subtotalMinor = lines.reduce((sum, l) => sum + l.unitPriceMinor * l.quantity, 0);

  const discountMinor = coupon ? couponDiscount(coupon, subtotalMinor) : 0;
  const afterDiscount = subtotalMinor - discountMinor;

  const method = settings.delivery?.[options.deliveryMethod];
  if (!method) throw new Error(`Unknown delivery method "${options.deliveryMethod}"`);
  const free = method.freeAboveMinor != null && method.freeAboveMinor > 0 && afterDiscount >= method.freeAboveMinor;
  const shippingMinor = free ? 0 : method.feeMinor;

  const giftWrapMinor = options.isGift && settings.giftWrap?.enabled ? settings.giftWrap.feeMinor : 0;

  const totalMinor = afterDiscount + shippingMinor + giftWrapMinor;

  // Prices are GST-inclusive in India: tax is reported, not added on top.
  const taxMinor = settings.tax?.enabled && settings.tax.inclusive ? inclusiveTax(totalMinor, settings.tax.ratePercent) : 0;
  const taxAddedMinor = settings.tax?.enabled && !settings.tax.inclusive ? percentOf(totalMinor, settings.tax.ratePercent) : 0;

  return {
    subtotalMinor,
    discountMinor,
    shippingMinor,
    giftWrapMinor,
    taxMinor: taxMinor || taxAddedMinor,
    totalMinor: totalMinor + taxAddedMinor,
  };
}

export function couponDiscount(coupon, subtotalMinor) {
  let d = coupon.type === 'PERCENT' ? percentOf(subtotalMinor, Number(coupon.value)) : Number(coupon.value);
  if (coupon.maxDiscountMinor != null) d = Math.min(d, Number(coupon.maxDiscountMinor));
  return Math.max(0, Math.min(d, subtotalMinor)); // can never exceed the subtotal
}

/** Returns an error message string, or null if the coupon is usable right now. */
export function couponProblem(coupon, { subtotalMinor, now = new Date(), userUsageCount = 0 }) {
  if (!coupon || !coupon.isActive) return 'This coupon code is not valid.';
  if (coupon.startsAt && now < new Date(coupon.startsAt)) return 'This coupon is not active yet.';
  if (coupon.endsAt && now > new Date(coupon.endsAt)) return 'This coupon has expired.';
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return 'This coupon has reached its usage limit.';
  if (coupon.perUserLimit != null && userUsageCount >= coupon.perUserLimit) return 'You have already used this coupon.';
  if (subtotalMinor < Number(coupon.minSubtotalMinor)) return 'Your cart is below the minimum amount for this coupon.';
  return null;
}
