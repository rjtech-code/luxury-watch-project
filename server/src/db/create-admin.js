/**
 * Creates (or promotes) the first SUPER_ADMIN. This is the ONLY way to get that role:
 * the public sign-up endpoint can only ever create CUSTOMER accounts.
 *
 *   ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='...' ADMIN_NAME='Owner' npm run admin:create
 */
import { closeDb, db } from './client.js';
import { hashPassword, passwordProblem } from '../lib/password.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || 'Administrator';

if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (and optionally ADMIN_NAME).');
  process.exit(1);
}
const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const existing = await db.users.findOne({ email });

if (existing) {
  await db.users.update({ id: existing.id }, { role: 'SUPER_ADMIN', status: 'ACTIVE', passwordHash, emailVerifiedAt: new Date(), updatedAt: new Date() });
  console.log(`Updated existing user ${email} to SUPER_ADMIN.`);
} else {
  await db.users.insert({ email, name, passwordHash, role: 'SUPER_ADMIN', emailVerifiedAt: new Date() });
  console.log(`Created SUPER_ADMIN ${email}.`);
}
await db.auditLogs.insert({ actorEmail: 'cli', action: 'admin.bootstrap', entity: 'user', entityId: email });
await closeDb();
