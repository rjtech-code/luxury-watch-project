import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit: config.isTest ? 10_000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message } },
  });

export const apiLimiter = make(60_000, 300, 'Too many requests. Please slow down.');
export const authLimiter = make(15 * 60_000, 20, 'Too many attempts. Please try again in a few minutes.');
export const strictLimiter = make(60 * 60_000, 10, 'Too many requests. Please try again later.');
