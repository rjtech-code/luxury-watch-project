import { readFileSync } from 'node:fs';
import { slugify } from './slug.js';

/**
 * Turns the supplied watches.json into normalised rows.
 *
 * Rule: only derive an attribute when the supplied text states it. The JSON has no prices,
 * images, materials, dial colours or straps, so those stay null ("Not specified" in the UI).
 */

// Ordered: first match wins. Matched against the supplied collection "type" text.
const CATEGORY_RULES = [
  [/smart|sensor|connected/, 'Smartwatches'],
  [/dive/, 'Dive Watches'],
  [/chronograph/, 'Chronographs'],
  [/pilot/, 'Pilot Watches'],
  [/travel|dual time/, 'Travel Watches'],
  [/complicated/, 'Grand Complications'],
  [/digital/, 'Digital Watches'],
  [/dress/, 'Dress Watches'],
  [/sport|rugged/, 'Sports Watches'],
  [/jewel/, 'Jewellery Watches'],
];
const DEFAULT_CATEGORY = 'Everyday & Luxury Watches';

export function categoryNameFor(type = '') {
  const t = type.toLowerCase();
  for (const [re, name] of CATEGORY_RULES) if (re.test(t)) return name;
  return DEFAULT_CATEGORY;
}

export const isSmartwatch = (type = '', model = '') => /smart|sensor|connected/i.test(`${type} ${model}`);

/** Women's only when the supplied type explicitly says "ladies". Everything else stays unspecified. */
export const deriveGender = (type = '') => (/ladies/i.test(type) ? 'WOMEN' : null);

export function deriveMovement(type = '', model = '') {
  const text = `${type} ${model}`.toLowerCase();
  if (isSmartwatch(type, model)) return 'SMART';
  if (/quartz/.test(text)) return 'QUARTZ';
  if (/solar|light-powered/.test(text)) return 'SOLAR';
  if (/automatic/.test(text)) return 'AUTOMATIC';
  return null;
}

/** "Datejust 36", "Constellation 41 mm", "Chronomat B01 42" -> 36 / 41 / 42. Range-limited to wrist sizes. */
export function deriveDiameterMm(model = '') {
  for (const m of model.matchAll(/(?<![\d.])(\d{2})(?:\s?mm)?(?![\d.])/gi)) {
    const n = Number(m[1]);
    if (n >= 28 && n <= 46) return n;
  }
  return null;
}

/** Only an explicit "300M" in the supplied model name. */
export function deriveWaterResistanceM(model = '') {
  const m = model.match(/(?<![\w])(\d{2,4})\s?M(?![\w])/);
  return m ? Number(m[1]) : null;
}

export function loadCatalogueFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function validateCatalogue(json) {
  const errors = [];
  if (!json || !Array.isArray(json.companies)) return ['"companies" must be an array'];
  const seen = new Set();
  for (const c of json.companies) {
    if (!c.name) errors.push('A company is missing "name"');
    if (!Array.isArray(c.collections)) errors.push(`${c.name}: "collections" must be an array`);
    for (const col of c.collections ?? []) {
      if (!col.collection) errors.push(`${c.name}: a collection is missing "collection"`);
      for (const model of col.models ?? []) {
        const key = `${slugify(c.name)}/${slugify(model)}`;
        if (seen.has(key)) errors.push(`Duplicate model: ${c.name} ${model}`);
        seen.add(key);
      }
    }
  }
  return errors;
}

export function buildCatalogue(json) {
  const categories = new Map();
  const brands = [];
  const collections = [];
  const products = [];

  json.companies.forEach((c, bi) => {
    const brandSlug = slugify(c.name);
    brands.push({
      name: c.name,
      slug: brandSlug,
      country: c.country ?? null,
      founded: c.founded ?? null,
      parentCompany: c.parent ?? null,
      segment: c.segment ?? null,
      sortOrder: bi,
    });

    c.collections.forEach((col, ci) => {
      const catName = categoryNameFor(col.type);
      if (!categories.has(catName)) categories.set(catName, { name: catName, slug: slugify(catName), sortOrder: categories.size });
      const collectionSlug = `${brandSlug}-${slugify(col.collection)}`;
      collections.push({
        brandSlug,
        categorySlug: slugify(catName),
        name: col.collection,
        slug: collectionSlug,
        typeLabel: col.type ?? null,
        sortOrder: ci,
      });

      for (const model of col.models ?? []) {
        const slug = `${brandSlug}-${slugify(model)}`;
        products.push({
          brandSlug,
          collectionSlug,
          categorySlug: slugify(catName),
          name: model,
          slug,
          sku: slug.toUpperCase().slice(0, 48),
          gender: deriveGender(col.type),
          movement: deriveMovement(col.type, model),
          isSmartwatch: isSmartwatch(col.type, model),
          caseDiameterMm: deriveDiameterMm(model),
          waterResistanceM: deriveWaterResistanceM(model),
        });
      }
    });
  });

  return { brands, categories: [...categories.values()], collections, products };
}
