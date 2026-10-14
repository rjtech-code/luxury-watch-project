/** Permissions, default site settings and starter editorial content. Safe to re-run. */

export const PERMISSIONS = [
  ['products.read', 'View products'],
  ['products.write', 'Create, edit and archive products, brands, collections and categories'],
  ['orders.read', 'View orders'],
  ['orders.update', 'Update order and fulfilment status, handle cancellations and returns'],
  ['sales.read', 'View sales dashboards and analytics'],
  ['reports.export', 'Export sales and inventory reports'],
  ['inventory.read', 'View stock levels and alerts'],
  ['inventory.write', 'Adjust stock'],
  ['reviews.moderate', 'Approve or reject reviews'],
  ['coupons.manage', 'Manage coupons and promotions'],
  ['content.manage', 'Manage banners, homepage, journal and newsletter'],
  ['support.manage', 'Handle support, warranty and service requests'],
  ['users.manage', 'Manage customers, managers and roles'],
  ['settings.manage', 'Manage site settings and integrations'],
  ['audit.read', 'View audit logs'],
];

/** What a MANAGER gets by default. SUPER_ADMIN is implicitly granted everything in code. */
export const MANAGER_DEFAULTS = [
  'products.read',
  'orders.read',
  'orders.update',
  'sales.read',
  'reports.export',
  'inventory.read',
  'support.manage',
];

/**
 * Business rules are configuration, not facts. These are neutral starting values the owner must
 * review (especially tax and shipping) in Admin > Settings before going live.
 */
export const DEFAULT_SETTINGS = {
  brand: {
    name: 'Time Luxe',
    tagline: 'Luxury Watches Redefined',
    // Left blank on purpose: the footer hides any field that is empty. Fill in Admin > Settings.
    email: '',
    phone: '',
    address: '',
    social: { instagram: '', facebook: '', youtube: '', x: '' },
  },
  announcement: 'Free insured shipping across India on every order',
  currency: 'INR',
  tax: { enabled: true, ratePercent: 18, inclusive: true, label: 'GST' },
  delivery: {
    standard: { label: 'Standard insured delivery', feeMinor: 0, freeAboveMinor: 0, etaDays: '3-7' },
    express: { label: 'Express insured delivery', feeMinor: 50000, freeAboveMinor: null, etaDays: '1-3' },
  },
  giftWrap: { enabled: true, feeMinor: 0 },
  policies: { returnWindowDays: 7, cancelUntilStatus: 'PACKED', warrantyNote: '' },
  loyalty: { enabled: false, pointsPerHundredRupees: 1 },
  payments: { razorpayEnabled: true, codEnabled: false },
  homepage: {
    sections: [
      'hero', 'trust', 'categories', 'brands', 'collections', 'bestSellers', 'newArrivals', 'men', 'women',
      'occasions', 'limited', 'showcase3d', 'craft', 'guide', 'journal', 'reviews', 'newsletter',
    ],
  },
};

/** General, brand-neutral buying guidance. No claims about any manufacturer. */
export const STARTER_ARTICLES = [
  {
    slug: 'how-to-choose-your-first-luxury-watch',
    title: 'How to choose your first luxury watch',
    category: 'Buying guide',
    excerpt: 'Start with how you will wear it, then narrow by movement, size and strap.',
    body: `Begin with the occasion. A watch for daily office wear asks for different things than a dive watch or a dress watch reserved for evenings.

Next, consider size. Most wrists look balanced with a case between 36 mm and 42 mm. Measure the flat top of your wrist and compare it to the lug-to-lug length, not only the diameter.

Then choose a movement. Automatic movements wind from the motion of your wrist and are valued for their mechanical craft. Quartz is battery powered, typically more accurate and lower maintenance. Solar and light-powered watches charge from light.

Finally, think about the bracelet or strap. A metal bracelet is durable and dressy or sporty depending on the finish. Leather is classic but less suited to water.`,
  },
  {
    slug: 'automatic-quartz-or-solar',
    title: 'Automatic, quartz or solar: a plain-English guide',
    category: 'Buying guide',
    excerpt: 'What the three common power sources mean for accuracy, upkeep and feel.',
    body: `An automatic watch stores energy in a mainspring that is wound by the movement of a rotor as you wear it. If it is not worn for a while it stops and must be set again.

A quartz watch uses a battery and a vibrating quartz crystal to keep time. It needs a battery change every few years and little else.

A solar or light-powered watch converts light into stored power, so it rarely needs a battery replacement and keeps running if it is left in the dark for a while.

None is better in every way. Choose the one that matches how you want to live with the watch.`,
  },
  {
    slug: 'caring-for-your-watch',
    title: 'Caring for your watch',
    category: 'Care',
    excerpt: 'Simple habits that keep a watch looking and running well.',
    body: `Wipe the case and bracelet with a soft dry cloth after wear. Rinse a water-resistant watch in fresh water after swimming in the sea, and make sure the crown is fully pushed in or screwed down first.

Keep mechanical watches away from strong magnets such as speakers and some bag clasps, which can affect timekeeping.

Follow the service interval recommended by the manufacturer, and keep your warranty paperwork and proof of purchase together.`,
  },
];
