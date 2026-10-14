import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { closeDb, db } from './client.js';
import { migrate } from './migrate.js';
import { buildCatalogue, loadCatalogueFile, validateCatalogue } from '../lib/catalogue.js';
import { DEFAULT_SETTINGS, MANAGER_DEFAULTS, PERMISSIONS, STARTER_ARTICLES } from './defaults.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.CATALOGUE_FILE ?? path.resolve(here, '../../data/watches.json');

const json = loadCatalogueFile(file);
const problems = validateCatalogue(json);
if (problems.length) {
  console.error('Catalogue is invalid:\n - ' + problems.join('\n - '));
  process.exit(1);
}
const cat = buildCatalogue(json);
const keep = { ignoreDuplicates: true }; // existing rows are kept as-is so admin edits survive a re-import

await migrate();

// Permissions
await db.permissions.insertMany(PERMISSIONS.map(([key, description]) => ({ key, description })), keep);
await db.rolePermissions.insertMany(MANAGER_DEFAULTS.map((permissionKey) => ({ role: 'MANAGER', permissionKey })), keep);

// Settings and starter articles (never overwrite what an admin already edited)
await db.siteSettings.insertMany(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })), keep);
await db.articles.insertMany(STARTER_ARTICLES.map((a) => ({ ...a, status: 'PUBLISHED', publishedAt: new Date() })), keep);

// Catalogue
await db.categories.insertMany(cat.categories, keep);
await db.brands.insertMany(cat.brands, keep);
const idBySlug = async (model) => Object.fromEntries((await model.find({}, { projection: { slug: 1, id: 1 } })).map((r) => [r.slug, r.id]));
const brandId = await idBySlug(db.brands);
const categoryId = await idBySlug(db.categories);

await db.collections.insertMany(
  cat.collections.map(({ brandSlug, categorySlug, ...c }) => ({ ...c, brandId: brandId[brandSlug], categoryId: categoryId[categorySlug] ?? null })),
  keep,
);
const collectionId = await idBySlug(db.collections);

await db.products.insertMany(
  cat.products.map(({ brandSlug, collectionSlug, categorySlug, sku, ...p }) => ({
    ...p,
    brandId: brandId[brandSlug],
    collectionId: collectionId[collectionSlug] ?? null,
    categoryId: categoryId[categorySlug] ?? null,
    status: 'ACTIVE',
  })),
  keep,
);

// One default variant + inventory record per product.
const productRows = await db.products.find({}, { projection: { id: 1, slug: 1 } });
const withVariant = new Set((await db.productVariants.find({}, { projection: { productId: 1 } })).map((v) => v.productId));
const skuBySlug = Object.fromEntries(cat.products.map((p) => [p.slug, p.sku]));
await db.productVariants.insertMany(
  productRows.filter((p) => !withVariant.has(p.id)).map((p) => ({ productId: p.id, sku: skuBySlug[p.slug] ?? p.slug.toUpperCase().slice(0, 48), isDefault: true })),
  keep,
);
const variants = await db.productVariants.find({}, { projection: { id: 1 } });
await db.inventory.insertMany(variants.map((v) => ({ variantId: v.id })), keep);

console.log(`Catalogue ready: ${cat.brands.length} brands, ${cat.collections.length} collections, ${await db.products.count()} products in database.`);
await closeDb();
