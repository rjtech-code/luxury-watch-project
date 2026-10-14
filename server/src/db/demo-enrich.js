/**
 * DEVELOPMENT ONLY. Adds illustrative prices, stock and a few "featured" flags so the shopping flow can be
 * exercised end to end. The supplied catalogue has no prices, and real prices must come from the business.
 *
 *  - Refuses to run when NODE_ENV=production.
 *  - Never touches a product that already has a price (i.e. real data is never overwritten).
 *  - Every row it changes is flagged isDemoData = true, and the storefront shows a visible notice for them.
 *  - Prices are placeholders derived from the brand "segment" text in the JSON; they are NOT real retail prices.
 *
 * Undo with:  npm run db:demo-reset
 */
import crypto from 'node:crypto';
import { closeDb, db } from './client.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to add demo data in production.');
  process.exit(1);
}

// Most specific rule first: the first match wins.
const TIERS = [
  [/ultra luxury/i, [1_500_000, 9_000_000]],
  [/premium luxury/i, [350_000, 900_000]],
  [/luxury/i, [600_000, 1_800_000]],
  [/mid-premium/i, [60_000, 150_000]],
  [/mass to premium/i, [15_000, 120_000]],
  [/premium/i, [150_000, 450_000]],
  [/affordable/i, [25_000, 60_000]],
  [/smartwatch/i, [30_000, 95_000]],
  [/digital/i, [3_000, 25_000]],
  [/mass/i, [8_000, 60_000]],
];

const hash = (str) => crypto.createHash('sha256').update(str).digest().readUInt32BE(0);
const tierFor = (segment = '') => (TIERS.find(([re]) => re.test(segment)) ?? [null, [20_000, 150_000]])[1];
const variantIdsOf = async (productIds) => (await db.productVariants.find({ productId: { $in: productIds } }, { projection: { id: 1 } })).map((v) => v.id);

if (process.argv.includes('--reset')) {
  const demo = (await db.products.find({ isDemoData: true }, { projection: { id: 1 } })).map((p) => p.id);
  await db.products.update({ isDemoData: true }, { priceMinor: null, compareAtMinor: null, isFeatured: false, isDemoData: false });
  await db.inventory.update({ variantId: { $in: await variantIdsOf(demo) } }, { onHand: 0 });
  console.log('Demo pricing removed.');
  await closeDb();
  process.exit(0);
}

const segmentByBrand = Object.fromEntries((await db.brands.find({}, { projection: { id: 1, segment: 1 } })).map((b) => [b.id, b.segment]));
const rows = await db.products.find({ priceMinor: null, status: 'ACTIVE' }, { projection: { id: 1, slug: 1, brandId: 1 } });

let n = 0;
for (const p of rows) {
  const h = hash(p.slug);
  const [lo, hi] = tierFor(segmentByBrand[p.brandId] ?? '');
  const rupees = Math.round((lo + ((hi - lo) * (h % 1000)) / 1000) / 500) * 500;
  const price = rupees * 100;
  await db.products.update({ id: p.id }, {
    priceMinor: price,
    compareAtMinor: h % 9 === 0 ? Math.round((price * 1.12) / 100000) * 100000 || price + 100000 : null,
    isFeatured: h % 11 === 0,
    popularity: h % 40,
    isDemoData: true,
    updatedAt: new Date(),
  });
  // Stock: mostly 2-6 units, a few sold out and a few with a single unit so those states are visible.
  const stock = h % 13 === 0 ? 0 : h % 7 === 0 ? 1 : 2 + (h % 5);
  await db.inventory.update({ variantId: { $in: await variantIdsOf([p.id]) } }, { onHand: stock, updatedAt: new Date() });
  n++;
}
console.log(`Demo pricing and stock added to ${n} products (flagged isDemoData).`);
await closeDb();
