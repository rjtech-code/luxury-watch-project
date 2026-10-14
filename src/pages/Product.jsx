import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GENDER_LABEL, MOVEMENT_LABEL, cx, dateFmt } from '@/lib/format';
import { errMsg, useBySlugs, useCompare, useMe, useProduct, useSite, useWishlist } from '@/lib/hooks';
import { get, post } from '@/lib/api';
import { useLists } from '@/lib/store';
import { Seo } from '@/lib/seo';
import { Badge, Breadcrumbs, Disclosure, ErrorState, Field, Icon, Modal, SectionHead, Skeleton, Stars, Tabs } from '@/components/ui';
import { Price, ProductCard } from '@/components/ProductCard';
import { AddToCart } from '@/components/QuickView';
import { WatchArt } from '@/components/WatchArt';
import { toast } from '@/lib/store';
import { NotFound } from './System';

const Viewer3D = lazy(() => import('@/components/Viewer3D'));
import { representativeModel } from '@/lib/models3d';
const NS = 'Not specified';
const titleCase = (s) => String(s).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Author and licence of a freely licensed photo, as CC BY / CC BY-SA require. */
function PhotoCredit({ credit }) {
  return (
    <p className="muted mt-2 text-[.72rem] leading-snug">
      Photo: <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-ash/40 underline-offset-2 hover:text-champagne">{credit.author.split('\n').pop()}</a>, <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-ash/40 underline-offset-2 hover:text-champagne">{credit.license}</a>, via Wikimedia Commons. Shows this model; the exact variant may differ.
    </p>
  );
}

function Gallery({ p }) {
  const images = p.images ?? [];
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [lens, setLens] = useState(null);
  const cur = images[i];
  const hasPhotos = images.length > 0;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setLens({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };
  return (
    <div>
      <div className="relative">
        <div
          className={cx('stage relative aspect-square overflow-hidden ring-1 ring-smoke', hasPhotos && 'cursor-zoom-in')}
          onMouseMove={hasPhotos ? onMove : undefined}
          onMouseLeave={() => setLens(null)}
          onClick={() => hasPhotos && setZoom(true)}
        >
          {hasPhotos ? (
            <img src={cur.url} alt={cur.alt || `${p.brandName} ${p.name}`} className="absolute inset-0 size-full object-contain p-[6%] drop-shadow-[0_24px_28px_rgba(0,0,0,.55)] transition-transform duration-150" style={lens ? { transform: 'scale(1.9)', transformOrigin: `${lens.x}% ${lens.y}%` } : undefined} />
          ) : (
            <WatchArt product={p} className="absolute inset-0 size-full p-6" label={`Illustration of a ${p.typeLabel ?? 'watch'}. Photography of this model has not been supplied.`} />
          )}
        </div>
        {!hasPhotos && <p className="muted mt-2 text-[.78rem]">Illustration only. Product photography for this model has not been supplied.</p>}
        {cur?.credit && <PhotoCredit credit={cur.credit} />}
        {hasPhotos && images.length > 1 && (
          <>
            <button className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center border rule bg-ink/70" aria-label="Previous image" onClick={() => setI((i + images.length - 1) % images.length)}><Icon name="chevronL" /></button>
            <button className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center border rule bg-ink/70" aria-label="Next image" onClick={() => setI((i + 1) % images.length)}><Icon name="chevronR" /></button>
          </>
        )}
      </div>
      {images.length > 1 && (
        <ul className="mt-3 grid grid-cols-5 gap-2">
          {images.map((im, n) => (
            <li key={im.url}><button onClick={() => setI(n)} aria-label={`Show image ${n + 1}`} aria-current={n === i} className={cx('block aspect-square w-full border bg-coal', n === i ? 'border-champagne' : 'rule hover:border-champagne/50')}><img src={im.url} alt="" loading="lazy" className="size-full object-contain" /></button></li>
          ))}
        </ul>
      )}
      <Modal open={zoom} onClose={() => setZoom(false)} title="Image" wide>
        {cur && <img src={cur.url} alt={cur.alt || p.name} className="mx-auto max-h-[75dvh] object-contain" />}
      </Modal>
    </div>
  );
}

function SpecTable({ p }) {
  const rows = [
    ['Brand', p.brandName],
    ['Collection', p.collectionName],
    ['Category', p.categoryName],
    ['Gender', p.gender ? GENDER_LABEL[p.gender] : null],
    ['Movement', p.movement ? MOVEMENT_LABEL[p.movement] ?? p.movement : null],
    ['Case material', p.caseMaterial],
    ['Case diameter', p.caseDiameterMm ? `${Number(p.caseDiameterMm)} mm` : null],
    ['Dial colour', p.dialColor],
    ['Strap / bracelet', p.strapMaterial],
    ['Water resistance', p.waterResistanceM != null ? `${p.waterResistanceM} m` : null],
    ...Object.entries(p.specs ?? {}).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object').map(([k, v]) => [titleCase(k), String(v)]),
  ];
  return (
    <>
      <dl className="divide-y rule border-y rule">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[10rem_1fr] gap-4 py-3 text-[.92rem] sm:grid-cols-[14rem_1fr]">
            <dt className="muted">{k}</dt>
            <dd className={v ? '' : 'muted italic'}>{v || NS}</dd>
          </div>
        ))}
      </dl>
      <p className="muted mt-3 text-[.8rem]">Specifications shown are those supplied for this model. Anything marked “{NS}” has not been provided and should be confirmed with us before purchase.</p>
    </>
  );
}

function RestockForm({ slug }) {
  const [email, setEmail] = useState('');
  const m = useMutation({ mutationFn: () => post('/api/restock', { slug, email }), onSuccess: (r) => { toast.ok(r.message); setEmail(''); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <label className="sr-only" htmlFor="restock-email">Email</label>
      <input id="restock-email" type="email" required className="input" placeholder="Email me when back in stock" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <button className="btn btn-line shrink-0" disabled={m.isPending}>Notify me</button>
    </form>
  );
}

function ReviewForm({ slug, onDone }) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const m = useMutation({
    mutationFn: () => post('/api/account/reviews', { productSlug: slug, rating, ...(title.trim() ? { title } : {}), body }),
    onSuccess: (r) => { toast.ok(r.message); onDone(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!rating) return toast.error('Choose a star rating.'); m.mutate(); }}>
      <fieldset><legend className="label">Your rating</legend>
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n} className={cx('p-1', n <= rating ? 'text-champagne' : 'muted')}><Icon name="star" size={26} className={n <= rating ? 'fill-current' : ''} /></button>)}</div>
      </fieldset>
      <Field label="Title (optional)"><input className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Review" hint="At least 10 characters."><textarea className="input" required minLength={10} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <button className="btn btn-gold" disabled={m.isPending}>{m.isPending ? 'Sending…' : 'Submit review'}</button>
    </form>
  );
}

function Reviews({ p }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['reviews', p.slug], queryFn: () => get(`/api/catalog/products/${p.slug}/reviews`) });
  const items = data?.items ?? [];
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>{p.ratingCount ? <><span className="text-3xl font-semibold">{Number(p.ratingAvg).toFixed(1)}</span> <Stars value={p.ratingAvg} count={p.ratingCount} size={18} /></> : <p className="muted">No reviews yet.</p>}</div>
        {me ? <button className="btn btn-line" onClick={() => setOpen(true)}>Write a review</button> : <Link className="btn btn-line" to="/login" state={{ from: `/watches/${p.slug}` }}>Sign in to review</Link>}
      </div>
      {isLoading ? <Skeleton className="h-24" /> : (
        <ul className="divide-y rule">
          {items.map((r) => (
            <li key={r.id} className="py-5">
              <div className="flex flex-wrap items-center gap-3"><Stars value={r.rating} count={1} />{r.verifiedPurchase && <Badge tone="ok">Verified purchase</Badge>}</div>
              {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
              <p className="mt-1 text-[.93rem]">{r.body}</p>
              <p className="muted mt-2 text-[.8rem]">{r.author} · {dateFmt(r.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Write a review">
        <ReviewForm slug={p.slug} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ['reviews', p.slug] }); }} />
      </Modal>
    </div>
  );
}

function RecentlyViewed({ exclude }) {
  const recent = useLists((s) => s.recent).filter((s) => s !== exclude).slice(0, 4);
  const { data } = useBySlugs(recent);
  if (!recent.length || !data?.items?.length) return null;
  return (
    <section className="wrap py-14">
      <SectionHead title="Recently viewed" />
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{data.items.map((p) => <ProductCard key={p.id} product={p} />)}</div>
    </section>
  );
}

export default function Product() {
  const { slug } = useParams();
  const { data, isLoading, error, refetch } = useProduct(slug);
  const { data: site } = useSite();
  const wish = useWishlist();
  const compare = useCompare();
  const pushRecent = useLists((s) => s.pushRecent);
  const [vid, setVid] = useState(null);
  const [tab, setTab] = useState('specs');
  const [shared, setShared] = useState(false);
  const p = data?.product;

  useEffect(() => { if (p) pushRecent(p.slug); }, [p?.slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setVid(null); setTab('specs'); }, [slug]);

  if (error?.status === 404) return <NotFound />;
  if (isLoading) return <div className="wrap grid gap-10 py-10 md:grid-cols-2"><Skeleton className="aspect-square" /><Skeleton className="h-96" /></div>;
  if (error) return <ErrorState error={error} retry={refetch} />;

  const variant = p.variants.find((v) => v.id === vid) ?? p.variants[0];
  const price = variant?.priceMinor ?? p.priceMinor;
  const priceless = p.priceMinor == null;
  const soldOut = !priceless && (variant?.available ?? 0) <= 0;
  const first = p.images?.[0]?.url;

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${p.brandName} ${p.name}`, url });
      else { await navigator.clipboard.writeText(url); setShared(true); toast.ok('Link copied.'); setTimeout(() => setShared(false), 2000); }
    } catch { /* user cancelled */ }
  };

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: `${p.brandName} ${p.name}`, brand: { '@type': 'Brand', name: p.brandName }, sku: variant?.sku,
    ...(p.description ? { description: p.description } : {}), ...(first ? { image: [first] } : {}),
    ...(p.ratingCount ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(p.ratingAvg), reviewCount: p.ratingCount } } : {}),
    ...(!priceless && !p.isDemoData ? { offers: { '@type': 'Offer', priceCurrency: 'INR', price: (price / 100).toFixed(2), availability: soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', url: window.location.href } } : {}),
  };

  return (
    <>
      <Seo title={`${p.brandName} ${p.name}`} description={p.description || `${p.brandName} ${p.name}${p.collectionName ? `, ${p.collectionName} collection` : ''}. Specifications, shipping and returns.`} image={first} path={`/watches/${p.slug}`} jsonLd={jsonLd} />
      <div className="wrap pt-6">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Shop', to: '/shop' }, { label: p.brandName, to: `/brands/${p.brandSlug}` }, ...(p.collectionSlug ? [{ label: p.collectionName, to: `/collections/${p.collectionSlug}` }] : []), { label: p.name }]} />
      </div>

      <div className="wrap grid gap-10 py-8 md:grid-cols-2 lg:gap-16">
        <Gallery p={p} />
        <div>
          <Link to={`/brands/${p.brandSlug}`} className="muted hover:text-champagne">{p.brandName}</Link>
          <h1 className="mt-1 text-[clamp(2rem,4vw,3rem)]">{p.name}</h1>
          {p.collectionName && <p className="muted mt-1">{p.collectionName} collection{p.typeLabel ? ` · ${p.typeLabel}` : ''}</p>}
          <div className="mt-3"><Stars value={p.ratingAvg} count={p.ratingCount} /></div>
          <div className="mt-5"><Price product={{ ...p, priceMinor: priceless ? null : price }} size="lg" /></div>
          {site?.taxLabel && !priceless && <p className="muted mt-1 text-[.8rem]">{site.taxLabel}</p>}
          {p.isDemoData && <p className="mt-3 border border-warn/40 bg-warn/10 px-3 py-2 text-[.82rem]">Development placeholder price. Real prices come from the store owner.</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {p.isLimitedEdition && <Badge tone="line">Limited edition</Badge>}
            {!priceless && soldOut && <Badge tone="mute">Sold out</Badge>}
            {!priceless && !soldOut && variant.available <= 2 && <Badge tone="warn">Only {variant.available} left</Badge>}
            {!priceless && !soldOut && variant.available > 2 && <Badge tone="ok">In stock</Badge>}
          </div>

          {p.description && <p className="mt-6 max-w-prose">{p.description}</p>}

          {p.variants.length > 1 && (
            <fieldset className="mt-6"><legend className="label">Option</legend>
              <div className="flex flex-wrap gap-2">{p.variants.map((v) => <button key={v.id} type="button" disabled={v.available <= 0} aria-pressed={v.id === variant.id} onClick={() => setVid(v.id)} className={cx('btn btn-sm', v.id === variant.id ? 'btn-gold' : 'btn-line')}>{v.label}</button>)}</div>
            </fieldset>
          )}

          <div className="mt-7 space-y-3">
            <AddToCart product={p} variant={variant} />
            {soldOut && <RestockForm slug={p.slug} />}
            {priceless && <p className="muted text-[.84rem]">This watch has no listed price. Send us an enquiry and we will reply with availability and pricing.</p>}
            <div className="grid grid-cols-3 gap-2">
              <button className="btn btn-line btn-sm" aria-pressed={wish.has(p.slug)} onClick={() => wish.toggle(p.slug)}><Icon name="heart" size={16} className={wish.has(p.slug) ? 'fill-current text-champagne' : ''} />{wish.has(p.slug) ? 'Saved' : 'Save'}</button>
              <button className="btn btn-line btn-sm" aria-pressed={compare.has(p.slug)} onClick={() => compare.toggle(p.slug)}><Icon name="compare" size={16} />{compare.has(p.slug) ? 'Added' : 'Compare'}</button>
              <button className="btn btn-line btn-sm" onClick={share}><Icon name={shared ? 'check' : 'share'} size={16} />Share</button>
            </div>
          </div>

          <ul className="mt-8 grid gap-3 border-y rule py-5 text-[.88rem] sm:grid-cols-3">
            <li className="flex gap-2"><Icon name="truck" size={18} className="shrink-0 text-champagne" />Insured, tracked delivery</li>
            <li className="flex gap-2"><Icon name="return" size={18} className="shrink-0 text-champagne" />{site?.returnWindowDays ?? 7}-day returns</li>
            <li className="flex gap-2"><Icon name="shield" size={18} className="shrink-0 text-champagne" />{p.warrantyInfo ? 'Warranty included' : 'Warranty: see terms'}</li>
          </ul>

          <div className="mt-2">
            <Disclosure title="Warranty">{p.warrantyInfo || site?.warrantyNote || 'Warranty terms for this model have not been supplied. Contact us for details before you buy.'} <Link to="/warranty" className="underline decoration-champagne/60 underline-offset-4">Warranty information</Link></Disclosure>
            <Disclosure title="Shipping">Orders ship fully insured with tracking. Delivery options and costs are shown at checkout. <Link to="/shipping" className="underline decoration-champagne/60 underline-offset-4">Shipping policy</Link></Disclosure>
            <Disclosure title="Returns">Return unworn watches in original condition within {site?.returnWindowDays ?? 7} days of delivery. <Link to="/returns" className="underline decoration-champagne/60 underline-offset-4">Returns policy</Link></Disclosure>
          </div>
        </div>
      </div>

      <section className="wrap pb-14">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'specs', label: 'Specifications' }, { value: '3d', label: '3D view' }, { value: 'reviews', label: `Reviews${p.ratingCount ? ` (${p.ratingCount})` : ''}` }]} />
        <div className="py-8">
          {tab === 'specs' && <SpecTable p={p} />}
          {tab === '3d' && (
            <div className="relative aspect-[4/3] max-h-[34rem] w-full border rule bg-coal">
              <Suspense fallback={<Skeleton className="size-full" />}><Viewer3D modelUrl={p.modelUrl} representative={representativeModel(p)} name={p.name} className="size-full" /></Suspense>
            </div>
          )}
          {tab === 'reviews' && <Reviews p={p} />}
        </div>
      </section>

      {p.related?.length > 0 && (
        <section className="wrap border-t rule py-14">
          <SectionHead title="You may also like" />
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{p.related.map((r) => <ProductCard key={r.id} product={r} />)}</div>
        </section>
      )}
      <RecentlyViewed exclude={p.slug} />

      <div className="h-20 md:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t rule bg-ink/95 p-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-[.82rem]">{p.name}</p><Price product={{ ...p, priceMinor: priceless ? null : price }} /></div><div className="w-44"><AddToCart product={p} variant={variant} /></div></div>
      </div>
    </>
  );
}
