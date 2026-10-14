export const NAV = [
  { label: 'Home', to: '/' },
  { label: 'Shop All Watches', to: '/shop' },
  { label: 'Brands', to: '/brands', mega: 'brands' },
  { label: 'Collections', to: '/collections', mega: 'collections' },
  { label: "Men's Watches", to: '/mens-watches' },
  { label: "Women's Watches", to: '/womens-watches' },
  { label: 'Smart Watches', to: '/smart-watches' },
  { label: 'Occasion', to: '/occasion', mega: 'occasion' },
  { label: 'New Arrivals', to: '/new-arrivals' },
  { label: 'Best Sellers', to: '/best-sellers' },
  { label: 'Limited Editions', to: '/limited-editions' },
];
export const UTILITY = [
  { label: 'Journal', to: '/journal' },
  { label: 'About Us', to: '/about' },
  { label: 'Contact', to: '/contact' },
];

/**
 * Occasions are an editorial grouping of watch categories (the supplied catalogue has no per-model
 * occasion data). A product can also carry its own "occasions" tags in the admin, which the filter honours.
 */
export const OCCASIONS = [
  { key: 'formal', label: 'Formal evenings', blurb: 'Dress watches, grand complications and jewellery watches.', categories: ['dress-watches', 'grand-complications', 'jewellery-watches'] },
  { key: 'business', label: 'Business', blurb: 'Understated dress and everyday watches for the working week.', categories: ['dress-watches', 'everyday-and-luxury-watches'] },
  { key: 'sport', label: 'Sport and adventure', blurb: 'Sports watches, dive watches and chronographs built for activity.', categories: ['sports-watches', 'dive-watches', 'chronographs', 'digital-watches'] },
  { key: 'travel', label: 'Travel', blurb: 'Travel and pilot watches for time on the move.', categories: ['travel-watches', 'pilot-watches'] },
  { key: 'everyday', label: 'Everyday wear', blurb: 'Watches comfortable enough to wear every day.', categories: ['everyday-and-luxury-watches', 'sports-watches', 'digital-watches', 'smartwatches'] },
];
