import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import { hashPassword } from '../src/lib/password.js';
import { clearSettingsCache } from '../src/services/settings.js';

export const app = createApp();
export const PASSWORD = 'Str0ngPassw0rd!';

/** A cookie-keeping client that always sends the CSRF header on writes, like our web app does. */
export function client() {
  const agent = request.agent(app);
  const wrap = (m) => (url, body) => {
    const r = agent[m](url).set('x-lw-csrf', '1');
    return body === undefined ? r : r.send(body);
  };
  return { agent, get: (u) => agent.get(u), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), del: wrap('delete') };
}

let counter = 0;
export const uniq = (p = 'u') => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function createUser(role = 'CUSTOMER', overrides = {}) {
  const email = `${uniq(role.toLowerCase())}@example.test`;
  return db.users.insert({ email, name: 'Test User', passwordHash: await hashPassword(PASSWORD), role, emailVerifiedAt: new Date(), ...overrides });
}

export async function loginAs(role = 'CUSTOMER', overrides = {}) {
  const user = await createUser(role, overrides);
  const c = client();
  const res = await c.post('/api/auth/login', { email: user.email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...c, user };
}

/** Gives a seeded product a price and stock so it can be bought in a test. Returns ids. */
export async function makeBuyable(slug, { priceMinor = 10_000_00, stock = 5 } = {}) {
  const p = await db.products.updateOne({ slug }, { priceMinor, status: 'ACTIVE' });
  const v = await db.productVariants.findOne({ productId: p.id });
  await db.inventory.update({ variantId: v.id }, { onHand: stock, reserved: 0 });
  return { productId: p.id, variantId: v.id, slug };
}

export const stockOf = (variantId) => db.inventory.findOne({ variantId });

export async function setSetting(key, value) {
  await db.siteSettings.updateOne({ key }, { $set: { value } }, { upsert: true });
  clearSettingsCache();
}

export const ADDRESS = { fullName: 'Asha Verma', phone: '9876543210', line1: '12 Lake Road', city: 'Jaipur', state: 'Rajasthan', postalCode: '302001', country: 'IN' };
export const checkoutBody = (over = {}) => ({ contactEmail: `${uniq('buyer')}@example.test`, contactPhone: '9876543210', shippingAddress: ADDRESS, deliveryMethod: 'standard', paymentMethod: 'cod', isGift: false, ...over });

export const signWebhook = (rawBody) => crypto.createHmac('sha256', 'whsec_test').update(rawBody).digest('hex');
export { db };
