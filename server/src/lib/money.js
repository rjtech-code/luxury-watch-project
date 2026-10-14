/** All amounts are integer paise. These helpers are the only place rupee formatting lives. */

export const toRupees = (minor) => minor / 100;

export function formatInr(minor) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    minor / 100,
  );
}

/** Integer percentage of an integer amount, rounded half-up. */
export const percentOf = (amountMinor, percent) => Math.round((amountMinor * percent) / 100);

/** Tax contained in a tax-inclusive amount: amount - amount / (1 + rate). */
export const inclusiveTax = (amountMinor, ratePercent) =>
  Math.round(amountMinor - (amountMinor * 100) / (100 + ratePercent));
