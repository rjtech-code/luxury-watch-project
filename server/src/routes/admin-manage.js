import { Router } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { db, ping, withTx } from '../db/client.js';
import { config } from '../config.js';
import { badRequest, conflict, forbidden, notFound, wrap } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { randomToken } from '../lib/crypto.js';
import { hashPassword, passwordProblem } from '../lib/password.js';
import { slugify } from '../lib/slug.js';
import { revokeAllForUser } from '../lib/session.js';
import { emailConfigured } from '../lib/mailer.js';
import { requirePermission, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { clearSettingsCache, getSettings } from '../services/settings.js';
import { DEFAULT_SETTINGS } from '../db/defaults.js';
import { recomputeRating } from './account.js';
import { contains } from './catalog.js';

export const adminManageRouter = Router();
const idParam = z.object({ id: z.string().uuid() });
const page = z.coerce.number().int().min(1).default(1);

// ------------------------------------------------------------------ uploads
// On Vercel the app folder is read-only, so admin uploads go to /tmp there (temporary: use object storage
// such as Vercel Blob or S3 for uploads that must last). Catalogue photos are served from server/data/photos.
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? (process.env.VERCEL ? path.join(os.tmpdir(), 'uploads') : path.join(process.cwd(), 'uploads')));
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch {
  /* read-only disk: uploads will fail with an error, the rest of the API still works */
}

const SIGNATURES = [
  { ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { ext: '.glb', test: (b) => b.subarray(0, 4).toString() === 'glTF' },
];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

adminManageRouter.post('/uploads', requirePermission('products.write', 'content.manage'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded.');
  // Trust the bytes, not the filename or client-declared type.
  const sig = SIGNATURES.find((x) => x.test(req.file.buffer));
  if (!sig) throw badRequest('Only JPEG, PNG, WebP images and GLB 3D models are allowed.');
  if (sig.ext !== '.glb' && req.file.size > 6 * 1024 * 1024) throw badRequest('Images must be 6 MB or smaller.');
  const name = `${Date.now()}-${randomToken(8).replace(/[^A-Za-z0-9]/g, '')}${sig.ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), req.file.buffer, { flag: 'wx' });
  await audit(req, 'upload.create', 'file', name, { bytes: req.file.size });
  res.status(201).json({ url: `/uploads/${name}` });
}));

// ------------------------------------------------------------------ products
const assetUrl = z.string().max(500).refine((u) => u.startsWith('/uploads/') || /^https:\/\//.test(u), 'Use an uploaded file or an https:// URL');
const gender = z.enum(['MEN', 'WOMEN', 'UNISEX']);
const movement = z.enum(['AUTOMATIC', 'MECHANICAL', 'QUARTZ', 'SOLAR', 'SMART']);

const productShape = z.object({
  name: z.string().trim().min(2).max(140),
  brandId: z.string().uuid(),
  collectionId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
  priceMinor: z.number().int().min(100).max(1_000_000_00_00).nullable().optional(),
  compareAtMinor: z.number().int().min(100).nullable().optional(),
  gender: gender.nullable().optional(),
  movement: movement.nullable().optional(),
  isSmartwatch: z.boolean().default(false),
  caseMaterial: z.string().trim().max(60).nullable().optional(),
  caseDiameterMm: z.number().min(20).max(60).nullable().optional(),
  dialColor: z.string().trim().max(40).nullable().optional(),
  strapMaterial: z.string().trim().max(60).nullable().optional(),
  waterResistanceM: z.number().int().min(0).max(5000).nullable().optional(),
  occasions: z.array(z.string().trim().min(2).max(30)).max(10).default([]),
  specs: z.record(z.string().max(60), z.string().max(200)).default({}),
  warrantyInfo: z.string().trim().max(1000).nullable().optional(),
  modelUrl: assetUrl.nullable().optional(),
  isFeatured: z.boolean().default(false),
  isLimitedEdition: z.boolean().default(false),
  images: z.array(z.object({ url: assetUrl, alt: z.string().max(160).optional() })).max(12).default([]),
}).strict();

// A missing price is allowed ("price on request"): such a watch is listed but cannot be added to a cart.
const comparePriceRule = (v, ctx) => {
  if (v.compareAtMinor != null && (v.priceMinor == null || v.compareAtMinor <= v.priceMinor)) ctx.addIssue({ code: 'custom', path: ['compareAtMinor'], message: 'Compare-at price must be higher than the price.' });
};
const productBody = productShape.superRefine(comparePriceRule);
const productCreateBody = productShape.extend({ sku: z.string().trim().min(3).max(48).regex(/^[A-Za-z0-9._-]+$/, 'SKU may only contain letters, numbers, dot, dash and underscore'), initialStock: z.number().int().min(0).max(100000).default(0) }).strict().superRefine(comparePriceRule);

async function uniqueProductSlug(base, excludeId) {
  let slug = base; let i = 2;
  for (;;) {
    const hit = await db.products.findOne({ slug, ...(excludeId && { id: { $ne: excludeId } }) }, { projection: { id: 1 } });
    if (!hit) return slug;
    slug = `${base}-${i++}`;
  }
}


adminManageRouter.get('/products', requirePermission('products.read'), validate({ query: z.object({ q: z.string().trim().max(80).optional(), status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(), page }) }), wrap(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.q) {
    const rx = contains(req.query.q);
    const brandIds = (await db.brands.find({ name: rx }, { projection: { id: 1 } })).map((b) => b.id);
    where.$or = [{ name: rx }, { brandId: { $in: brandIds } }];
  }
  const size = 25;
  const [n, rows] = await Promise.all([db.products.count(where), db.products.find(where, { sort: { updatedAt: -1, _id: 1 }, skip: (req.query.page - 1) * size, limit: size })]);
  const [brands, images] = await Promise.all([
    db.brands.find({ id: { $in: rows.map((p) => p.brandId) } }, { projection: { id: 1, name: 1 } }),
    db.productImages.aggregate([{ $match: { productId: { $in: rows.map((p) => p.id) } } }, { $group: { _id: '$productId', n: { $sum: 1 } } }]),
  ]);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const imageCount = new Map(images.map((i) => [i._id, i.n]));
  res.json({
    items: rows.map((p) => ({ id: p.id, name: p.name, slug: p.slug, brand: brandName.get(p.brandId) ?? null, status: p.status, priceMinor: p.priceMinor, isDemoData: p.isDemoData, imageCount: imageCount.get(p.id) ?? 0 })),
    total: n,
    pages: Math.max(1, Math.ceil(n / size)),
  });
}));

adminManageRouter.get('/products/:id', requirePermission('products.read'), validate({ params: idParam }), wrap(async (req, res) => {
  const p = await db.products.findOne({ id: req.params.id });
  if (!p) throw notFound('Product not found.');
  const [images, variants] = await Promise.all([
    db.productImages.find({ productId: p.id }, { sort: { sortOrder: 1 } }),
    db.productVariants.find({ productId: p.id }),
  ]);
  const stock = new Map((await db.inventory.find({ variantId: { $in: variants.map((v) => v.id) } })).map((i) => [i.variantId, i]));
  res.json({
    product: {
      ...p,
      images,
      variants: variants.map((v) => ({ id: v.id, sku: v.sku, label: v.label, priceMinor: v.priceMinor, isActive: v.isActive, isDefault: v.isDefault, onHand: stock.get(v.id)?.onHand ?? null, reserved: stock.get(v.id)?.reserved ?? null })),
    },
  });
}));

adminManageRouter.post('/products', requirePermission('products.write'), validate({ body: productCreateBody }), wrap(async (req, res) => {
  const { images, sku, initialStock, ...fields } = req.body;
  const brand = await db.brands.findOne({ id: fields.brandId }, { projection: { slug: 1 } });
  if (!brand) throw badRequest('Unknown brand.');
  const skuHit = await db.productVariants.findOne({ sku }, { projection: { id: 1 } });
  if (skuHit) throw conflict('That SKU is already in use.', 'SKU_TAKEN');
  const slug = await uniqueProductSlug(`${brand.slug}-${slugify(fields.name)}`);
  const created = await withTx(async (session) => {
    const p = await db.products.insert({ ...fields, slug }, { session });
    await db.productImages.insertMany(images.map((im, i) => ({ productId: p.id, url: im.url, alt: im.alt ?? p.name, sortOrder: i })), { session });
    const v = await db.productVariants.insert({ productId: p.id, sku, isDefault: true }, { session });
    await db.inventory.insert({ variantId: v.id, onHand: initialStock }, { session });
    return p;
  });
  await audit(req, 'product.create', 'product', created.id, { name: created.name });
  res.status(201).json({ product: created });
}));

adminManageRouter.put('/products/:id', requirePermission('products.write'), validate({ params: idParam, body: productBody }), wrap(async (req, res) => {
  const { images, ...fields } = req.body;
  const before = await db.products.findOne({ id: req.params.id });
  if (!before) throw notFound('Product not found.');
  const updated = await withTx(async (session) => {
    const p = await db.products.updateOne({ id: req.params.id }, { ...fields, isDemoData: false, updatedAt: new Date() }, { session });
    // Images that stay keep their photo credit and origin.
    const kept = new Map((await db.productImages.find({ productId: p.id }, { session })).map((im) => [im.url, im]));
    await db.productImages.delete({ productId: p.id }, { session });
    await db.productImages.insertMany(images.map((im, i) => ({ productId: p.id, url: im.url, alt: im.alt ?? p.name, sortOrder: i, ...(kept.get(im.url)?.credit && { credit: kept.get(im.url).credit, source: kept.get(im.url).source }) })), { session });
    return p;
  });
  await audit(req, 'product.update', 'product', updated.id, { name: updated.name, priceBefore: before.priceMinor, priceAfter: updated.priceMinor, statusBefore: before.status, statusAfter: updated.status });
  res.json({ product: updated });
}));

/** Products are archived, never hard-deleted, so past orders and reviews keep their references. */
adminManageRouter.delete('/products/:id', requirePermission('products.write'), validate({ params: idParam }), wrap(async (req, res) => {
  const p = await db.products.updateOne({ id: req.params.id }, { status: 'ARCHIVED', isFeatured: false, updatedAt: new Date() });
  if (!p) throw notFound('Product not found.');
  await audit(req, 'product.archive', 'product', p.id, { name: p.name });
  res.json({ ok: true });
}));

adminManageRouter.post('/products/:id/variants', requirePermission('products.write'), validate({ params: idParam, body: z.object({ sku: z.string().trim().min(3).max(48).regex(/^[A-Za-z0-9._-]+$/), label: z.string().trim().min(1).max(60), priceMinor: z.number().int().min(100).nullable().optional(), attributes: z.record(z.string().max(40), z.string().max(80)).default({}), initialStock: z.number().int().min(0).max(100000).default(0) }).strict() }), wrap(async (req, res) => {
  const { initialStock, ...v } = req.body;
  if (!(await db.products.findOne({ id: req.params.id }, { projection: { id: 1 } }))) throw notFound('Product not found.');
  const skuHit = await db.productVariants.findOne({ sku: v.sku }, { projection: { id: 1 } });
  if (skuHit) throw conflict('That SKU is already in use.', 'SKU_TAKEN');
  const created = await withTx(async (session) => {
    const row = await db.productVariants.insert({ ...v, productId: req.params.id }, { session });
    await db.inventory.insert({ variantId: row.id, onHand: initialStock }, { session });
    return row;
  });
  await audit(req, 'variant.create', 'variant', created.id, { sku: created.sku });
  res.status(201).json({ variant: created });
}));

adminManageRouter.patch('/variants/:id', requirePermission('products.write'), validate({ params: idParam, body: z.object({ label: z.string().trim().min(1).max(60).optional(), priceMinor: z.number().int().min(100).nullable().optional(), isActive: z.boolean().optional() }).strict() }), wrap(async (req, res) => {
  const v = await db.productVariants.updateOne({ id: req.params.id }, req.body);
  if (!v) throw notFound('Variant not found.');
  await audit(req, 'variant.update', 'variant', v.id, req.body);
  res.json({ variant: v });
}));

// ------------------------------------------------------------------ brands / collections / categories
const brandBody = z.object({ name: z.string().trim().min(2).max(80), country: z.string().trim().max(60).nullable().optional(), founded: z.number().int().min(1500).max(2100).nullable().optional(), parentCompany: z.string().trim().max(80).nullable().optional(), segment: z.string().trim().max(60).nullable().optional(), introduction: z.string().trim().max(3000).nullable().optional(), history: z.string().trim().max(6000).nullable().optional(), logoUrl: assetUrl.nullable().optional(), heroImageUrl: assetUrl.nullable().optional(), isActive: z.boolean().default(true), sortOrder: z.number().int().min(0).max(10000).default(0) }).strict();

adminManageRouter.get('/brands', requirePermission('products.read'), wrap(async (_req, res) => {
  res.json({ items: await db.brands.find({}, { sort: { sortOrder: 1, name: 1 } }) });
}));
adminManageRouter.post('/brands', requirePermission('products.write'), validate({ body: brandBody }), wrap(async (req, res) => {
  const slug = slugify(req.body.name);
  if (await db.brands.findOne({ slug })) throw conflict('A brand with this name already exists.');
  const b = await db.brands.insert({ ...req.body, slug });
  await audit(req, 'brand.create', 'brand', b.id, { name: b.name });
  res.status(201).json({ brand: b });
}));
adminManageRouter.put('/brands/:id', requirePermission('products.write'), validate({ params: idParam, body: brandBody }), wrap(async (req, res) => {
  const b = await db.brands.updateOne({ id: req.params.id }, { ...req.body, updatedAt: new Date() });
  if (!b) throw notFound('Brand not found.');
  await audit(req, 'brand.update', 'brand', b.id, { name: b.name });
  res.json({ brand: b });
}));

const collectionBody = z.object({ name: z.string().trim().min(2).max(80), brandId: z.string().uuid(), categoryId: z.string().uuid().nullable().optional(), typeLabel: z.string().trim().max(80).nullable().optional(), description: z.string().trim().max(3000).nullable().optional(), imageUrl: assetUrl.nullable().optional(), isFeatured: z.boolean().default(false), sortOrder: z.number().int().min(0).max(10000).default(0) }).strict();
adminManageRouter.get('/collections', requirePermission('products.read'), wrap(async (_req, res) => {
  const [rows, brands] = await Promise.all([db.collections.find(), db.brands.find({}, { projection: { id: 1, name: 1 } })]);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const items = rows
    .filter((c) => brandName.has(c.brandId))
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, brandId: c.brandId, brand: brandName.get(c.brandId), categoryId: c.categoryId, typeLabel: c.typeLabel, description: c.description, imageUrl: c.imageUrl, isFeatured: c.isFeatured }))
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
  res.json({ items });
}));
adminManageRouter.post('/collections', requirePermission('products.write'), validate({ body: collectionBody }), wrap(async (req, res) => {
  const b = await db.brands.findOne({ id: req.body.brandId }, { projection: { slug: 1 } });
  if (!b) throw badRequest('Unknown brand.');
  const slug = `${b.slug}-${slugify(req.body.name)}`;
  if (await db.collections.findOne({ slug })) throw conflict('This collection already exists.');
  const c = await db.collections.insert({ ...req.body, slug });
  await audit(req, 'collection.create', 'collection', c.id, { name: c.name });
  res.status(201).json({ collection: c });
}));
adminManageRouter.put('/collections/:id', requirePermission('products.write'), validate({ params: idParam, body: collectionBody }), wrap(async (req, res) => {
  const c = await db.collections.updateOne({ id: req.params.id }, req.body);
  if (!c) throw notFound('Collection not found.');
  await audit(req, 'collection.update', 'collection', c.id, { name: c.name });
  res.json({ collection: c });
}));

const categoryBody = z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(1000).nullable().optional(), imageUrl: assetUrl.nullable().optional(), sortOrder: z.number().int().min(0).max(1000).default(0) }).strict();
adminManageRouter.get('/categories', requirePermission('products.read'), wrap(async (_req, res) => {
  res.json({ items: await db.categories.find({}, { sort: { sortOrder: 1, name: 1 } }) });
}));
adminManageRouter.post('/categories', requirePermission('products.write'), validate({ body: categoryBody }), wrap(async (req, res) => {
  const slug = slugify(req.body.name);
  if (await db.categories.findOne({ slug })) throw conflict('This category already exists.');
  const c = await db.categories.insert({ ...req.body, slug });
  await audit(req, 'category.create', 'category', c.id, { name: c.name });
  res.status(201).json({ category: c });
}));
adminManageRouter.put('/categories/:id', requirePermission('products.write'), validate({ params: idParam, body: categoryBody }), wrap(async (req, res) => {
  const c = await db.categories.updateOne({ id: req.params.id }, req.body);
  if (!c) throw notFound('Category not found.');
  await audit(req, 'category.update', 'category', c.id, { name: c.name });
  res.json({ category: c });
}));

// ------------------------------------------------------------------ users, managers, permissions (users.manage)
const publicRow = (u) => ({ id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, status: u.status, emailVerified: Boolean(u.emailVerifiedAt), createdAt: u.createdAt });

adminManageRouter.get('/users', requirePermission('users.manage'), validate({ query: z.object({ role: z.enum(['CUSTOMER', 'MANAGER', 'SUPER_ADMIN']).optional(), q: z.string().trim().max(80).optional(), page }) }), wrap(async (req, res) => {
  const where = {};
  if (req.query.role) where.role = req.query.role;
  if (req.query.q) where.$or = [{ email: contains(req.query.q) }, { name: contains(req.query.q) }];
  const size = 25;
  const [n, rows] = await Promise.all([db.users.count(where), db.users.find(where, { sort: { createdAt: -1 }, skip: (req.query.page - 1) * size, limit: size })]);
  res.json({ items: rows.map(publicRow), total: n, pages: Math.max(1, Math.ceil(n / size)) });
}));

adminManageRouter.post('/users/managers', requireRole('SUPER_ADMIN'), validate({ body: z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(254), password: z.string().max(128) }).strict() }), wrap(async (req, res) => {
  const problem = passwordProblem(req.body.password);
  if (problem) throw badRequest(problem);
  if (await db.users.findOne({ email: req.body.email })) throw conflict('An account with this email already exists.', 'EMAIL_TAKEN');
  const u = await db.users.insert({ name: req.body.name, email: req.body.email, passwordHash: await hashPassword(req.body.password), role: 'MANAGER', emailVerifiedAt: new Date() });
  await audit(req, 'user.create_manager', 'user', u.id, { email: u.email });
  res.status(201).json({ user: publicRow(u) });
}));

/**
 * Role changes are limited to CUSTOMER <-> MANAGER. SUPER_ADMIN can only be created from the server
 * command line, and an existing SUPER_ADMIN account can never be edited or suspended through the API.
 */
adminManageRouter.patch('/users/:id', requireRole('SUPER_ADMIN'), validate({ params: idParam, body: z.object({ role: z.enum(['CUSTOMER', 'MANAGER']).optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional() }).strict() }), wrap(async (req, res) => {
  if (req.params.id === req.user.id) throw forbidden('You cannot change your own role or status.');
  const target = await db.users.findOne({ id: req.params.id });
  if (!target) throw notFound('User not found.');
  if (target.role === 'SUPER_ADMIN') throw forbidden('Super-admin accounts cannot be modified here.');
  const u = await db.users.updateOne({ id: target.id, role: { $ne: 'SUPER_ADMIN' } }, { ...req.body, updatedAt: new Date() });
  if (req.body.status === 'SUSPENDED' || (req.body.role && req.body.role !== target.role)) await revokeAllForUser(target.id);
  if (req.body.role === 'CUSTOMER') await db.userPermissions.delete({ userId: target.id });
  await audit(req, 'user.update', 'user', target.id, { from: { role: target.role, status: target.status }, to: req.body });
  res.json({ user: publicRow(u) });
}));

adminManageRouter.get('/permissions', requirePermission('users.manage'), wrap(async (_req, res) => {
  const [all, defaults] = await Promise.all([db.permissions.find({}, { sort: { key: 1 } }), db.rolePermissions.find({ role: 'MANAGER' })]);
  res.json({ permissions: all, managerDefaults: defaults.map((d) => d.permissionKey) });
}));

adminManageRouter.get('/users/:id/permissions', requirePermission('users.manage'), validate({ params: idParam }), wrap(async (req, res) => {
  const rows = await db.userPermissions.find({ userId: req.params.id });
  res.json({ granted: rows.map((r) => r.permissionKey) });
}));

adminManageRouter.put('/users/:id/permissions', requireRole('SUPER_ADMIN'), validate({ params: idParam, body: z.object({ keys: z.array(z.string().max(60)).max(40) }).strict() }), wrap(async (req, res) => {
  const target = await db.users.findOne({ id: req.params.id });
  if (!target) throw notFound('User not found.');
  if (target.role !== 'MANAGER') throw badRequest('Permissions can only be assigned to manager accounts.');
  const known = new Set((await db.permissions.find()).map((p) => p.key));
  const keys = [...new Set(req.body.keys)];
  if (keys.some((k) => !known.has(k))) throw badRequest('Unknown permission.');
  await withTx(async (session) => {
    await db.userPermissions.delete({ userId: target.id }, { session });
    await db.userPermissions.insertMany(keys.map((permissionKey) => ({ userId: target.id, permissionKey })), { session });
  });
  await audit(req, 'user.permissions', 'user', target.id, { keys });
  res.json({ granted: keys });
}));

// ------------------------------------------------------------------ coupons
const couponBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Use 3-30 letters, numbers, dash or underscore'),
  description: z.string().trim().max(200).nullable().optional(),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().min(1),
  minSubtotalMinor: z.number().int().min(0).default(0),
  maxDiscountMinor: z.number().int().min(100).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).nullable().optional(),
  isActive: z.boolean().default(true),
}).strict().superRefine((v, ctx) => {
  if (v.type === 'PERCENT' && v.value > 100) ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage cannot exceed 100.' });
  if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End must be after start.' });
});
const couponDb = (b) => ({ ...b, startsAt: b.startsAt ? new Date(b.startsAt) : null, endsAt: b.endsAt ? new Date(b.endsAt) : null });

adminManageRouter.get('/coupons', requirePermission('coupons.manage'), wrap(async (_req, res) => {
  res.json({ items: await db.coupons.find({}, { sort: { createdAt: -1 } }) });
}));
adminManageRouter.post('/coupons', requirePermission('coupons.manage'), validate({ body: couponBody }), wrap(async (req, res) => {
  if (await db.coupons.findOne({ code: req.body.code })) throw conflict('This coupon code already exists.');
  const c = await db.coupons.insert(couponDb(req.body));
  await audit(req, 'coupon.create', 'coupon', c.id, { code: c.code });
  res.status(201).json({ coupon: c });
}));
adminManageRouter.put('/coupons/:id', requirePermission('coupons.manage'), validate({ params: idParam, body: couponBody }), wrap(async (req, res) => {
  const c = await db.coupons.updateOne({ id: req.params.id }, couponDb(req.body));
  if (!c) throw notFound('Coupon not found.');
  await audit(req, 'coupon.update', 'coupon', c.id, { code: c.code, isActive: c.isActive });
  res.json({ coupon: c });
}));

// ------------------------------------------------------------------ reviews
adminManageRouter.get('/reviews', requirePermission('reviews.moderate'), validate({ query: z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING') }) }), wrap(async (req, res) => {
  const rows = await db.reviews.find({ status: req.query.status }, { sort: { createdAt: -1 }, limit: 100 });
  const [products, users] = await Promise.all([
    db.products.find({ id: { $in: rows.map((r) => r.productId) } }, { projection: { id: 1, name: 1 } }),
    db.users.find({ id: { $in: rows.map((r) => r.userId) } }, { projection: { id: 1, name: 1 } }),
  ]);
  const product = new Map(products.map((p) => [p.id, p.name]));
  const author = new Map(users.map((u) => [u.id, u.name]));
  res.json({
    items: rows
      .filter((r) => product.has(r.productId) && author.has(r.userId))
      .map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, status: r.status, verifiedPurchase: r.verifiedPurchase, createdAt: r.createdAt, product: product.get(r.productId), author: author.get(r.userId) })),
  });
}));
adminManageRouter.patch('/reviews/:id', requirePermission('reviews.moderate'), validate({ params: idParam, body: z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).strict() }), wrap(async (req, res) => {
  const r = await db.reviews.updateOne({ id: req.params.id }, { status: req.body.status });
  if (!r) throw notFound('Review not found.');
  await recomputeRating(r.productId);
  await audit(req, 'review.moderate', 'review', r.id, { status: r.status });
  res.json({ review: r });
}));

// ------------------------------------------------------------------ content: banners, articles, newsletter
const bannerBody = z.object({ placement: z.enum(['hero', 'announcement', 'promo']), title: z.string().trim().min(2).max(120), subtitle: z.string().trim().max(240).nullable().optional(), imageUrl: assetUrl.nullable().optional(), ctaLabel: z.string().trim().max(40).nullable().optional(), ctaHref: z.string().trim().max(300).regex(/^(\/|https:\/\/)/, 'Use a site path or https:// link').nullable().optional(), isActive: z.boolean().default(true), sortOrder: z.number().int().min(0).max(1000).default(0), startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional() }).strict();
const bannerDb = (b) => ({ ...b, startsAt: b.startsAt ? new Date(b.startsAt) : null, endsAt: b.endsAt ? new Date(b.endsAt) : null });
adminManageRouter.get('/banners', requirePermission('content.manage'), wrap(async (_req, res) => res.json({ items: await db.banners.find({}, { sort: { placement: 1, sortOrder: 1 } }) })));
adminManageRouter.post('/banners', requirePermission('content.manage'), validate({ body: bannerBody }), wrap(async (req, res) => {
  const b = await db.banners.insert(bannerDb(req.body));
  await audit(req, 'banner.create', 'banner', b.id, { title: b.title });
  res.status(201).json({ banner: b });
}));
adminManageRouter.put('/banners/:id', requirePermission('content.manage'), validate({ params: idParam, body: bannerBody }), wrap(async (req, res) => {
  const b = await db.banners.updateOne({ id: req.params.id }, bannerDb(req.body));
  if (!b) throw notFound('Banner not found.');
  await audit(req, 'banner.update', 'banner', b.id, { title: b.title });
  res.json({ banner: b });
}));
adminManageRouter.delete('/banners/:id', requirePermission('content.manage'), validate({ params: idParam }), wrap(async (req, res) => {
  await db.banners.delete({ id: req.params.id });
  await audit(req, 'banner.delete', 'banner', req.params.id);
  res.json({ ok: true });
}));

const articleBody = z.object({ title: z.string().trim().min(3).max(160), excerpt: z.string().trim().max(300).nullable().optional(), body: z.string().trim().min(20).max(30000), coverUrl: assetUrl.nullable().optional(), category: z.string().trim().max(40).nullable().optional(), status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT') }).strict();
adminManageRouter.get('/articles', requirePermission('content.manage'), wrap(async (_req, res) => res.json({ items: await db.articles.find({}, { sort: { createdAt: -1 } }) })));
adminManageRouter.post('/articles', requirePermission('content.manage'), validate({ body: articleBody }), wrap(async (req, res) => {
  let slug = slugify(req.body.title);
  if (await db.articles.findOne({ slug })) slug = `${slug}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const a = await db.articles.insert({ ...req.body, slug, publishedAt: req.body.status === 'PUBLISHED' ? new Date() : null });
  await audit(req, 'article.create', 'article', a.id, { title: a.title });
  res.status(201).json({ article: a });
}));
adminManageRouter.put('/articles/:id', requirePermission('content.manage'), validate({ params: idParam, body: articleBody }), wrap(async (req, res) => {
  const cur = await db.articles.findOne({ id: req.params.id });
  if (!cur) throw notFound('Article not found.');
  const a = await db.articles.updateOne({ id: cur.id }, { ...req.body, publishedAt: req.body.status === 'PUBLISHED' ? cur.publishedAt ?? new Date() : null });
  await audit(req, 'article.update', 'article', a.id, { title: a.title, status: a.status });
  res.json({ article: a });
}));
adminManageRouter.delete('/articles/:id', requirePermission('content.manage'), validate({ params: idParam }), wrap(async (req, res) => {
  await db.articles.delete({ id: req.params.id });
  await audit(req, 'article.delete', 'article', req.params.id);
  res.json({ ok: true });
}));

adminManageRouter.get('/newsletter', requirePermission('content.manage'), wrap(async (_req, res) => {
  const rows = await db.newsletterSubscribers.find({}, { sort: { createdAt: -1 }, limit: 1000 });
  res.json({ items: rows, active: rows.filter((r) => !r.unsubscribedAt).length });
}));

// ------------------------------------------------------------------ support
adminManageRouter.get('/support', requirePermission('support.manage'), validate({ query: z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(), type: z.enum(['CONTACT', 'WARRANTY', 'SERVICE', 'ORDER_HELP']).optional() }) }), wrap(async (req, res) => {
  const rows = await db.supportRequests.find({ ...(req.query.status && { status: req.query.status }), ...(req.query.type && { type: req.query.type }) }, { sort: { createdAt: -1 }, limit: 200 });
  res.json({ items: rows });
}));
adminManageRouter.patch('/support/:id', requirePermission('support.manage'), validate({ params: idParam, body: z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(), adminNote: z.string().trim().max(2000).optional() }).strict() }), wrap(async (req, res) => {
  const r = await db.supportRequests.updateOne({ id: req.params.id }, { ...req.body, updatedAt: new Date() });
  if (!r) throw notFound('Request not found.');
  await audit(req, 'support.update', 'support', r.id, req.body);
  res.json({ request: r });
}));

// ------------------------------------------------------------------ settings, integrations, audit
const money = z.number().int().min(0).max(100_000_000);
const settingSchemas = {
  brand: z.object({ name: z.string().trim().min(1).max(60), tagline: z.string().trim().max(120), email: z.string().trim().max(254).refine((v) => v === '' || z.string().email().safeParse(v).success, 'Invalid email'), phone: z.string().trim().max(30), address: z.string().trim().max(300), social: z.object({ instagram: z.string().max(200), facebook: z.string().max(200), youtube: z.string().max(200), x: z.string().max(200) }).strict() }).strict(),
  announcement: z.string().trim().max(200),
  tax: z.object({ enabled: z.boolean(), ratePercent: z.number().min(0).max(40), inclusive: z.boolean(), label: z.string().trim().min(1).max(20) }).strict(),
  delivery: z.record(z.string().regex(/^[a-z][a-z0-9_]{1,19}$/), z.object({ label: z.string().trim().min(1).max(60), feeMinor: money, freeAboveMinor: money.nullable(), etaDays: z.string().trim().max(20) }).strict()).refine((d) => Object.keys(d).length >= 1 && 'standard' in d, 'A "standard" delivery method is required'),
  giftWrap: z.object({ enabled: z.boolean(), feeMinor: money }).strict(),
  policies: z.object({ returnWindowDays: z.number().int().min(0).max(60), cancelUntilStatus: z.enum(['PROCESSING', 'PACKED']), warrantyNote: z.string().trim().max(1000) }).strict(),
  loyalty: z.object({ enabled: z.boolean(), pointsPerHundredRupees: z.number().min(0).max(100) }).strict(),
  payments: z.object({ razorpayEnabled: z.boolean(), codEnabled: z.boolean() }).strict(),
  homepage: z.object({ sections: z.array(z.string().max(30)).max(30) }).strict(),
};

adminManageRouter.get('/settings', requirePermission('settings.manage'), wrap(async (_req, res) => res.json({ settings: await getSettings({ fresh: true }), keys: Object.keys(settingSchemas) })));
adminManageRouter.put('/settings/:key', requirePermission('settings.manage'), wrap(async (req, res) => {
  const schema = settingSchemas[req.params.key];
  if (!schema) throw notFound('Unknown setting.');
  const parsed = schema.safeParse(req.body?.value);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  const before = await db.siteSettings.findOne({ key: req.params.key });
  await db.siteSettings.updateOne({ key: req.params.key }, { $set: { value: parsed.data, updatedAt: new Date() } }, { upsert: true });
  clearSettingsCache();
  await audit(req, 'settings.update', 'setting', req.params.key, { before: before?.value ?? DEFAULT_SETTINGS[req.params.key], after: parsed.data });
  res.json({ ok: true });
}));

adminManageRouter.get('/integrations', requirePermission('settings.manage'), wrap(async (_req, res) => {
  let database = 'ok';
  try { await ping(); } catch { database = 'error'; }
  res.json({
    database,
    razorpay: { configured: config.razorpay.enabled, webhookSecretSet: Boolean(config.razorpay.webhookSecret), webhookUrl: '/api/payments/webhook' },
    email: { configured: emailConfigured() },
    storage: { type: 'local-disk', path: 'uploads/', note: 'Use object storage (S3-compatible) behind a CDN for production scale.' },
  });
}));

adminManageRouter.get('/audit-logs', requirePermission('audit.read'), validate({ query: z.object({ action: z.string().max(60).optional(), actor: z.string().max(120).optional(), page }) }), wrap(async (req, res) => {
  const where = {};
  // The action filter matches from the start ("product." finds every product action).
  if (req.query.action) where.action = { $regex: `^${contains(req.query.action).$regex}`, $options: 'i' };
  if (req.query.actor) where.actorEmail = contains(req.query.actor);
  const size = 50;
  const [n, rows] = await Promise.all([db.auditLogs.count(where), db.auditLogs.find(where, { sort: { createdAt: -1, _id: -1 }, skip: (req.query.page - 1) * size, limit: size })]);
  res.json({ items: rows, total: n, pages: Math.max(1, Math.ceil(n / size)) });
}));
