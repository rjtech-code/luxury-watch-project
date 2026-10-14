import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { GENDER_LABEL, MOVEMENT_LABEL, cx } from '@/lib/format';
import { get } from '@/lib/api';
import { useBySlugs, useCompare, useWishlist } from '@/lib/hooks';
import { useLists } from '@/lib/store';
import { Seo } from '@/lib/seo';
import { Breadcrumbs, EmptyState, Icon, Skeleton } from '@/components/ui';
import { Price, ProductCard, ProductGridSkeleton, ProductImage } from '@/components/ProductCard';
import { AddToCart } from '@/components/QuickView';

const Viewer3D = lazy(() => import('@/components/Viewer3D'));
import { MODEL_LIBRARY, representativeModel } from '@/lib/models3d';
const home = { label: 'Home', to: '/' };
const NS = 'Not specified';

export function Wishlist() {
  const wish = useWishlist();
  const { data, isLoading } = useBySlugs(wish.slugs.slice(0, 12));
  return (
    <>
      <Seo title="Wishlist" noindex />
      <div className="wrap py-12">
        <Breadcrumbs items={[home, { label: 'Wishlist' }]} className="mb-5" />
        <h1 className="text-[clamp(2.2rem,5vw,3.6rem)]">Wishlist</h1>
        <p className="muted mt-2">{wish.count ? `${wish.count} saved` : 'Save watches to come back to them.'}{wish.count > 12 && ' (showing the 12 most recent)'}</p>
        <div className="mt-8">
          {wish.count === 0 ? <EmptyState icon="heart" title="Nothing saved yet" body="Tap the heart on any watch to keep it here. Sign in to keep your list across devices." action={<Link to="/shop" className="btn btn-gold">Browse watches</Link>} />
            : isLoading ? <ProductGridSkeleton n={Math.min(wish.count, 8)} />
            : <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{data?.items.map((p) => <ProductCard key={p.id} product={p} />)}</div>}
        </div>
      </div>
    </>
  );
}

export function Compare() {
  const { slugs, toggle } = useCompare();
  const clear = useLists((s) => s.clearCompare);
  const results = useQueries({ queries: slugs.map((s) => ({ queryKey: ['product', s], queryFn: () => get(`/api/catalog/products/${s}`), staleTime: 60_000 })) });
  const items = results.map((r) => r.data?.product).filter(Boolean);
  const loading = results.some((r) => r.isLoading);
  const rows = [
    ['Brand', (p) => p.brandName],
    ['Collection', (p) => p.collectionName],
    ['Category', (p) => p.categoryName],
    ['Gender', (p) => (p.gender ? GENDER_LABEL[p.gender] : null)],
    ['Movement', (p) => (p.movement ? MOVEMENT_LABEL[p.movement] ?? p.movement : null)],
    ['Case material', (p) => p.caseMaterial],
    ['Case diameter', (p) => (p.caseDiameterMm ? `${Number(p.caseDiameterMm)} mm` : null)],
    ['Dial colour', (p) => p.dialColor],
    ['Strap / bracelet', (p) => p.strapMaterial],
    ['Water resistance', (p) => (p.waterResistanceM != null ? `${p.waterResistanceM} m` : null)],
  ];
  return (
    <>
      <Seo title="Compare watches" noindex />
      <div className="wrap py-12">
        <Breadcrumbs items={[home, { label: 'Compare' }]} className="mb-5" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[clamp(2.2rem,5vw,3.6rem)]">Compare</h1>
          {slugs.length > 0 && <button className="btn btn-line btn-sm" onClick={clear}>Clear all</button>}
        </div>
        {slugs.length === 0 ? <EmptyState icon="compare" title="Nothing to compare" body="Use the compare button on up to four watches to see their details side by side." action={<Link to="/shop" className="btn btn-gold">Browse watches</Link>} />
          : loading ? <Skeleton className="mt-8 h-96" />
          : (
            <div className="mt-8 overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[40rem] border-collapse text-left">
                <caption className="sr-only">Watch comparison</caption>
                <thead>
                  <tr>
                    <th className="w-40 p-3" scope="col"><span className="sr-only">Attribute</span></th>
                    {items.map((p) => (
                      <th key={p.slug} scope="col" className="w-[14rem] p-3 align-top font-normal">
                        <div className="relative">
                          <button className="absolute right-0 top-0 z-10 grid size-8 place-items-center border rule bg-ink/70 hover:text-champagne" onClick={() => toggle(p.slug)} aria-label={`Remove ${p.name} from comparison`}><Icon name="close" size={15} /></button>
                          <Link to={`/watches/${p.slug}`}><ProductImage product={p} className="aspect-square" /></Link>
                        </div>
                        <p className="muted mt-3 text-[.8rem]">{p.brandName}</p>
                        <Link to={`/watches/${p.slug}`} className="text-lg leading-tight hover:text-champagne">{p.name}</Link>
                        <div className="mt-1"><Price product={p} /></div>
                        <div className="mt-3"><AddToCart product={p} variant={p.variants[0]} /></div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, fn]) => {
                    const vals = items.map(fn);
                    const differs = new Set(vals.map((v) => v ?? '')).size > 1;
                    return (
                      <tr key={label} className="border-t rule">
                        <th scope="row" className="muted p-3 text-[.86rem] font-normal">{label}</th>
                        {vals.map((v, i) => <td key={i} className={cx('p-3 text-[.92rem]', !v && 'muted italic', differs && v && 'text-champagne')}>{v || NS}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="muted mt-3 text-[.8rem]">Values highlighted in gold differ between the watches. “{NS}” means no data has been supplied for that model.</p>
            </div>
          )}
      </div>
    </>
  );
}

export function Showcase() {
  const { data } = useQuery({ queryKey: ['showcase-products'], queryFn: () => get('/api/catalog/products', { pageSize: 12, sort: 'featured' }), staleTime: 60_000 });
  const [slug, setSlug] = useState(null);
  const [libraryId, setLibraryId] = useState(MODEL_LIBRARY[0].id);
  const items = data?.items ?? [];
  const current = items.find((p) => p.slug === slug);
  const { data: detail } = useQuery({ queryKey: ['product', slug], queryFn: () => get(`/api/catalog/products/${slug}`), enabled: Boolean(slug), staleTime: 60_000 });
  const model = detail?.product?.modelUrl;
  const representative = slug ? representativeModel(detail?.product ?? current) : MODEL_LIBRARY.find((m) => m.id === libraryId);
  const pick = (s, lib) => { setSlug(s); if (lib) setLibraryId(lib); };
  const choice = (active, onClick, children, key) => (
    <li key={key}><button onClick={onClick} aria-pressed={active} className={cx('w-full border px-3 py-2.5 text-left text-[.9rem]', active ? 'border-champagne' : 'rule hover:border-champagne/50')}>{children}</button></li>
  );
  return (
    <>
      <Seo title="3D showcase" description="Rotate and zoom a watch in 3D. Where no model has been supplied, a clearly labelled generic watch is shown." path="/showcase" />
      <div className="wrap py-12">
        <Breadcrumbs items={[home, { label: '3D showcase' }]} className="mb-5" />
        <h1 className="text-[clamp(2.2rem,5vw,3.6rem)]">3D showcase</h1>
        <p className="muted mt-2 max-w-2xl">Drag to rotate, scroll or pinch to zoom. A watch only appears as itself in 3D when a model of it has been uploaded; otherwise you see a free representative model of a similar style, labelled as such and credited.</p>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="relative aspect-[4/3] border rule bg-coal">
            <Suspense fallback={<Skeleton className="size-full" />}><Viewer3D key={slug ?? libraryId} modelUrl={slug ? model : null} representative={representative} name={current?.name ?? 'Generic watch'} className="size-full" /></Suspense>
          </div>
          <aside aria-label="Choose a watch">
            <h2 className="text-xl">3D models</h2>
            <ul className="mt-3 space-y-1">
              {MODEL_LIBRARY.map((m) => choice(!slug && libraryId === m.id, () => pick(null, m.id), m.label, m.id))}
            </ul>
            <h2 className="mt-6 text-xl">Choose a watch</h2>
            <ul className="mt-3 max-h-[20rem] space-y-1 overflow-y-auto scrollbar-thin">
              {items.map((p) => choice(slug === p.slug, () => pick(p.slug), <><span className="muted block text-[.76rem]">{p.brandName}</span>{p.name}</>, p.id))}
            </ul>
            {current && <Link to={`/watches/${current.slug}`} className="btn btn-gold mt-4 w-full">View {current.name}</Link>}
          </aside>
        </div>
      </div>
    </>
  );
}
