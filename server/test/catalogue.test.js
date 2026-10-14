import { describe, expect, it } from 'vitest';
import { buildCatalogue, categoryNameFor, deriveDiameterMm, deriveGender, deriveMovement, deriveWaterResistanceM, loadCatalogueFile, validateCatalogue } from '../src/lib/catalogue.js';
import { slugify } from '../src/lib/slug.js';

const json = loadCatalogueFile(new URL('../data/watches.json', import.meta.url).pathname);

describe('supplied catalogue', () => {
  it('is valid and has no duplicate models', () => expect(validateCatalogue(json)).toEqual([]));
  it('imports every brand, collection and model exactly once', () => {
    const c = buildCatalogue(json);
    expect(c.brands).toHaveLength(json.companies.length);
    expect(c.collections).toHaveLength(json.companies.reduce((n, b) => n + b.collections.length, 0));
    expect(c.products).toHaveLength(json.companies.flatMap((b) => b.collections.flatMap((x) => x.models)).length);
    expect(new Set(c.products.map((p) => p.slug)).size).toBe(c.products.length);
  });
  it('never invents prices, materials, colours or straps', () => {
    for (const p of buildCatalogue(json).products) {
      expect(p).not.toHaveProperty('priceMinor');
      expect(p).not.toHaveProperty('caseMaterial');
      expect(p).not.toHaveProperty('dialColor');
      expect(p).not.toHaveProperty('strapMaterial');
    }
  });
});

describe('validation catches bad data', () => {
  it('flags duplicates and malformed structure', () => {
    const dup = { companies: [{ name: 'A', collections: [{ collection: 'C', models: ['X', 'X'] }] }] };
    expect(validateCatalogue(dup).join()).toMatch(/Duplicate/);
    expect(validateCatalogue({})).toHaveLength(1);
  });
});

describe('attribute derivation only uses what the supplied text states', () => {
  it('reads case size only from the model name', () => {
    expect(deriveDiameterMm('Datejust 36')).toBe(36);
    expect(deriveDiameterMm('Constellation 41 mm')).toBe(41);
    expect(deriveDiameterMm('Chronomat B01 42')).toBe(42);
    expect(deriveDiameterMm('Submariner Date')).toBeNull();
    expect(deriveDiameterMm('Nautilus 5711')).toBeNull(); // 4-digit reference numbers are not sizes
    expect(deriveDiameterMm('GA-2100 (CasiOak)')).toBeNull();
  });
  it('reads water resistance only from an explicit "300M"', () => {
    expect(deriveWaterResistanceM('Seamaster Diver 300M')).toBe(300);
    expect(deriveWaterResistanceM('Aquaracer Professional 300')).toBeNull();
  });
  it('marks women only when the supplied type says ladies', () => {
    expect(deriveGender('Ladies dress watch')).toBe('WOMEN');
    expect(deriveGender('Rugged ladies watch')).toBe('WOMEN');
    expect(deriveGender('Dress watch')).toBeNull();
  });
  it('derives movement only when stated', () => {
    expect(deriveMovement('Light-powered', 'Eco-Drive Promaster')).toBe('SOLAR');
    expect(deriveMovement('Sports / quartz', 'Formula 1 Quartz')).toBe('QUARTZ');
    expect(deriveMovement('Smartwatch', 'Apple Watch Series 10')).toBe('SMART');
    expect(deriveMovement('Dive watch', 'Submariner Date')).toBeNull();
  });
  it('maps types to categories', () => {
    expect(categoryNameFor('Dive watch')).toBe('Dive Watches');
    expect(categoryNameFor('Pilot chronograph')).toBe('Chronographs');
    expect(categoryNameFor('Smart / sensor watch')).toBe('Smartwatches');
  });
});

describe('slugify', () => {
  it('makes url-safe slugs', () => {
    expect(slugify('Trésor & Co. 41 mm')).toBe('tresor-and-co-41-mm');
    expect(slugify('  --Hello__World--  ')).toBe('hello-world');
  });
});
