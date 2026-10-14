import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { config } from '../config.js';
import { safeEqual } from '../lib/crypto.js';
import { HttpError } from '../lib/errors.js';

let client = null;

export function razorpayClient() {
  if (!config.razorpay.enabled) {
    throw new HttpError(503, 'Online payments are not configured yet.', 'PAYMENTS_NOT_CONFIGURED');
  }
  client ??= new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
  return client;
}

const hmac = (secret, payload) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

/** Checkout callback signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!config.razorpay.keySecret || !orderId || !paymentId || !signature) return false;
  return safeEqual(hmac(config.razorpay.keySecret, `${orderId}|${paymentId}`), signature);
}

/** Webhook signature: HMAC-SHA256 of the RAW request body with the webhook secret. */
export function verifyWebhookSignature(rawBody, signature) {
  if (!config.razorpay.webhookSecret || !signature) return false;
  return safeEqual(hmac(config.razorpay.webhookSecret, rawBody), signature);
}
