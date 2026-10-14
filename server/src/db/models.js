/**
 * MongoDB collections, the default values each new document gets, and their indexes.
 * This replaces the SQL schema: field names and meanings are unchanged.
 *
 * Conventions
 *  - Every document has a string `id` (UUID) unless it is keyed by a natural key (noted below). Mongo's own
 *    `_id` is never read by the app.
 *  - Money is an integer count of paise. null means "not set" (e.g. price on request).
 *  - Unique indexes play the role of the old primary keys and unique constraints.
 *
 * Allowed values (validated by the API with zod):
 *   role CUSTOMER | MANAGER | SUPER_ADMIN            user status ACTIVE | SUSPENDED
 *   gender MEN | WOMEN | UNISEX                       movement AUTOMATIC | MECHANICAL | QUARTZ | SOLAR | SMART
 *   product status DRAFT | ACTIVE | ARCHIVED          coupon type PERCENT | FIXED
 *   order status PENDING_PAYMENT | PROCESSING | PACKED | SHIPPED | OUT_FOR_DELIVERY | DELIVERED | CANCELLED | RETURN_REQUESTED | RETURNED
 *   payment status PENDING | PAID | FAILED | REFUNDED | PARTIALLY_REFUNDED
 *   review status PENDING | APPROVED | REJECTED       return status REQUESTED | APPROVED | REJECTED | RECEIVED | REFUNDED
 *   support type CONTACT | WARRANTY | SERVICE | ORDER_HELP;  support status OPEN | IN_PROGRESS | RESOLVED | CLOSED
 *   article status DRAFT | PUBLISHED
 */

const now = () => new Date();
const created = () => ({ createdAt: now() });
const stamped = () => ({ createdAt: now(), updatedAt: now() });

const uniq = (key) => ({ key, unique: true });
const sparseUniq = (field) => ({ key: { [field]: 1 }, unique: true, partialFilterExpression: { [field]: { $type: 'string' } } });

export const MODELS = {
  // ---------------------------------------------------------------- auth
  users: {
    name: 'users',
    defaults: () => ({ phone: null, role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: null, loyaltyPoints: 0, notificationPrefs: { orderUpdates: true, offers: false, restock: true }, failedLoginCount: 0, lockedUntil: null, ...stamped() }),
    indexes: [uniq({ email: 1 }), { key: { role: 1 } }, { key: { createdAt: -1 } }],
  },
  /** Keyed by `key`, e.g. "orders.update". */
  permissions: { name: 'permissions', hasId: false, indexes: [uniq({ key: 1 })] },
  /** Default permissions granted to a role. SUPER_ADMIN is implicitly granted everything. */
  rolePermissions: { name: 'role_permissions', hasId: false, indexes: [uniq({ role: 1, permissionKey: 1 })] },
  /** Per-user grants for MANAGER accounts, assigned by a SUPER_ADMIN. */
  userPermissions: { name: 'user_permissions', hasId: false, indexes: [uniq({ userId: 1, permissionKey: 1 })] },
  refreshTokens: {
    name: 'refresh_tokens',
    defaults: () => ({ userAgent: null, ip: null, revokedAt: null, ...created() }),
    indexes: [uniq({ tokenHash: 1 }), { key: { userId: 1 } }, { key: { familyId: 1 } }],
  },
  emailTokens: {
    name: 'email_tokens',
    defaults: () => ({ usedAt: null, ...created() }),
    indexes: [uniq({ tokenHash: 1 }), { key: { userId: 1 } }],
  },
  addresses: {
    name: 'addresses',
    defaults: () => ({ label: null, line2: null, country: 'IN', isDefault: false, ...created() }),
    indexes: [{ key: { userId: 1 } }],
  },
  auditLogs: {
    name: 'audit_logs',
    defaults: () => ({ actorId: null, actorEmail: null, entity: null, entityId: null, meta: null, ip: null, ...created() }),
    indexes: [{ key: { createdAt: -1 } }, { key: { actorId: 1 } }, { key: { action: 1 } }],
  },

  // ---------------------------------------------------------------- catalogue
  brands: {
    name: 'brands',
    defaults: () => ({ country: null, founded: null, parentCompany: null, segment: null, introduction: null, history: null, logoUrl: null, heroImageUrl: null, sortOrder: 0, isActive: true, ...stamped() }),
    indexes: [uniq({ id: 1 }), uniq({ slug: 1 })],
  },
  categories: {
    name: 'categories',
    defaults: () => ({ description: null, imageUrl: null, sortOrder: 0 }),
    indexes: [uniq({ id: 1 }), uniq({ slug: 1 })],
  },
  collections: {
    name: 'collections',
    defaults: () => ({ categoryId: null, typeLabel: null, description: null, imageUrl: null, isFeatured: false, sortOrder: 0 }),
    indexes: [uniq({ id: 1 }), uniq({ slug: 1 }), { key: { brandId: 1 } }],
  },
  products: {
    name: 'products',
    defaults: () => ({
      collectionId: null, categoryId: null, description: null, status: 'ACTIVE',
      priceMinor: null, compareAtMinor: null, currency: 'INR',
      gender: null, movement: null, isSmartwatch: false, caseMaterial: null, caseDiameterMm: null, dialColor: null, strapMaterial: null,
      waterResistanceM: null, occasions: [], specs: {}, warrantyInfo: null,
      modelUrl: null, isFeatured: false, isLimitedEdition: false, popularity: 0, ratingAvg: null, ratingCount: 0,
      isDemoData: false, releasedAt: now(), ...stamped(),
    }),
    indexes: [uniq({ id: 1 }), uniq({ slug: 1 }), { key: { brandId: 1 } }, { key: { collectionId: 1 } }, { key: { categoryId: 1 } }, { key: { status: 1 } }, { key: { priceMinor: 1 } }, { key: { popularity: -1 } }],
  },
  productImages: { name: 'product_images', defaults: () => ({ alt: null, sortOrder: 0 }), indexes: [{ key: { productId: 1, sortOrder: 1 } }] },
  productVariants: {
    name: 'product_variants',
    defaults: () => ({ label: 'Standard', attributes: {}, priceMinor: null, isDefault: false, isActive: true }),
    indexes: [uniq({ id: 1 }), uniq({ sku: 1 }), { key: { productId: 1 } }],
  },
  /** One per variant, keyed by `variantId`. available = onHand - reserved. */
  inventory: {
    name: 'inventory',
    hasId: false,
    defaults: () => ({ onHand: 0, reserved: 0, lowStockThreshold: 2, updatedAt: now() }),
    indexes: [uniq({ variantId: 1 })],
  },

  // ---------------------------------------------------------------- commerce
  carts: {
    name: 'carts',
    defaults: () => ({ userId: null, guestTokenHash: null, couponCode: null, ...stamped() }),
    indexes: [sparseUniq('userId'), sparseUniq('guestTokenHash')],
  },
  /** Keyed by (cartId, variantId). */
  cartItems: { name: 'cart_items', hasId: false, defaults: () => ({ addedAt: now() }), indexes: [uniq({ cartId: 1, variantId: 1 })] },
  /** Keyed by (userId, productId). */
  wishlistItems: { name: 'wishlist_items', hasId: false, defaults: () => ({ addedAt: now() }), indexes: [uniq({ userId: 1, productId: 1 })] },
  coupons: {
    name: 'coupons',
    defaults: () => ({ description: null, minSubtotalMinor: 0, maxDiscountMinor: null, startsAt: null, endsAt: null, usageLimit: null, perUserLimit: null, usedCount: 0, isActive: true, ...created() }),
    indexes: [uniq({ code: 1 })],
  },
  orders: {
    name: 'orders',
    defaults: () => ({
      userId: null, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING',
      discountMinor: 0, shippingMinor: 0, giftWrapMinor: 0, taxMinor: 0, refundedMinor: 0, currency: 'INR',
      couponCode: null, isGift: false, giftMessage: null, notes: null, idempotencyKey: null, loyaltyPointsEarned: 0,
      placedAt: now(), cancelledAt: null, deliveredAt: null, updatedAt: now(),
    }),
    indexes: [uniq({ id: 1 }), uniq({ orderNumber: 1 }), sparseUniq('idempotencyKey'), { key: { userId: 1 } }, { key: { status: 1 } }, { key: { placedAt: -1 } }, { key: { contactEmail: 1 } }],
  },
  orderItems: { name: 'order_items', defaults: () => ({ productId: null, variantId: null, imageUrl: null }), indexes: [{ key: { orderId: 1 } }, { key: { productId: 1 } }] },
  orderStatusHistory: { name: 'order_status_history', defaults: () => ({ note: null, actorId: null, ...created() }), indexes: [{ key: { orderId: 1, createdAt: 1 } }] },
  payments: {
    name: 'payments',
    defaults: () => ({ providerOrderId: null, providerPaymentId: null, status: 'PENDING', method: null, failureReason: null, ...stamped() }),
    indexes: [{ key: { orderId: 1 } }, sparseUniq('providerOrderId'), sparseUniq('providerPaymentId')],
  },
  /** One per processed webhook event, keyed by `eventId`, so replays are no-ops. */
  paymentEvents: { name: 'payment_events', hasId: false, defaults: () => ({ receivedAt: now() }), indexes: [uniq({ eventId: 1 })] },
  shipments: { name: 'shipments', defaults: () => ({ carrier: null, trackingNumber: null, trackingUrl: null, estimatedDeliveryAt: null, shippedAt: null, deliveredAt: null }), indexes: [{ key: { orderId: 1 } }] },
  returns: { name: 'returns', defaults: () => ({ status: 'REQUESTED', refundMinor: 0, adminNote: null, resolvedAt: null, ...created() }), indexes: [{ key: { orderId: 1 } }, { key: { status: 1 } }] },
  loyaltyLedger: { name: 'loyalty_ledger', defaults: () => ({ orderId: null, ...created() }), indexes: [{ key: { userId: 1 } }] },

  // ---------------------------------------------------------------- content
  reviews: {
    name: 'reviews',
    defaults: () => ({ title: null, status: 'PENDING', verifiedPurchase: false, ...created() }),
    indexes: [uniq({ userId: 1, productId: 1 }), { key: { productId: 1, status: 1 } }],
  },
  notifications: { name: 'notifications', defaults: () => ({ body: null, href: null, readAt: null, ...created() }), indexes: [{ key: { userId: 1, createdAt: -1 } }] },
  /** Contact, warranty-registration, service/repair and order-help requests. */
  supportRequests: {
    name: 'support_requests',
    defaults: () => ({ type: 'CONTACT', status: 'OPEN', userId: null, orderId: null, phone: null, data: null, adminNote: null, ...stamped() }),
    indexes: [uniq({ reference: 1 }), { key: { userId: 1 } }, { key: { status: 1 } }],
  },
  restockSubscriptions: { name: 'restock_subscriptions', defaults: () => ({ notifiedAt: null, ...created() }), indexes: [uniq({ productId: 1, email: 1 })] },
  newsletterSubscribers: { name: 'newsletter_subscribers', defaults: () => ({ confirmedAt: null, unsubscribedAt: null, ...created() }), indexes: [uniq({ email: 1 })] },
  banners: {
    name: 'banners',
    defaults: () => ({ subtitle: null, imageUrl: null, ctaLabel: null, ctaHref: null, isActive: true, sortOrder: 0, startsAt: null, endsAt: null }),
    indexes: [{ key: { placement: 1, isActive: 1 } }],
  },
  articles: {
    name: 'articles',
    defaults: () => ({ excerpt: null, coverUrl: null, category: null, status: 'DRAFT', publishedAt: null, ...created() }),
    indexes: [uniq({ slug: 1 })],
  },
  /** Key/value site configuration, keyed by `key`. */
  siteSettings: { name: 'site_settings', hasId: false, defaults: () => ({ updatedAt: now() }), indexes: [uniq({ key: 1 })] },
};
