import { describe, expect, it } from 'vitest';
import { PASSWORD, app, client, createUser, db, loginAs, uniq } from './helpers.js';
import request from 'supertest';

describe('sign up', () => {
  it('always creates a CUSTOMER and rejects any attempt to pass a role', async () => {
    const c = client();
    const email = `${uniq('new')}@example.test`;
    const bad = await c.post('/api/auth/signup', { name: 'Eve Attacker', email, password: PASSWORD, role: 'SUPER_ADMIN' });
    expect(bad.status).toBe(400); // strict schema: unknown "role" key is refused outright
    const ok = await c.post('/api/auth/signup', { name: 'Normal Person', email, password: PASSWORD });
    expect(ok.status).toBe(201);
    expect(ok.body.user.role).toBe('CUSTOMER');
    const row = await db.users.findOne({ email });
    expect(row.role).toBe('CUSTOMER');
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(ok.body)).not.toContain(row.passwordHash);
  });

  it('enforces password strength and blocks duplicate emails', async () => {
    const c = client();
    const email = `${uniq('dup')}@example.test`;
    expect((await c.post('/api/auth/signup', { name: 'Weak One', email, password: 'short' })).status).toBe(400);
    expect((await c.post('/api/auth/signup', { name: 'First One', email, password: PASSWORD })).status).toBe(201);
    expect((await client().post('/api/auth/signup', { name: 'Second One', email: email.toUpperCase(), password: PASSWORD })).status).toBe(409);
  });
});

describe('login', () => {
  it('gives the same error for unknown email and wrong password', async () => {
    const u = await createUser();
    const wrongPw = await client().post('/api/auth/login', { email: u.email, password: 'Wrong-Password-1' });
    const noUser = await client().post('/api/auth/login', { email: 'nobody@example.test', password: 'Wrong-Password-1' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.error.message).toBe(noUser.body.error.message);
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    const u = await createUser();
    const c = client();
    for (let i = 0; i < 8; i++) await c.post('/api/auth/login', { email: u.email, password: 'Wrong-Password-1' });
    const res = await c.post('/api/auth/login', { email: u.email, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/Too many failed attempts/);
  });

  it('sets httpOnly cookies and never returns tokens in the body', async () => {
    const u = await createUser();
    const res = await client().post('/api/auth/login', { email: u.email, password: PASSWORD });
    const cookies = res.headers['set-cookie'].join(';');
    expect(cookies).toMatch(/lw_at=.*HttpOnly/i);
    expect(cookies).toMatch(/lw_rt=.*HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
  });

  it('rotates refresh tokens and revokes the whole family if an old one is replayed', async () => {
    const u = await createUser();
    const raw = request.agent(app);
    const login = await raw.post('/api/auth/login').set('x-lw-csrf', '1').send({ email: u.email, password: PASSWORD });
    const oldRefresh = login.headers['set-cookie'].find((c) => c.startsWith('lw_rt=')).split(';')[0];
    const first = await raw.post('/api/auth/refresh').set('x-lw-csrf', '1');
    expect(first.status).toBe(200);
    const replay = await request(app).post('/api/auth/refresh').set('x-lw-csrf', '1').set('Cookie', oldRefresh);
    expect(replay.status).toBe(401);
    const afterReplay = await raw.post('/api/auth/refresh').set('x-lw-csrf', '1');
    expect(afterReplay.status).toBe(401); // the rotated token was in the same family and is now revoked too
  });
});

describe('CSRF guard', () => {
  it('rejects state-changing requests that lack the custom header', async () => {
    const u = await createUser();
    const res = await request(app).post('/api/auth/login').send({ email: u.email, password: PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe('role enforcement happens on the server', () => {
  it('anonymous users get 401, customers get 403 on staff APIs', async () => {
    expect((await client().get('/api/admin/dashboard')).status).toBe(401);
    const customer = await loginAs('CUSTOMER');
    for (const url of ['/api/admin/dashboard', '/api/admin/orders', '/api/admin/users', '/api/admin/audit-logs', '/api/admin/settings']) {
      expect((await customer.get(url)).status).toBe(403);
    }
  });

  it('a manager sees sales data but not user management, settings or audit logs', async () => {
    const m = await loginAs('MANAGER');
    expect((await m.get('/api/admin/dashboard')).status).toBe(200);
    expect((await m.get('/api/admin/orders')).status).toBe(200);
    expect((await m.get('/api/admin/users')).status).toBe(403);
    expect((await m.get('/api/admin/settings')).status).toBe(403);
    expect((await m.get('/api/admin/audit-logs')).status).toBe(403);
    expect((await m.post('/api/admin/products', {})).status).toBe(403);
  });

  it('a super admin can reach everything', async () => {
    const a = await loginAs('SUPER_ADMIN');
    for (const url of ['/api/admin/dashboard', '/api/admin/users', '/api/admin/settings', '/api/admin/audit-logs', '/api/admin/integrations', '/api/admin/coupons']) {
      expect((await a.get(url)).status).toBe(200);
    }
  });

  it('permissions granted to one manager do not leak to another', async () => {
    const a = await loginAs('SUPER_ADMIN');
    const m1 = await loginAs('MANAGER');
    const m2 = await loginAs('MANAGER');
    expect((await m1.get('/api/admin/coupons')).status).toBe(403);
    const grant = await a.put(`/api/admin/users/${m1.user.id}/permissions`, { keys: ['coupons.manage'] });
    expect(grant.status).toBe(200);
    expect((await m1.get('/api/admin/coupons')).status).toBe(200);
    expect((await m2.get('/api/admin/coupons')).status).toBe(403);
  });

  it('a suspended account loses access on its very next request', async () => {
    const m = await loginAs('MANAGER');
    expect((await m.get('/api/admin/dashboard')).status).toBe(200);
    await db.users.update({ id: m.user.id }, { status: 'SUSPENDED' });
    expect((await m.get('/api/admin/dashboard')).status).toBe(401);
  });

  it('a demoted manager loses staff access immediately even though their cookie is still valid', async () => {
    const m = await loginAs('MANAGER');
    await db.users.update({ id: m.user.id }, { role: 'CUSTOMER' });
    expect((await m.get('/api/admin/dashboard')).status).toBe(403);
  });
});

describe('privilege escalation is not possible through the API', () => {
  it('super admin cannot create another super admin or edit one', async () => {
    const a = await loginAs('SUPER_ADMIN');
    const target = await createUser('CUSTOMER');
    const toSuper = await a.patch(`/api/admin/users/${target.id}`, { role: 'SUPER_ADMIN' });
    expect(toSuper.status).toBe(400);
    const other = await createUser('SUPER_ADMIN');
    expect((await a.patch(`/api/admin/users/${other.id}`, { status: 'SUSPENDED' })).status).toBe(403);
    expect((await a.patch(`/api/admin/users/${a.user.id}`, { role: 'CUSTOMER' })).status).toBe(403);
  });

  it('a manager cannot promote anyone', async () => {
    const m = await loginAs('MANAGER');
    const target = await createUser('CUSTOMER');
    expect((await m.patch(`/api/admin/users/${target.id}`, { role: 'MANAGER' })).status).toBe(403);
  });

  it('a customer cannot change their own role through the profile endpoint', async () => {
    const c = await loginAs('CUSTOMER');
    expect((await c.patch('/api/account/profile', { role: 'SUPER_ADMIN' })).status).toBe(400);
    const row = await db.users.findOne({ id: c.user.id });
    expect(row.role).toBe('CUSTOMER');
  });
});

describe('administrative actions are audited', () => {
  it('records who changed a price and what changed', async () => {
    const a = await loginAs('SUPER_ADMIN');
    const list = await a.get('/api/admin/products?q=Submariner%20Date');
    const id = list.body.items[0].id;
    const detail = await a.get(`/api/admin/products/${id}`);
    const p = detail.body.product;
    const body = { name: p.name, brandId: p.brandId, collectionId: p.collectionId, categoryId: p.categoryId, status: 'ACTIVE', priceMinor: 12_345_00, isSmartwatch: false, occasions: [], specs: {}, images: [] };
    const res = await a.put(`/api/admin/products/${id}`, body);
    expect(res.status).toBe(200);
    const logs = await a.get('/api/admin/audit-logs?action=product.update');
    const mine = logs.body.items.find((l) => l.entityId === id && l.actorEmail === a.user.email);
    expect(mine).toBeTruthy();
    expect(mine.meta.priceAfter).toBe(12_345_00);
  });
});
