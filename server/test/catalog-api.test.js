import { describe, expect, it } from 'vitest';
import { app } from './helpers.js';
import request from 'supertest';

describe('catalogue API counts', () => {
  it('reports real product counts for brands, collections and categories', async () => {
    const brands = (await request(app).get('/api/catalog/brands')).body.items;
    expect(brands.length).toBeGreaterThan(0);
    expect(brands.reduce((n, b) => n + b.productCount, 0)).toBeGreaterThan(0);
    const cols = (await request(app).get('/api/catalog/collections')).body.items;
    expect(cols.some((c) => c.productCount > 0)).toBe(true);
    const cats = (await request(app).get('/api/catalog/categories')).body.items;
    expect(cats.some((c) => c.productCount > 0)).toBe(true);
  });
});

describe('admin reporting endpoints', () => {
  it('serves dashboard and analytics to a super admin', async () => {
    const { loginAs } = await import('./helpers.js');
    const c = await loginAs('SUPER_ADMIN');
    const dash = await c.get('/api/admin/dashboard');
    expect(dash.status).toBe(200);
    expect(dash.body.kpis).toHaveProperty('netMinor');
    const an = await c.get('/api/admin/analytics');
    expect(an.status).toBe(200);
    expect(an.body.repeatPurchase).toHaveProperty('buyers');
  });
});
