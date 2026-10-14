import { Link, useParams } from 'react-router-dom';
import { plural } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { useBrands, useCollections } from '@/lib/hooks';
import { get } from '@/lib/api';
import { Seo } from '@/lib/seo';
import { Breadcrumbs, ErrorState, SectionHead, Skeleton } from '@/components/ui';
import { WatchArt, artKind } from '@/components/WatchArt';
import { Listing } from './Listing';
import { NotFound } from './System';

const home = { label: 'Home', to: '/' };

export function Brands() {
  const { data, isLoading, error, refetch } = useBrands();
  return (
    <>
      <Seo title="Brands" description="Every watch house in the catalogue, from independent ateliers to household names." path="/brands" />
      <div className="wrap py-12 md:py-16">
        <Breadcrumbs items={[home, { label: 'Brands' }]} className="mb-5" />
        <h1 className="text-[clamp(2.2rem,5vw,3.8rem)]">Brands</h1>
        <p className="muted mt-3 max-w-2xl">Browse by the house that made the watch.</p>
        {error ? <ErrorState error={error} retry={refetch} /> : (
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {isLoading ? Array.from({ length: 9 }, (_, i) => <li key={i}><Skeleton className="h-36" /></li>) : data.items.map((b) => (
              <li key={b.slug}>
                <Link to={`/brands/${b.slug}`} className="group flex h-full flex-col justify-between border rule bg-coal p-6 transition-colors hover:border-champagne/60">
                  <span className="muted text-[.8rem]">{[b.country, b.founded && `Est. ${b.founded}`].filter(Boolean).join(' · ')}</span>
                  <span className="mt-8 block">
                    <span className="h-display block text-[1.7rem] leading-tight group-hover:text-champagne">{b.name}</span>
                    <span className="muted text-[.84rem]">{[b.segment, plural(b.productCount, 'watch', 'watches')].filter(Boolean).join(' · ')}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function BrandDetail() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['brand', slug], queryFn: () => get(`/api/catalog/brands/${slug}`), retry: (n, e) => e?.status !== 404 && n < 2 });
  if (error?.status === 404) return <NotFound />;
  if (isLoading) return <div className="wrap py-20"><Skeleton className="h-48" /></div>;
  if (error) return <ErrorState error={error} />;
  const { brand, collections, relatedBrands } = data;
  return (
    <>
      <Seo title={`${brand.name} watches`} description={brand.description || `Browse ${brand.name} watches and collections.`} path={`/brands/${slug}`} jsonLd={{ '@context': 'https://schema.org', '@type': 'Brand', name: brand.name }} />
      <div className="border-b rule">
        <div className="wrap py-10 md:py-14">
          <Breadcrumbs items={[home, { label: 'Brands', to: '/brands' }, { label: brand.name }]} className="mb-5" />
          <h1 className="text-[clamp(2.4rem,5.5vw,4.4rem)]">{brand.name}</h1>
          <p className="muted mt-3">{[brand.country, brand.founded && `Founded ${brand.founded}`, brand.segment].filter(Boolean).join(' · ')}</p>
          {brand.description && <p className="mt-5 max-w-2xl">{brand.description}</p>}
          {relatedBrands?.length > 0 && <p className="muted mt-5 text-[.88rem]">Similar houses: {relatedBrands.map((b, i) => <span key={b.slug}>{i > 0 && ', '}<Link to={`/brands/${b.slug}`} className="underline decoration-champagne/50 underline-offset-4 hover:text-champagne">{b.name}</Link></span>)}</p>}
        </div>
      </div>
      {collections.length > 0 && (
        <section className="wrap py-12">
          <SectionHead title={`${brand.name} collections`} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {collections.map((c) => (
              <li key={c.slug}>
                <Link to={`/collections/${c.slug}`} className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden border rule bg-coal p-5 hover:border-champagne/60">
                  <WatchArt kind={artKind({ typeLabel: c.typeLabel })} seed={c.slug} className="absolute -right-6 -top-4 size-2/3 opacity-60" label="" />
                  <span className="relative text-[1.3rem] leading-tight">{c.name}</span>
                  <span className="muted relative text-[.8rem]">{[c.typeLabel, plural(c.productCount, 'watch', 'watches')].filter(Boolean).join(' · ')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Listing bare key={slug} fixed={{ brand: [slug] }} hide={['brand']} />
    </>
  );
}

export function Collections() {
  const { data, isLoading, error, refetch } = useCollections();
  const groups = {};
  for (const c of data?.items ?? []) (groups[c.brandName] ??= []).push(c);
  return (
    <>
      <Seo title="Collections" description="Every watch collection in the catalogue, grouped by brand." path="/collections" />
      <div className="wrap py-12 md:py-16">
        <Breadcrumbs items={[home, { label: 'Collections' }]} className="mb-5" />
        <h1 className="text-[clamp(2.2rem,5vw,3.8rem)]">Collections</h1>
        <p className="muted mt-3 max-w-2xl">Lines that define each house, grouped by brand.</p>
        {error ? <ErrorState error={error} retry={refetch} /> : isLoading ? <Skeleton className="mt-10 h-96" /> : (
          <div className="mt-10 space-y-12">
            {Object.entries(groups).map(([brand, items]) => (
              <section key={brand} aria-labelledby={`g-${items[0].brandSlug}`}>
                <h2 id={`g-${items[0].brandSlug}`} className="mb-4 flex items-baseline justify-between border-b rule pb-2 text-2xl"><Link to={`/brands/${items[0].brandSlug}`} className="hover:text-champagne">{brand}</Link><span className="muted text-sm">{plural(items.length, 'collection')}</span></h2>
                <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((c) => <li key={c.slug}><Link to={`/collections/${c.slug}`} className="flex items-baseline justify-between gap-3 py-2 hover:text-champagne"><span>{c.name}</span><span className="muted text-[.8rem]">{c.productCount}</span></Link></li>)}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function CollectionDetail() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['collection', slug], queryFn: () => get(`/api/catalog/collections/${slug}`), retry: (n, e) => e?.status !== 404 && n < 2 });
  if (error?.status === 404) return <NotFound />;
  if (isLoading) return <div className="wrap py-20"><Skeleton className="h-48" /></div>;
  if (error) return <ErrorState error={error} />;
  const { collection: c, relatedCollections } = data;
  return (
    <>
      <Seo title={`${c.brandName} ${c.name}`} description={c.description || `${c.brandName} ${c.name} watches.`} path={`/collections/${slug}`} />
      <div className="border-b rule">
        <div className="wrap py-10 md:py-14">
          <Breadcrumbs items={[home, { label: 'Collections', to: '/collections' }, { label: c.brandName, to: `/brands/${c.brandSlug}` }, { label: c.name }]} className="mb-5" />
          <p className="muted"><Link to={`/brands/${c.brandSlug}`} className="hover:text-champagne">{c.brandName}</Link>{c.typeLabel ? ` · ${c.typeLabel}` : ''}</p>
          <h1 className="mt-1 text-[clamp(2.4rem,5.5vw,4.4rem)]">{c.name}</h1>
          {c.description && <p className="mt-5 max-w-2xl">{c.description}</p>}
          {relatedCollections?.length > 0 && <p className="muted mt-5 text-[.88rem]">More from {c.brandName}: {relatedCollections.slice(0, 6).map((r, i) => <span key={r.slug}>{i > 0 && ', '}<Link to={`/collections/${r.slug}`} className="underline decoration-champagne/50 underline-offset-4 hover:text-champagne">{r.name}</Link></span>)}</p>}
        </div>
      </div>
      <Listing bare key={slug} fixed={{ collection: [slug] }} hide={['brand', 'collection']} />
    </>
  );
}

