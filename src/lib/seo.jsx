import { Helmet } from 'react-helmet-async';
import { useSite } from './hooks';

/** Page metadata. Canonical URLs and JSON-LD use the site origin the visitor is on. */
export function Seo({ title, description, image, path, jsonLd, noindex }) {
  const { data: site } = useSite();
  const brand = site?.brand?.name ?? 'Time Luxe';
  const full = title ? `${title} | ${brand}` : `${brand}: ${site?.brand?.tagline ?? 'Luxury watches'}`;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = origin + (path ?? (typeof window !== 'undefined' ? window.location.pathname : ''));
  const desc = description?.slice(0, 160);
  return (
    <Helmet>
      <title>{full}</title>
      {desc && <meta name="description" content={desc} />}
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={brand} />
      <meta property="og:title" content={full} />
      {desc && <meta property="og:description" content={desc} />}
      <meta property="og:url" content={url} />
      {image && <meta property="og:image" content={image.startsWith('http') ? image : origin + image} />}
      <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}
