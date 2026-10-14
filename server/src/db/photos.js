/**
 * Attaches the freely licensed product photos in data/photos (listed with their credits in
 * data/photos.json, sourced from Wikimedia Commons) to the matching watches.
 *
 *   npm run db:photos
 *
 * Safe to re-run. A watch that already has photos uploaded by an admin is never touched; photos this
 * script added before are replaced. Each image keeps its author and licence in `credit`, which the
 * product page shows, as CC BY and CC BY-SA require.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, db } from './client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../../data');
const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'));
const targetDir = path.join(uploadDir, 'catalog');
const SOURCE = 'wikimedia-commons';

const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'photos.json'), 'utf8'));
fs.mkdirSync(targetDir, { recursive: true });

const byProduct = new Map();
for (const e of manifest) byProduct.set(e.product, [...(byProduct.get(e.product) ?? []), e]);

let added = 0;
let skipped = 0;
for (const [slug, photos] of byProduct) {
  const product = await db.products.findOne({ slug }, { projection: { id: 1, name: 1, brandId: 1 } });
  if (!product) continue;
  const existing = await db.productImages.find({ productId: product.id });
  if (existing.some((im) => im.source !== SOURCE)) {
    skipped++;
    continue;
  }
  const brand = await db.brands.findOne({ id: product.brandId }, { projection: { name: 1 } });
  await db.productImages.delete({ productId: product.id, source: SOURCE });
  await db.productImages.insertMany(photos.map((ph, i) => {
    fs.copyFileSync(path.join(dataDir, 'photos', ph.file), path.join(targetDir, ph.file));
    return {
      productId: product.id,
      url: `/uploads/catalog/${ph.file}`,
      alt: `${brand?.name ?? ''} ${product.name}`.trim(),
      sortOrder: i,
      source: SOURCE,
      credit: { title: ph.title.replace(/^File:/, ''), author: ph.author, license: ph.license, licenseUrl: ph.licenseUrl, sourceUrl: ph.sourceUrl },
    };
  }));
  added += photos.length;
}
console.log(`Attached ${added} photos to ${byProduct.size - skipped} watches${skipped ? ` (${skipped} skipped: they already have admin-uploaded photos)` : ''}.`);
await closeDb();
