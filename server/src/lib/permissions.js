import { db } from '../db/client.js';

/**
 * Effective permission keys for a user. Always computed on the server from the database.
 * SUPER_ADMIN holds every permission; MANAGER holds role defaults plus per-user grants;
 * CUSTOMER holds none (their own-data access is enforced by ownership checks instead).
 */
export async function permissionsFor(user) {
  if (user.role === 'SUPER_ADMIN') {
    return (await db.permissions.find({}, { projection: { key: 1 } })).map((p) => p.key);
  }
  if (user.role !== 'MANAGER') return [];
  const [defaults, granted] = await Promise.all([
    db.rolePermissions.find({ role: 'MANAGER' }),
    db.userPermissions.find({ userId: user.id }),
  ]);
  return [...new Set([...defaults, ...granted].map((p) => p.permissionKey))];
}
