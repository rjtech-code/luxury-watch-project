import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { notFound, wrap } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';

export const catalogRouter = Router();

const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 40) : []));
const bool = z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true'));

const listQuery = z.object({
  q: z.string().trim().max(80).optional(),
  brand: csv,
  collection: csv,
  category: csv,
  gender: csv,
  movement: csv,
  occasion: csv,
  caseMaterial: csv,
  strapMaterial: csv,
  dialColor: csv,
  smart: bool,
  inStock: bool,
  discounted: bool,
  limited: bool,
  featured: bool,
  minPrice: z.coerce.number().int().min(0).optional(), // rupees
  maxPrice: z.coerce.number().int().min(0).optional(),
  minSize: z.coerce.number().min(0).optional(),
  maxSize: z.coerce.number().min(0).optional(),
  minWater: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['featured', 'newest', 'popular', 'rating', 'price_asc', 'price_desc']).default('featured'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

const escapeRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const contains = (text) => ({ $regex: escapeRegex(text), $options: 'i' });
const idsOf = async (model, filter) => (await model.find(filter, { projection: { id: 1 } })).map((r) => r.id);

/**
 * Joins a product stream with its brand, collection, category, first image and available stock.
 * Adds b/co/ca (joined docs), image and available. Used by every product listing.
 */
const enrich = [
  { $lookup: { from: 'brands', localField: 'brandId', foreignField: 'id', as: 'b' } },
  { $unwind: '$b' },
  { $lookup: { from: 'collections', localField: 'collectionId', foreignField: 'id', as: 'co' } },
  { $unwind: { path: '$co', preserveNullAndEmptyArrays: true } },
  { $lookup: { from: 'categories', localField: 'categoryId', foreignField: 'id', as: 'ca' } },
  { $unwind: { path: '$ca', preserveNullAndEmptyArrays: true } },
  { $lookup: { from: 'product_images', let: { pid: '$id' }, pipeline: [{ $match: { $expr: { $eq: ['$productId', '$$pid'] } } }, { $sort: { sortOrder: 1 } }, { $limit: 1 }], as: 'img' } },
  {
    $lookup: {
      from: 'product_variants',
      let: { pid: '$id' },
      pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$productId', '$$pid'] }, { $eq: ['$isActive', true] }] } } },
        { $lookup: { from: 'inventory', localField: 'id', foreignField: 'variantId', as: 'inv' } },
        { $unwind: '$inv' },
        { $project: { _id: 0, a: { $max: [{ $subtract: ['$inv.onHand', '$inv.reserved'] }, 0] } } },
      ],
      as: 'stock',
    },
  },
  { $addFields: { image: { $ifNull: [{ $first: '$img.url' }, null] }, available: { $sum: '$stock.a' } } },
];

const cardProjection = {
  _id: 0,
  id: 1,
  name: 1,
  slug: 1,
  brandName: '$b.name',
  brandSlug: '$b.slug',
  collectionName: { $ifNull: ['$co.name', null] },
  collectionSlug: { $ifNull: ['$co.slug', null] },
  typeLabel: { $ifNull: ['$co.typeLabel', null] },
  priceMinor: 1,
  compareAtMinor: 1,
  gender: 1,
  movement: 1,
  isSmartwatch: 1,
  isLimitedEdition: 1,
  ratingAvg: 1,
  ratingCount: 1,
  image: 1,
  available: 1,
};

/** Product cards matching a product-level filter, joined and projected. */
export async function productCards(match, { sort = { popularity: -1, name: 1 }, limit, after = [] } = {}) {
  return db.products.aggregate([
    { $match: match },
    ...enrich,
    { $match: { 'b.isActive': true } },
    ...after,
    { $sort: sort },
    ...(limit ? [{ $limit: limit }] : []),
    { $project: cardProjection },
  ]);
}

/** Product-level filter (everything that does not need the joined brand or stock). */
async function buildMatch(f) {
  const m = { status: 'ACTIVE' };
  const and = [];
  if (f.q) {
    const rx = contains(f.q);
    const [brandIds, collectionIds, categoryIds] = await Promise.all([idsOf(db.brands, { name: rx }), idsOf(db.collections, { name: rx }), idsOf(db.categories, { name: rx })]);
    and.push({ $or: [{ name: rx }, { brandId: { $in: brandIds } }, { collectionId: { $in: collectionIds } }, { categoryId: { $in: categoryIds } }] });
  }
  if (f.brand.length) m.brandId = { $in: await idsOf(db.brands, { slug: { $in: f.brand } }) };
  if (f.collection.length) m.collectionId = { $in: await idsOf(db.collections, { slug: { $in: f.collection } }) };
  if (f.category.length) m.categoryId = { $in: await idsOf(db.categories, { slug: { $in: f.category } }) };
  if (f.gender.length) {
    // "Men's" and "Women's" pages also include unisex watches; unspecified gender is never assumed.
    const genders = f.gender.map((g) => g.toUpperCase());
    if (f.gender.some((g) => ['men', 'women'].includes(g.toLowerCase()))) genders.push('UNISEX');
    m.gender = { $in: genders };
  }
  if (f.movement.length) m.movement = { $in: f.movement.map((x) => x.toUpperCase()) };
  if (f.occasion.length) m.occasions = { $in: f.occasion };
  if (f.caseMaterial.length) m.caseMaterial = { $in: f.caseMaterial };
  if (f.strapMaterial.length) m.strapMaterial = { $in: f.strapMaterial };
  if (f.dialColor.length) m.dialColor = { $in: f.dialColor };
  if (f.smart !== undefined) m.isSmartwatch = f.smart;
  if (f.limited) m.isLimitedEdition = true;
  if (f.featured) m.isFeatured = true;
  if (f.discounted) and.push({ $expr: { $and: [{ $ne: ['$priceMinor', null] }, { $gt: ['$compareAtMinor', '$priceMinor'] }] } });
  const range = (field, lo, hi) => {
    if (lo === undefined && hi === undefined) return;
    m[field] = { ...(lo !== undefined && { $gte: lo }), ...(hi !== undefined && { $lte: hi }) };
  };
  range('priceMinor', f.minPrice === undefined ? undefined : f.minPrice * 100, f.maxPrice === undefined ? undefined : f.maxPrice * 100);
  range('caseDiameterMm', f.minSize, f.maxSize);
  range('waterResistanceM', f.minWater, undefined);
  if (and.length) m.$and = and;
  return m;
}

// Prices and ratings that are not set always sort last.
const SORTS = {
  featured: [{ isFeatured: -1, popularity: -1, 'b.sortOrder': 1, name: 1 }],
  newest: [{ releasedAt: -1, name: 1 }],
  popular: [{ popularity: -1, name: 1 }],
  rating: [{ ratingAvg: -1, ratingCount: -1, name: 1 }],
  price_asc: [{ _noPrice: 1, priceMinor: 1, name: 1 }, { _noPrice: { $cond: [{ $eq: [{ $ifNull: ['$priceMinor', null] }, null] }, 1, 0] } }],
  price_desc: [{ priceMinor: -1, name: 1 }],
};

export async function queryProducts(f) {
  const [sort, extra] = SORTS[f.sort];
  const [res] = await db.products.aggregate([
    { $match: await buildMatch(f) },
    ...enrich,
    { $match: { 'b.isActive': true, ...(f.inStock && { available: { $gt: 0 } }) } },
    ...(extra ? [{ $addFields: extra }] : []),
    {
      $facet: {
        total: [{ $count: 'n' }],
        items: [{ $sort: sort }, { $skip: (f.page - 1) * f.pageSize }, { $limit: f.pageSize }, { $project: cardProjection }],
      },
    },
  ]);
  const total = res.total[0]?.n ?? 0;
  return { items: res.items, total, page: f.page, pageSize: f.pageSize, pages: Math.max(1, Math.ceil(total / f.pageSize)) };
}

catalogRouter.get(
  '/products',
  validate({ query: listQuery }),
  wrap(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=30');
    res.json(await queryProducts(req.query));
  }),
);

/**
 * Facets for the filter UI. A facet is only returned when real products have a value for it, so the
 * UI never offers filters (e.g. "Dial colour") that the catalogue cannot actually satisfy.
 */
catalogRouter.get(
  '/filters',
  wrap(async (_req, res) => {
    const [brands, collections, categories] = await Promise.all([db.brands.find({ isActive: true }), db.collections.find(), db.categories.find()]);
    const brandById = new Map(brands.map((b) => [b.id, b]));
    const products = (await db.products.find({ status: 'ACTIVE', brandId: { $in: [...brandById.keys()] } })).map((p) => ({ ...p, brand: brandById.get(p.brandId) }));

    const tally = (rows, keyOf) => {
      const counts = new Map();
      for (const r of rows) for (const k of [].concat(keyOf(r) ?? [])) if (k != null) counts.set(k, (counts.get(k) ?? 0) + 1);
      return counts;
    };
    const facet = (field) => {
      const options = [...tally(products, (p) => p[field])].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value: String(value), count }));
      return options.length ? { key: field, options } : null;
    };
    const named = (docs, counts, extra = () => ({})) => docs.filter((d) => counts.has(d.id)).map((d) => ({ slug: d.slug, name: d.name, ...extra(d), count: counts.get(d.id) }));
    const minMax = (field) => {
      const v = products.map((p) => p[field]).filter((x) => x != null).map(Number);
      return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
    };

    const byName = (a, b) => a.name.localeCompare(b.name);
    const price = minMax('priceMinor');
    const size = minMax('caseDiameterMm');
    const water = minMax('waterResistanceM');
    const smart = products.filter((p) => p.isSmartwatch).length;

    res.set('Cache-Control', 'public, max-age=30');
    res.json({
      brands: named([...brands].sort((a, b) => a.sortOrder - b.sortOrder), tally(products, (p) => p.brandId)),
      categories: named([...categories].sort((a, b) => a.sortOrder - b.sortOrder), tally(products, (p) => p.categoryId)),
      collections: named([...collections].sort(byName), tally(products, (p) => p.collectionId), (c) => ({ brand: brandById.get(c.brandId)?.name ?? null })),
      gender: facet('gender'),
      movement: facet('movement'),
      caseMaterial: facet('caseMaterial'),
      strapMaterial: facet('strapMaterial'),
      dialColor: facet('dialColor'),
      occasion: facet('occasions') && { ...facet('occasions'), key: 'occasion' },
      price: price ? { minMinor: price.min, maxMinor: price.max } : null,
      caseSize: size,
      waterResistance: water?.max ? { maxM: water.max } : null,
      hasDiscounts: products.some((p) => p.priceMinor != null && p.compareAtMinor > p.priceMinor),
      hasSmartwatches: smart > 0,
      hasTraditional: products.length - smart > 0,
    });
  }),
);

catalogRouter.get(
  '/suggest',
  validate({ query: z.object({ q: z.string().trim().min(2).max(60) }) }),
  wrap(async (req, res) => {
    const rx = contains(req.query.q);
    const brandIds = await idsOf(db.brands, { name: rx });
    const rows = await productCards({ status: 'ACTIVE', $or: [{ name: rx }, { brandId: { $in: brandIds } }] }, { limit: 6 });
    res.json({ items: rows.map(({ name, slug, brandName, image, priceMinor }) => ({ name, slug, brandName, image, priceMinor })) });
  }),
);

catalogRouter.get(
  '/products/:slug',
  validate({ params: z.object({ slug: z.string().max(120) }) }),
  wrap(async (req, res) => {
    const [p] = await db.products.aggregate([
      { $match: { slug: req.params.slug, status: 'ACTIVE' } },
      ...enrich,
      { $match: { 'b.isActive': true } },
      {
        $project: {
          ...cardProjection,
          description: 1, caseMaterial: 1, caseDiameterMm: 1, dialColor: 1, strapMaterial: 1, waterResistanceM: 1,
          occasions: 1, specs: 1, warrantyInfo: 1, modelUrl: 1, isDemoData: 1, brandId: 1, collectionId: 1,
          categoryName: { $ifNull: ['$ca.name', null] },
          categorySlug: { $ifNull: ['$ca.slug', null] },
        },
      },
    ]);
    if (!p) throw notFound('Watch not found.');

    const [images, variants, inventory, related] = await Promise.all([
      db.productImages.find({ productId: p.id }, { sort: { sortOrder: 1 }, projection: { url: 1, alt: 1, credit: 1 } }),
      db.productVariants.find({ productId: p.id, isActive: true }, { sort: { isDefault: -1 } }),
      db.inventory.find({ variantId: { $in: (await db.productVariants.find({ productId: p.id }, { projection: { id: 1 } })).map((v) => v.id) } }),
      productCards(
        { status: 'ACTIVE', id: { $ne: p.id }, $or: [{ brandId: p.brandId }, ...(p.collectionId ? [{ collectionId: p.collectionId }] : [])] },
        { limit: 4, sort: { sameCollection: -1, popularity: -1 }, after: [{ $addFields: { sameCollection: { $eq: ['$collectionId', p.collectionId ?? '__none__'] } } }] },
      ),
    ]);
    const stock = new Map(inventory.map((i) => [i.variantId, i]));
    await db.products.update({ id: p.id }, { $inc: { popularity: 1 } });
    const { brandId, collectionId, ...rest } = p;
    res.json({
      product: {
        ...rest,
        images,
        variants: variants.map((v) => {
          const inv = stock.get(v.id);
          return { id: v.id, sku: v.sku, label: v.label, attributes: v.attributes, priceMinor: v.priceMinor ?? p.priceMinor ?? null, available: Math.max(0, (inv?.onHand ?? 0) - (inv?.reserved ?? 0)), isDefault: v.isDefault };
        }),
        related,
      },
    });
  }),
);

const firstName = (name) => String(name ?? '').split(' ')[0];

catalogRouter.get(
  '/products/:slug/reviews',
  validate({ params: z.object({ slug: z.string().max(120) }) }),
  wrap(async (req, res) => {
    const p = await db.products.findOne({ slug: req.params.slug }, { projection: { id: 1 } });
    if (!p) throw notFound('Watch not found.');
    const rows = await db.reviews.find({ productId: p.id, status: 'APPROVED' }, { sort: { createdAt: -1 }, limit: 50 });
    const users = new Map((await db.users.find({ id: { $in: rows.map((r) => r.userId) } }, { projection: { id: 1, name: 1 } })).map((u) => [u.id, u]));
    res.json({
      items: rows
        .filter((r) => users.has(r.userId))
        .map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, verifiedPurchase: r.verifiedPurchase, createdAt: r.createdAt, author: firstName(users.get(r.userId).name) })),
    });
  }),
);

/** Photo of the most prominent active watch per value of `field` (brandId, collectionId or categoryId). */
async function coverImages(field) {
  const rows = await db.products.aggregate([
    { $match: { status: 'ACTIVE' } },
    { $lookup: { from: 'product_images', let: { pid: '$id' }, pipeline: [{ $match: { $expr: { $eq: ['$productId', '$$pid'] } } }, { $sort: { sortOrder: 1 } }, { $limit: 1 }], as: 'img' } },
    { $match: { 'img.0': { $exists: true } } },
    { $sort: { isFeatured: -1, popularity: -1, name: 1 } },
    { $group: { _id: `$${field}`, url: { $first: { $first: '$img.url' } } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.url]));
}

/** Number of active products per value of `field` (brandId, collectionId or categoryId). */
async function activeCounts(field) {
  const rows = await db.products.aggregate([{ $match: { status: 'ACTIVE' } }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

catalogRouter.get(
  '/brands',
  wrap(async (_req, res) => {
    const [rows, counts, covers] = await Promise.all([db.brands.find({ isActive: true }, { sort: { sortOrder: 1 } }), activeCounts('brandId'), coverImages('brandId')]);
    res.json({ items: rows.map((b) => ({ name: b.name, slug: b.slug, country: b.country, founded: b.founded, segment: b.segment, logoUrl: b.logoUrl, coverUrl: b.heroImageUrl ?? covers.get(b.id) ?? null, productCount: counts.get(b.id) ?? 0 })) });
  }),
);

catalogRouter.get(
  '/brands/:slug',
  validate({ params: z.object({ slug: z.string().max(120) }) }),
  wrap(async (req, res) => {
    const brand = await db.brands.findOne({ slug: req.params.slug, isActive: true });
    if (!brand) throw notFound('Brand not found.');
    const [collections, counts, covers, featured, others] = await Promise.all([
      db.collections.find({ brandId: brand.id }, { sort: { sortOrder: 1 } }),
      activeCounts('collectionId'),
      coverImages('collectionId'),
      productCards({ brandId: brand.id, status: 'ACTIVE' }, { sort: { isFeatured: -1, popularity: -1 }, limit: 4 }),
      db.brands.find({ id: { $ne: brand.id }, isActive: true, ...(brand.segment && { segment: brand.segment }) }, { projection: { name: 1, slug: 1 }, limit: 5 }),
    ]);
    const { id, createdAt, updatedAt, ...pub } = brand;
    res.json({
      brand: pub,
      collections: collections.map((c) => ({ name: c.name, slug: c.slug, typeLabel: c.typeLabel, imageUrl: c.imageUrl ?? covers.get(c.id) ?? null, productCount: counts.get(c.id) ?? 0 })),
      featured,
      relatedBrands: others,
    });
  }),
);

catalogRouter.get(
  '/collections',
  validate({ query: z.object({ brand: z.string().max(120).optional() }) }),
  wrap(async (req, res) => {
    const brands = await db.brands.find({ isActive: true, ...(req.query.brand && { slug: req.query.brand }) });
    const brandById = new Map(brands.map((b) => [b.id, b]));
    const [rows, counts, covers] = await Promise.all([db.collections.find({ brandId: { $in: [...brandById.keys()] } }), activeCounts('collectionId'), coverImages('collectionId')]);
    rows.sort((a, b) => brandById.get(a.brandId).sortOrder - brandById.get(b.brandId).sortOrder || a.sortOrder - b.sortOrder);
    res.json({
      items: rows.map((c) => ({ name: c.name, slug: c.slug, typeLabel: c.typeLabel, imageUrl: c.imageUrl ?? covers.get(c.id) ?? null, brandName: brandById.get(c.brandId).name, brandSlug: brandById.get(c.brandId).slug, productCount: counts.get(c.id) ?? 0 })),
    });
  }),
);

catalogRouter.get(
  '/collections/:slug',
  validate({ params: z.object({ slug: z.string().max(120) }) }),
  wrap(async (req, res) => {
    const c = await db.collections.findOne({ slug: req.params.slug });
    const brand = c && (await db.brands.findOne({ id: c.brandId }));
    if (!brand) throw notFound('Collection not found.');
    const siblings = await db.collections.find({ brandId: brand.id, slug: { $ne: c.slug } }, { projection: { name: 1, slug: 1 } });
    res.json({
      collection: { name: c.name, slug: c.slug, typeLabel: c.typeLabel, description: c.description, imageUrl: c.imageUrl, brandName: brand.name, brandSlug: brand.slug },
      relatedCollections: siblings,
    });
  }),
);

catalogRouter.get(
  '/categories',
  wrap(async (_req, res) => {
    const [rows, counts, covers] = await Promise.all([db.categories.find({}, { sort: { sortOrder: 1 } }), activeCounts('categoryId'), coverImages('categoryId')]);
    res.json({ items: rows.map((c) => ({ name: c.name, slug: c.slug, description: c.description, imageUrl: c.imageUrl ?? covers.get(c.id) ?? null, productCount: counts.get(c.id) ?? 0 })) });
  }),
);

/** Batch lookup used by wishlist, compare and recently-viewed (client keeps the slug lists). */
catalogRouter.get(
  '/by-slugs',
  validate({ query: z.object({ slugs: csv }) }),
  wrap(async (req, res) => {
    if (!req.query.slugs.length) return res.json({ items: [] });
    const items = await productCards({ status: 'ACTIVE', slug: { $in: req.query.slugs.slice(0, 12) } });
    const order = new Map(req.query.slugs.map((sl, i) => [sl, i]));
    items.sort((a, b) => order.get(a.slug) - order.get(b.slug));
    res.json({ items });
  }),
);

/** Homepage rails. */
catalogRouter.get(
  '/home',
  wrap(async (_req, res) => {
    const rail = (match, sort) => productCards({ status: 'ACTIVE', ...match }, { sort, limit: 8 });
    const [featured, bestSellers, newArrivals, men, women, limited, banners, articles, reviewRows] = await Promise.all([
      rail({ isFeatured: true }, { popularity: -1, name: 1 }),
      rail({}, { popularity: -1, name: 1 }),
      rail({}, { releasedAt: -1, name: 1 }),
      rail({ gender: { $in: ['MEN', 'UNISEX'] } }, { popularity: -1, name: 1 }),
      rail({ gender: { $in: ['WOMEN', 'UNISEX'] } }, { popularity: -1, name: 1 }),
      rail({ isLimitedEdition: true }, { releasedAt: -1, name: 1 }),
      db.banners.find({ isActive: true }, { sort: { sortOrder: 1 } }),
      db.articles.find({ status: 'PUBLISHED' }, { sort: { publishedAt: -1 }, limit: 3, projection: { slug: 1, title: 1, excerpt: 1, coverUrl: 1, category: 1, publishedAt: 1 } }),
      db.reviews.find({ status: 'APPROVED' }, { sort: { createdAt: -1 }, limit: 6 }),
    ]);
    const [users, products] = await Promise.all([
      db.users.find({ id: { $in: reviewRows.map((r) => r.userId) } }, { projection: { id: 1, name: 1 } }),
      db.products.find({ id: { $in: reviewRows.map((r) => r.productId) } }, { projection: { id: 1, name: 1 } }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const productById = new Map(products.map((p) => [p.id, p]));
    const reviews = reviewRows
      .filter((r) => userById.has(r.userId) && productById.has(r.productId))
      .map((r) => ({ rating: r.rating, title: r.title, body: r.body, author: firstName(userById.get(r.userId).name), product: productById.get(r.productId).name }));
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ featured, bestSellers, newArrivals, men, women, limited, banners, articles, reviews });
  }),
);
