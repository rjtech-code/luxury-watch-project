import { describe, expect, it } from 'vitest';
import { couponDiscount, couponProblem, priceOrder } from '../src/lib/pricing.js';
import { inclusiveTax, percentOf } from '../src/lib/money.js';

const settings = {
  tax: { enabled: true, ratePercent: 18, inclusive: true, label: 'GST' },
  delivery: { standard: { feeMinor: 0, freeAboveMinor: 0 }, express: { feeMinor: 50000, freeAboveMinor: 1_000_000 } },
  giftWrap: { enabled: true, feeMinor: 20000 },
};
const lines = [{ unitPriceMinor: 500_000, quantity: 2 }, { unitPriceMinor: 123_456, quantity: 1 }];

describe('priceOrder', () => {
  it('sums lines in integer paise and reports GST that is already inside the total', () => {
    const t = priceOrder({ lines, settings, options: { deliveryMethod: 'standard' } });
    expect(t.subtotalMinor).toBe(1_123_456);
    expect(t.totalMinor).toBe(1_123_456);
    expect(t.taxMinor).toBe(inclusiveTax(1_123_456, 18));
    expect(Number.isInteger(t.taxMinor)).toBe(true);
  });

  it('adds tax on top when prices are tax-exclusive', () => {
    const t = priceOrder({ lines: [{ unitPriceMinor: 100_000, quantity: 1 }], settings: { ...settings, tax: { enabled: true, ratePercent: 18, inclusive: false } }, options: { deliveryMethod: 'standard' } });
    expect(t.taxMinor).toBe(18_000);
    expect(t.totalMinor).toBe(118_000);
  });

  it('applies a percentage coupon with a cap, and never discounts more than the subtotal', () => {
    const coupon = { type: 'PERCENT', value: 10, maxDiscountMinor: 50_000 };
    expect(couponDiscount(coupon, 1_000_000)).toBe(50_000);
    expect(couponDiscount({ type: 'FIXED', value: 9_999_999 }, 200_000)).toBe(200_000);
    expect(couponDiscount({ type: 'PERCENT', value: 15 }, 100_000)).toBe(15_000);
  });

  it('charges shipping unless the order reaches the free-shipping threshold', () => {
    const small = priceOrder({ lines: [{ unitPriceMinor: 500_000, quantity: 1 }], settings, options: { deliveryMethod: 'express' } });
    const big = priceOrder({ lines: [{ unitPriceMinor: 1_500_000, quantity: 1 }], settings, options: { deliveryMethod: 'express' } });
    expect(small.shippingMinor).toBe(50_000);
    expect(big.shippingMinor).toBe(0);
  });

  it('measures the free-shipping threshold after the coupon discount', () => {
    const t = priceOrder({ lines: [{ unitPriceMinor: 1_050_000, quantity: 1 }], settings, options: { deliveryMethod: 'express' }, coupon: { type: 'FIXED', value: 100_000 } });
    expect(t.discountMinor).toBe(100_000);
    expect(t.shippingMinor).toBe(50_000);
    expect(t.totalMinor).toBe(1_050_000 - 100_000 + 50_000);
  });

  it('adds gift wrap only when requested and enabled', () => {
    expect(priceOrder({ lines, settings, options: { deliveryMethod: 'standard', isGift: true } }).giftWrapMinor).toBe(20_000);
    expect(priceOrder({ lines, settings, options: { deliveryMethod: 'standard', isGift: false } }).giftWrapMinor).toBe(0);
  });

  it('rejects unknown delivery methods instead of guessing', () => {
    expect(() => priceOrder({ lines, settings, options: { deliveryMethod: 'teleport' } })).toThrow();
  });

  it('rounds percentages half-up in whole paise', () => {
    expect(percentOf(333, 10)).toBe(33);
    expect(percentOf(335, 10)).toBe(34);
  });
});

describe('couponProblem', () => {
  const base = { isActive: true, usedCount: 0, usageLimit: null, perUserLimit: null, minSubtotalMinor: 0, startsAt: null, endsAt: null };
  it('accepts a healthy coupon', () => expect(couponProblem(base, { subtotalMinor: 1000 })).toBeNull());
  it('rejects unknown, inactive, expired, not-yet-active, exhausted and under-minimum coupons', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(couponProblem(null, { subtotalMinor: 1 })).toMatch(/not valid/);
    expect(couponProblem({ ...base, isActive: false }, { subtotalMinor: 1 })).toMatch(/not valid/);
    expect(couponProblem({ ...base, endsAt: '2026-05-01T00:00:00Z' }, { subtotalMinor: 1, now })).toMatch(/expired/);
    expect(couponProblem({ ...base, startsAt: '2026-07-01T00:00:00Z' }, { subtotalMinor: 1, now })).toMatch(/not active/);
    expect(couponProblem({ ...base, usageLimit: 5, usedCount: 5 }, { subtotalMinor: 1 })).toMatch(/limit/);
    expect(couponProblem({ ...base, perUserLimit: 1 }, { subtotalMinor: 1, userUsageCount: 1 })).toMatch(/already used/);
    expect(couponProblem({ ...base, minSubtotalMinor: 5000 }, { subtotalMinor: 4999 })).toMatch(/minimum/);
  });
});
