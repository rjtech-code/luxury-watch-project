const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Amounts arrive from the API as integer paise. */
export const money = (minor) => (minor == null ? '' : inr.format(minor / 100));
export const moneyExact = (minor) => (minor == null ? '' : inrExact.format(minor / 100));
export const moneyCompact = (minor) => {
  const r = minor / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`;
  return inr.format(r);
};

const dtf = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dtfTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const dateFmt = (d) => (d ? dtf.format(new Date(d)) : '');
export const dateTimeFmt = (d) => (d ? dtfTime.format(new Date(d)) : '');

export const STATUS_LABEL = {
  PENDING_PAYMENT: 'Awaiting payment', PROCESSING: 'Processing', PACKED: 'Packed', SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
  RETURN_REQUESTED: 'Return requested', RETURNED: 'Returned',
};
export const PAYMENT_LABEL = { PENDING: 'Pending', PAID: 'Paid', FAILED: 'Failed', REFUNDED: 'Refunded', PARTIALLY_REFUNDED: 'Partly refunded' };
export const MOVEMENT_LABEL = { AUTOMATIC: 'Automatic', MECHANICAL: 'Mechanical', QUARTZ: 'Quartz', SOLAR: 'Solar / light-powered', SMART: 'Smartwatch' };
export const GENDER_LABEL = { MEN: "Men's", WOMEN: "Women's", UNISEX: 'Unisex' };

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const cx = (...a) => a.filter(Boolean).join(' ');
