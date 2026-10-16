import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}. See server/.env.example.`);
  return v;
}

const jwtSecret = process.env.JWT_SECRET ?? (isProd ? required('JWT_SECRET') : '');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters.');
}

export const config = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  /** Only when the website and API are on different domains (not recommended): cookies must then be SameSite=None. */
  crossSiteCookies: process.env.CROSS_SITE_COOKIES === 'true',
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  siteUrl: (process.env.SITE_URL ?? process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, ''),
  jwtSecret,
  accessTtlSeconds: 15 * 60,
  refreshTtlDays: 30,
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
    get enabled() {
      return Boolean(this.keyId && this.keySecret);
    },
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? '',
  },
};
