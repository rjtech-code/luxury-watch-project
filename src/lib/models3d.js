/**
 * Free 3D watch models bundled in /public/models (see public/models/CREDITS.md).
 *
 * None of them is a model of a specific watch we sell. They are shown, clearly labelled as
 * "representative", for watches whose own GLB has not been uploaded yet. An uploaded GLB
 * (product.modelUrl) always takes priority.
 */

const ccBy4 = { license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' };
const cc0 = { license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' };
const sketchfab = (title, author, slug) => ({ title, author, ...ccBy4, sourceUrl: `https://sketchfab.com/3d-models/${slug}`, changes: 'Compressed for the web.' });
const polyHaven = (title, author, id) => ({ title, author, ...cc0, sourceUrl: `https://polyhaven.com/a/${id}`, changes: null });

const CHRONOGRAPH = {
  title: 'Chronograph Watch',
  author: 'Eric Chadwick / Darmstadt Graphics Group, from "Chronograph Watch Mudmaster" by graphiccompressor',
  ...ccBy4,
  sourceUrl: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ChronographWatch',
  changes: 'Logos removed, colour variants split into separate files, compressed.',
};

/** `focus` picks the watch head by node/material name (see Viewer3D). `turns` (world-axis rotations in degrees, applied in order) turn the dial to face the camera. `style` drives which watches a model may stand in for; `brand` limits a branded model to that brand. */
export const MODEL_LIBRARY = [
  { id: 'steel-bracelet', focus: /bodymain/, turns: [['z', -40], ['y', -90]], label: 'Steel bracelet watch, black dial', style: 'steel', url: '/models/steel-bracelet-watch.glb', credit: sketchfab('Wrist Watch', 'Vighnesh Naidu', 'wrist-watch-cd471b55a205468ba87a2e8494a99746') },
  { id: 'blue-dial', focus: { box: [[-0.2, -0.045, -0.33], [0.2, 0.045, 0.13]] }, turns: [['x', 90]], label: 'Patek Philippe dress watch, blue dial', style: 'dress', brand: 'Patek Philippe', url: '/models/blue-dial-watch.glb', credit: sketchfab('Wrist Watch', 'Samantha Haddock', 'wrist-watch-64314e5c91c241efbcc47a7d95f4ba5d') },
  { id: 'vintage-leather', focus: /body|hand|crown/, turns: [['x', 90]], label: 'Vintage leather-strap watch', style: 'dress', url: '/models/vintage-leather-watch.glb', credit: sketchfab('Old Wrist Watch DH', 'TwilightFox', 'old-wrist-watch-dh-438651fc63e84a8aaf5f58202a79c157') },
  { id: 'minimal-leather', turns: [['y', 90], ['x', 90]], label: 'Minimal watch on leather', style: 'dress', url: '/models/minimal-leather-watch.glb', credit: sketchfab('Luxury Watch', 'Pieter Ferreira', 'luxury-watch-98acd80e57204118ba67acf93b3ad735') },
  { id: 'chronograph-gold', label: 'Chronograph, black and gold', style: 'sport', url: '/models/chronograph-gold.glb', credit: CHRONOGRAPH },
  { id: 'chronograph-white', label: 'Chronograph, white', style: 'sport', url: '/models/chronograph-white.glb', credit: CHRONOGRAPH },
  { id: 'chronograph-green', label: 'Chronograph, green', style: 'sport', url: '/models/chronograph-green.glb', credit: CHRONOGRAPH },
  { id: 'chronograph-red', label: 'Chronograph, red', style: 'sport', url: '/models/chronograph-red.glb', credit: CHRONOGRAPH },
  { id: 'square-carbon', turns: [['y', -90]], label: 'Square carbon sports watch', style: 'sport', url: '/models/square-carbon-watch.glb', credit: sketchfab('MONTRE // RAGE - CARBON', 'timo74', 'montre-rage-carbon-free-download-e735c3c914c34b09accd9ed3a51b2a7d') },
  { id: 'digital-sports', focus: /Case|Glass/, label: 'Digital sports watch', style: 'rugged-digital', url: '/models/digital-sports-watch.glb', credit: sketchfab('Digital Watch', 'SpatialNeglect', 'digital-watch-fbad4cb705104df9b60cab174680707a') },
  { id: 'retro-digital', focus: { box: [[-0.019, -0.002, -0.02], [0.019, 0.006, 0.02]] }, turns: [['x', 90]], label: 'Retro digital watch, steel bracelet', style: 'retro-digital', url: '/models/retro-digital-watch.glb', credit: polyHaven('Digital Wrist Watch', 'Adrian C', 'digital_wrist_watch') },
  { id: 'longines-presence', focus: /Face|Crystal|Caseback|Crown|Logo/, turns: [['y', -90]], label: 'Longines Presence', style: 'dress', brand: 'Longines', url: '/models/longines-presence.glb', credit: sketchfab('Classic Watch Longines Presence', 'TURBO TURBO', 'classic-watch-longines-presence-20643c80a95b424984a014ad79c6195f') },
  { id: 'pocket-watch', label: 'Pocket watch', style: 'pocket', url: '/models/pocket-watch.glb', credit: polyHaven('Pocket Watch', 'PierreB3D', 'pocket_watch') },
  { id: 'vintage-pocket-watch', label: 'Engraved vintage pocket watch', style: 'pocket', url: '/models/vintage-pocket-watch.glb', credit: polyHaven('Vintage Pocket Watch', 'Tal Swicegood', 'vintage_pocket_watch') },
];

const byId = (id) => MODEL_LIBRARY.find((m) => m.id === id);
const ofStyle = (style) => MODEL_LIBRARY.filter((m) => m.style === style && !m.brand);

function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
const pickFrom = (pool, p) => pool[hash(p.slug ?? p.name ?? '') % pool.length];

/**
 * Picks the closest-looking bundled model for a product, or null when nothing fits
 * (smartwatches: there is no free, commercially usable smartwatch model, so the generic watch is shown).
 * The same product always gets the same model.
 */
export function representativeModel(p) {
  if (!p || p.isSmartwatch || p.movement === 'SMART') return null;
  const kind = `${p.typeLabel ?? ''} ${p.categorySlug ?? ''} ${p.categoryName ?? ''} ${p.name ?? ''}`.toLowerCase();
  const brand = p.brandName ?? '';

  if (/digital/.test(kind)) return /rugged|g-shock|dw-|gw-|ga-/.test(kind) ? byId('digital-sports') : byId('retro-digital');
  if (/sport|rugged|dive|pilot|chrono|travel|dual time|racing/.test(kind)) {
    return pickFrom(/dive|steel|sports luxury/.test(kind) ? [...ofStyle('sport'), byId('steel-bracelet')] : ofStyle('sport'), p);
  }
  if (brand === 'Longines' && /dress|classic|master|dolcevita/.test(kind)) return byId('longines-presence');
  if (brand === 'Patek Philippe' && /dress|calatrava|complicat/.test(kind)) return byId('blue-dial');
  if (/luxury|everyday|automatic|integrated|bracelet/.test(kind)) return pickFrom([byId('steel-bracelet'), ...ofStyle('dress')], p);
  return pickFrom(ofStyle('dress'), p);
}
