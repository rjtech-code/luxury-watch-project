import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { randomToken, sha256 } from './crypto.js';

const ACCESS_COOKIE = 'lw_at';
const REFRESH_COOKIE = 'lw_rt';

const cookieBase = {
  httpOnly: true,
  secure: config.isProd || config.crossSiteCookies,
  sameSite: config.crossSiteCookies ? 'none' : 'lax',
  path: '/',
};

export const signAccessToken = (user) =>
  jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.accessTtlSeconds, algorithm: 'HS256' });

export const verifyAccessToken = (token) => jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });

export async function issueSession(req, res, user, familyId = crypto.randomUUID()) {
  const refresh = randomToken(48);
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 86400_000);
  await db.refreshTokens.insert({
    userId: user.id,
    tokenHash: sha256(refresh),
    familyId,
    userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
    ip: req.ip ?? null,
    expiresAt,
  });
  res.cookie(ACCESS_COOKIE, signAccessToken(user), { ...cookieBase, maxAge: config.accessTtlSeconds * 1000 });
  res.cookie(REFRESH_COOKIE, refresh, { ...cookieBase, path: '/api/auth', maxAge: config.refreshTtlDays * 86400_000 });
}

export function clearSession(res) {
  res.clearCookie(ACCESS_COOKIE, cookieBase);
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase, path: '/api/auth' });
}

/** Rotates a refresh token. A reused (already revoked) token revokes the whole family. */
export async function rotateRefresh(req, res) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) return null;
  const hash = sha256(raw);
  const row = await db.refreshTokens.findOne({ tokenHash: hash });
  if (!row) return null;
  if (row.revokedAt) {
    await db.refreshTokens.update({ familyId: row.familyId, revokedAt: null }, { revokedAt: new Date() });
    return null;
  }
  if (row.expiresAt < new Date()) return null;
  const user = await db.users.findOne({ id: row.userId });
  if (!user || user.status !== 'ACTIVE') return null;
  // Claim the token atomically so two concurrent refreshes cannot both rotate it.
  const claimed = await db.refreshTokens.updateOne({ id: row.id, revokedAt: null }, { revokedAt: new Date() });
  if (!claimed) return null;
  await issueSession(req, res, user, row.familyId);
  return user;
}

export async function revokeRefresh(req) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) return;
  await db.refreshTokens.update({ tokenHash: sha256(raw) }, { revokedAt: new Date() });
}

export async function revokeAllForUser(userId) {
  await db.refreshTokens.update({ userId, revokedAt: null }, { revokedAt: new Date() });
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
