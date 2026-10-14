import { Router } from 'express';
import { z } from 'zod';
import { db, withTx } from '../db/client.js';
import { config } from '../config.js';
import { badRequest, conflict, unauthorized, wrap } from '../lib/errors.js';
import { hashPassword, passwordProblem, verifyPassword } from '../lib/password.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { sendMail } from '../lib/mailer.js';
import { permissionsFor } from '../lib/permissions.js';
import { clearSession, issueSession, revokeAllForUser, revokeRefresh, rotateRefresh } from '../lib/session.js';
import { authLimiter, strictLimiter } from '../middleware/security.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { mergeGuestCart } from './cart.js';

export const authRouter = Router();

const email = z.string().trim().toLowerCase().email().max(254);
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export const publicUser = async (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  phone: u.phone,
  role: u.role,
  emailVerified: Boolean(u.emailVerifiedAt),
  loyaltyPoints: u.loyaltyPoints,
  permissions: await permissionsFor(u),
});

async function createEmailToken(userId, type, ttlMinutes) {
  const raw = randomToken(32);
  await db.emailTokens.insert({
    userId,
    type,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
  });
  return raw;
}

async function sendVerification(user) {
  const token = await createEmailToken(user.id, 'EMAIL_VERIFY', 60 * 24);
  const link = `${config.webOrigin}/verify-email?token=${token}`;
  return sendMail({ to: user.email, subject: 'Verify your email address', text: `Welcome, ${user.name}.\n\nConfirm your email address:\n${link}\n\nThis link expires in 24 hours.` });
}

// Sign up: ALWAYS creates a CUSTOMER. There is deliberately no role field in this schema.
authRouter.post(
  '/signup',
  authLimiter,
  validate({
    body: z
      .object({
        name: z.string().trim().min(2).max(80),
        email,
        password: z.string().max(128),
        phone: z.string().trim().max(20).optional(),
      })
      .strict(),
  }),
  wrap(async (req, res) => {
    const problem = passwordProblem(req.body.password);
    if (problem) throw badRequest(problem);
    const exists = await db.users.findOne({ email: req.body.email }, { projection: { id: 1 } });
    if (exists) throw conflict('An account with this email already exists.', 'EMAIL_TAKEN');
    const user = await db.users.insert({
      email: req.body.email,
      name: req.body.name,
      phone: req.body.phone ?? null,
      passwordHash: await hashPassword(req.body.password),
      role: 'CUSTOMER',
    });
    const mail = await sendVerification(user);
    await issueSession(req, res, user);
    await mergeGuestCart(req, res, user);
    res.status(201).json({ user: await publicUser(user), verificationEmailSent: mail.sent });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: z.object({ email, password: z.string().min(1).max(128) }).strict() }),
  wrap(async (req, res) => {
    const user = await db.users.findOne({ email: req.body.email });
    const generic = unauthorized('Incorrect email or password.');
    if (!user) {
      await hashPassword(req.body.password); // keep timing similar whether or not the account exists
      throw generic;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw unauthorized('Too many failed attempts. Try again in a few minutes.');
    }
    if (!(await verifyPassword(user.passwordHash, req.body.password))) {
      const failed = user.failedLoginCount + 1;
      await db.users.update({ id: user.id }, failed >= MAX_FAILED ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLoginCount: failed });
      throw generic;
    }
    if (user.status !== 'ACTIVE') throw unauthorized('This account has been suspended. Please contact support.');
    await db.users.update({ id: user.id }, { failedLoginCount: 0, lockedUntil: null });
    await issueSession(req, res, user);
    await mergeGuestCart(req, res, user);
    res.json({ user: await publicUser(user) });
  }),
);

authRouter.post(
  '/refresh',
  wrap(async (req, res) => {
    const user = await rotateRefresh(req, res);
    if (!user) {
      clearSession(res);
      throw unauthorized('Session expired. Please sign in again.');
    }
    res.json({ user: await publicUser(user) });
  }),
);

authRouter.post(
  '/logout',
  wrap(async (req, res) => {
    await revokeRefresh(req);
    clearSession(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  wrap(async (req, res) => {
    res.json({ user: req.user ? await publicUser(req.user) : null });
  }),
);

authRouter.post(
  '/verify-email',
  authLimiter,
  validate({ body: z.object({ token: z.string().min(10).max(200) }).strict() }),
  wrap(async (req, res) => {
    const row = await db.emailTokens.findOne({ tokenHash: sha256(req.body.token), type: 'EMAIL_VERIFY', usedAt: null, expiresAt: { $gt: new Date() } });
    if (!row) throw badRequest('This verification link is invalid or has expired.');
    await withTx(async (session) => {
      await db.emailTokens.update({ id: row.id }, { usedAt: new Date() }, { session });
      await db.users.update({ id: row.userId }, { emailVerifiedAt: new Date() }, { session });
    });
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/resend-verification',
  requireAuth,
  strictLimiter,
  wrap(async (req, res) => {
    if (req.user.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
    const mail = await sendVerification(req.user);
    res.json({ ok: true, emailSent: mail.sent });
  }),
);

// Forgot password: always answers the same way so it cannot be used to discover accounts.
authRouter.post(
  '/forgot-password',
  strictLimiter,
  validate({ body: z.object({ email }).strict() }),
  wrap(async (req, res) => {
    const user = await db.users.findOne({ email: req.body.email });
    if (user && user.status === 'ACTIVE') {
      const token = await createEmailToken(user.id, 'PASSWORD_RESET', 30);
      await sendMail({
        to: user.email,
        subject: 'Reset your password',
        text: `Use this link to choose a new password:\n${config.webOrigin}/reset-password?token=${token}\n\nIt expires in 30 minutes. If you did not request this, ignore this email.`,
      });
    }
    res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
  }),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: z.object({ token: z.string().min(10).max(200), password: z.string().max(128) }).strict() }),
  wrap(async (req, res) => {
    const problem = passwordProblem(req.body.password);
    if (problem) throw badRequest(problem);
    const row = await db.emailTokens.findOne({ tokenHash: sha256(req.body.token), type: 'PASSWORD_RESET', usedAt: null, expiresAt: { $gt: new Date() } });
    if (!row) throw badRequest('This reset link is invalid or has expired.');
    const passwordHash = await hashPassword(req.body.password);
    await withTx(async (session) => {
      // Claim the token so it can only ever be used once, even by two requests at the same moment.
      if (!(await db.emailTokens.updateOne({ id: row.id, usedAt: null }, { usedAt: new Date() }, { session }))) throw badRequest('This reset link is invalid or has expired.');
      await db.users.update({ id: row.userId }, { passwordHash, failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() }, { session });
    });
    await revokeAllForUser(row.userId); // sign out everywhere
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate({ body: z.object({ currentPassword: z.string().max(128), newPassword: z.string().max(128) }).strict() }),
  wrap(async (req, res) => {
    if (!(await verifyPassword(req.user.passwordHash, req.body.currentPassword))) throw badRequest('Current password is incorrect.');
    const problem = passwordProblem(req.body.newPassword);
    if (problem) throw badRequest(problem);
    await db.users.update({ id: req.user.id }, { passwordHash: await hashPassword(req.body.newPassword), updatedAt: new Date() });
    await revokeAllForUser(req.user.id);
    await issueSession(req, res, req.user);
    res.json({ ok: true });
  }),
);
