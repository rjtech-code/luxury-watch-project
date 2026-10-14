import { describe, expect, it } from 'vitest';
import { cx, money, moneyCompact, plural } from '../src/lib/format.js';
import { NAV, OCCASIONS } from '../src/lib/nav.js';

describe('format helpers', () => {
  it('formats paise as rupees', () => {
    expect(money(163900000)).toBe('₹16,39,000');
    expect(money(null)).toBe('');
  });
  it('compacts large amounts', () => {
    expect(moneyCompact(10000000)).toBe('₹1 L');
    expect(moneyCompact(1000000000)).toBe('₹1 Cr');
  });
  it('pluralises and joins classes', () => {
    expect(plural(1, 'watch', 'watches')).toBe('1 watch');
    expect(plural(3, 'watch', 'watches')).toBe('3 watches');
    expect(cx('a', false, 'b')).toBe('a b');
  });
});

describe('navigation config', () => {
  it('has unique routes and a path for every occasion', () => {
    const tos = NAV.map((n) => n.to);
    expect(new Set(tos).size).toBe(tos.length);
    expect(OCCASIONS.every((o) => o.key && o.categories.length)).toBe(true);
  });
});
