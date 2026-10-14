import { db } from '../db/client.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { permissionsFor } from '../lib/permissions.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../lib/session.js';

/**
 * Attaches req.user when a valid access cookie is present. The role, status and permissions are
 * ALWAYS re-read from the database, never from the token, so a demoted or suspended account loses
 * access on its very next request.
 */
export async function loadUser(req, _res, next) {
  try {
    const token = req.cookies?.[ACCESS_COOKIE];
    if (!token) return next();
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return next(); // expired/invalid: treated as signed out (client will call /auth/refresh)
    }
    const user = await db.users.findOne({ id: payload.sub });
    if (!user || user.status !== 'ACTIVE') return next();
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** Requires the signed-in user to hold at least one of the listed permission keys. */
export const requirePermission =
  (...keys) =>
  async (req, _res, next) => {
    try {
      if (!req.user) return next(unauthorized());
      req.permissions ??= await permissionsFor(req.user);
      if (!keys.some((k) => req.permissions.includes(k))) return next(forbidden());
      next();
    } catch (err) {
      next(err);
    }
  };

/**
 * CSRF defence for cookie auth: SameSite=Lax cookies plus a mandatory custom header on every
 * state-changing request. Browsers will not attach custom headers cross-site without a CORS
 * preflight, which the CORS policy only allows from our own web origin.
 */
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/payments/webhook')) return next(); // authenticated by HMAC signature instead
  if (req.get('x-lw-csrf') !== '1') return next(forbidden('Missing CSRF header.'));
  next();
}
