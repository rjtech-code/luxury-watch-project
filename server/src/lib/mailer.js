import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport = null;
function getTransport() {
  if (!config.smtp.host) return null;
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transport;
}

export const emailConfigured = () => Boolean(config.smtp.host && config.smtp.from);

/**
 * Sends an email. When SMTP is not configured the message is logged instead and the function
 * reports { sent: false } so callers never pretend an email went out.
 */
export async function sendMail({ to, subject, text }) {
  const t = getTransport();
  if (!t || !config.smtp.from) {
    if (!config.isTest) console.log(`[mail:not-configured] to=${to} subject="${subject}"\n${text}\n`);
    return { sent: false };
  }
  await t.sendMail({ from: config.smtp.from, to, subject, text });
  return { sent: true };
}
