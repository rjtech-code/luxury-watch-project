import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cx, dateFmt, plural } from '@/lib/format';
import { useBrands, useCategories, useCollections, useHome, useSite } from '@/lib/hooks';
import { OCCASIONS } from '@/lib/nav';
import { Seo } from '@/lib/seo';
import { Icon, Skeleton, Stars } from '@/components/ui';
import { LiveDial } from '@/components/LiveDial';
import { NewsletterForm } from '@/components/Newsletter';
import { ProductCard, ProductGridSkeleton } from '@/components/ProductCard';
import { WatchArt, artKind } from '@/components/WatchArt';
import { MODEL_LIBRARY, representativeModel } from '@/lib/models3d';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { BRAND_IMAGES } from '@/lib/brandImages';

const HeroWatch = lazy(() => import('@/components/HeroWatch'));
const Viewer3D = lazy(() => import('@/components/Viewer3D'));

const FEATURED_COLLECTIONS = ['rolex-submariner', 'patek-philippe-nautilus', 'audemars-piguet-royal-oak', 'omega-speedmaster', 'cartier-tank', 'tag-heuer-carrera', 'omega-seamaster', 'seiko-prospex'];
/** Watch shown in the 3D section, in order of preference; the first one with a photo is used. */
const SPOTLIGHT_PICKS = ['rolex-submariner-date', 'omega-speedmaster-moonwatch-professional', 'rolex-gmt-master-ii', 'patek-philippe-nautilus-5711', 'audemars-piguet-royal-oak-selfwinding-15500', 'rolex-cosmograph-daytona'];
const HERO_MODEL = MODEL_LIBRARY.find((m) => m.id === 'chronograph-gold');

function useInView(margin = '200px') {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return undefined;
    if (!('IntersectionObserver' in window)) { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen];
}

const Section = ({ children, light, className, id, wide }) => (
  <section id={id} className={cx('py-16 md:py-24', light && 'on-light bg-paper text-umber', className)}>
    <div className={wide ? 'mx-auto w-full max-w-[1600px] px-5 md:px-10' : 'wrap'}>{children}</div>
  </section>
);

/** Section title: small gold eyebrow, serif heading, optional link on the right (or centred). */
function Head({ eyebrow, title, sub, action, center, className }) {
  return (
    <div className={cx('mb-10 flex gap-x-8 gap-y-4', center ? 'flex-col items-center text-center' : 'flex-wrap items-end justify-between', className)}>
      <div className={cx(center && 'flex flex-col items-center')}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="mt-3 text-[clamp(2rem,3.6vw,3rem)]">{title}</h2>
        {sub && <p className="muted mt-3 max-w-xl">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

const More = ({ to, children }) => (
  <Link to={to} className="group inline-flex items-center gap-2 text-[.82rem] font-semibold uppercase tracking-[.16em] text-champagne hover:text-ivory [.on-light_&]:text-bronze [.on-light_&]:hover:text-umber">
    {children}<Icon name="chevronR" size={14} className="transition-transform group-hover:translate-x-1" />
  </Link>
);

// ---------------------------------------------------------------- hero

function Hero({ site, stats }) {
  const [ref, seen] = useInView('0px');
  return (
    <section className="relative isolate overflow-hidden border-b rule">
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_75%_45%,rgba(210,181,123,.16),transparent_65%),radial-gradient(40%_50%_at_10%_90%,rgba(138,106,62,.12),transparent_70%)]" />
      <div className="wrap grid min-h-[min(46rem,calc(100dvh-8rem))] items-center gap-10 py-14 lg:grid-cols-[1fr_1.05fr] lg:py-20">
        <div className="relative z-10">
          <p className="eyebrow anim-fade">{site?.brand?.tagline ?? 'Luxury watches'}</p>
          <h1 className="h-display mt-6 text-[clamp(2.9rem,6.8vw,6rem)]" style={{ animation: 'rise .9s .05s cubic-bezier(.2,.8,.2,1) both' }}>
            Time, worn<br />with <em className="font-display italic text-champagne">intention.</em>
          </h1>
          <p className="muted mt-7 max-w-md text-[1.05rem] leading-relaxed" style={{ animation: 'rise .9s .2s cubic-bezier(.2,.8,.2,1) both' }}>
            {stats ? `${plural(stats.brands, 'house', 'houses')}, ${plural(stats.watches, 'watch', 'watches')}. ` : ''}Browse by brand, collection or occasion, and compare side by side before you decide.
          </p>
          <div className="mt-10 flex flex-wrap gap-3" style={{ animation: 'rise .9s .35s cubic-bezier(.2,.8,.2,1) both' }}>
            <Link to="/brands" className="btn btn-gold">Explore the houses</Link>
            <Link to="/showcase" className="btn btn-line">3D showcase</Link>
          </div>
          <dl className="mt-14 grid max-w-md grid-cols-3 divide-x divide-smoke border-y rule py-5 text-center" style={{ animation: 'rise .9s .5s cubic-bezier(.2,.8,.2,1) both' }}>
            {[[stats?.brands ?? '—', 'Houses'], [stats?.watches ?? '—', 'References'], [`${site?.returnWindowDays ?? 7} days`, 'Returns']].map(([v, l]) => (
              <div key={l}><dt className="sr-only">{l}</dt><dd className="h-display text-[1.9rem] text-ivory">{v}</dd><dd className="muted mt-1 text-[.72rem] uppercase tracking-[.18em]">{l}</dd></div>
            ))}
          </dl>
        </div>

        <div ref={ref} className="relative mx-auto aspect-square w-full max-w-[38rem]">
          {/* A warm pool of light behind the display stand. */}
          <div aria-hidden="true" className="absolute inset-x-[8%] top-[4%] h-[70%] rounded-full bg-[radial-gradient(closest-side,rgba(210,181,123,.22),transparent)] blur-2xl" />
          <div aria-hidden="true" className="absolute inset-x-[14%] bottom-[10%] h-[18%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(210,181,123,.14),transparent)]" />
          {seen ? (
            <Suspense fallback={<LiveDial className="absolute inset-[10%] size-[80%]" />}>
              <div className="absolute inset-0"><HeroWatch model={HERO_MODEL} /></div>
            </Suspense>
          ) : <LiveDial className="absolute inset-[10%] size-[80%]" />}
          <p className="pointer-events-none absolute inset-x-0 -bottom-6 text-center text-[.72rem] uppercase tracking-[.2em] text-ash">
            <span className="text-champagne">●</span> Live time · drag to turn
          </p>
        </div>
      </div>
    </section>
  );
}

function BrandMarquee({ brands }) {
  if (!brands?.length) return null;
  const row = brands.map((b) => (
    <Link key={b.slug} to={`/brands/${b.slug}`} className="flex items-center gap-10 px-5 font-display text-[1.45rem] tracking-wide text-ivory/70 transition-colors hover:text-champagne">
      {b.name}<span aria-hidden="true" className="text-[.6rem] text-champagne/60">◆</span>
    </Link>
  ));
  return (
    <section aria-label="Brands" className="overflow-hidden border-b rule bg-coal py-6">
      <div className="marquee">{row}<div aria-hidden="true" className="flex">{row}</div></div>
    </section>
  );
}

// ---------------------------------------------------------------- collections

function CollectionCard({ c, big }) {
  return (
    <Link to={`/collections/${c.slug}`} className={cx('group relative flex flex-col justify-end overflow-hidden bg-coal ring-1 ring-smoke transition-shadow duration-500 hover:ring-champagne/50', big ? 'min-h-[26rem] lg:row-span-2' : 'min-h-[16rem]')}>
      <div className={cx('absolute inset-0', !c.imageUrl && 'stage')}>
        {c.imageUrl ? (
          <img src={c.imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-1000 ease-out group-hover:scale-105" />
        ) : (
          <WatchArt kind={artKind({ typeLabel: c.typeLabel })} seed={c.slug} className="absolute inset-x-0 top-0 mx-auto h-3/4 w-3/4 opacity-80" label="" />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-ink/5" />
      <div className="relative p-6">
        <p className="eyebrow !text-[.66rem]">{c.brandName}</p>
        <h3 className={cx('mt-1.5 leading-tight', big ? 'text-[2.2rem]' : 'text-[1.5rem]')}>{c.name}</h3>
        <p className="muted mt-1 flex items-center gap-2 text-[.8rem]">{plural(c.productCount, 'reference', 'references')}<Icon name="chevronR" size={13} className="text-champagne transition-transform group-hover:translate-x-1" /></p>
      </div>
    </Link>
  );
}

function Collections() {
  const { data } = useCollections();
  const all = (data?.items ?? []).filter((c) => c.productCount > 0);
  const picked = FEATURED_COLLECTIONS.map((s) => all.find((c) => c.slug === s)).filter(Boolean);
  const items = [...picked, ...all.filter((c) => !picked.includes(c) && c.imageUrl)].slice(0, 7);
  if (!items.length) return null;
  return (
    <Section>
      <Head eyebrow="Iconic collections" title="Lines that defined their eras" action={<More to="/collections">All collections</More>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
        {items.map((c, i) => <CollectionCard key={c.slug} c={c} big={i === 0} />)}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- curated product tabs

function Selection({ home, loading }) {
  const tabs = [
    ['bestSellers', 'Best sellers', '/best-sellers'],
    ['newArrivals', 'New arrivals', '/new-arrivals'],
    ['men', 'For him', '/mens-watches'],
    ['women', 'For her', '/womens-watches'],
    ['limited', 'Limited editions', '/limited-editions'],
  ].filter(([k]) => loading || home?.[k]?.length);
  const [tab, setTab] = useState('bestSellers');
  const current = tabs.find(([k]) => k === tab) ?? tabs[0];
  if (!current) return null;
  const items = home?.[current[0]] ?? [];
  return (
    <Section className="bg-gradient-to-b from-ink to-coal">
      <Head eyebrow="The selection" title="Chosen for you" center />
      <div role="tablist" aria-label="Product selection" className="mx-auto mb-10 flex max-w-full gap-1 overflow-x-auto border-b rule scrollbar-thin sm:w-fit">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={current[0] === k} onClick={() => setTab(k)} className={cx('-mb-px whitespace-nowrap border-b-2 px-5 py-3 text-[.8rem] font-semibold uppercase tracking-[.14em] transition-colors', current[0] === k ? 'border-champagne text-champagne' : 'muted border-transparent hover:text-ivory')}>{label}</button>
        ))}
      </div>
      {loading ? <ProductGridSkeleton n={4} /> : (
        <div key={current[0]} className="anim-fade grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {items.slice(0, 8).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
      <div className="mt-12 text-center"><Link to={current[2]} className="btn btn-line">View all {current[1].toLowerCase()}</Link></div>
    </Section>
  );
}

// ---------------------------------------------------------------- categories

function Categories() {
  const { data } = useCategories();
  const items = (data?.items ?? []).filter((c) => c.productCount > 0);
  if (!items.length) return null;
  return (
    <Section>
      <Head eyebrow="Shop by category" title="Find your kind of watch" action={<More to="/shop">Shop all</More>} />
      <ul className="-mx-5 flex snap-x gap-6 overflow-x-auto px-5 pb-4 scrollbar-thin md:mx-0 md:grid md:grid-cols-4 md:gap-8 md:overflow-visible md:px-0 lg:grid-cols-6">
        {items.slice(0, 12).map((c) => (
          <li key={c.slug} className="w-36 shrink-0 snap-start md:w-auto">
            <Link to={`/category/${c.slug}`} className="group block text-center">
              <span className="stage relative mx-auto block aspect-square w-full overflow-hidden rounded-full ring-1 ring-smoke transition-[box-shadow] duration-500 group-hover:ring-champagne/70">
                {c.imageUrl
                  ? <img src={c.imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  : <WatchArt kind={artKind({ typeLabel: c.slug.replace(/-/g, ' ') })} seed={c.slug} className="absolute inset-[18%] size-[64%]" label="" />}
              </span>
              <span className="mt-4 block font-display text-[1.08rem] leading-tight group-hover:text-champagne">{c.name}</span>
              <span className="muted text-[.76rem]">{plural(c.productCount, 'watch', 'watches')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------- 3D

function Interactive3D({ product }) {
  const [ref, seen] = useInView('300px');
  return (
    <section className="relative overflow-hidden border-y rule bg-[radial-gradient(70%_80%_at_70%_50%,#1f1b16,#0c0b0a)] py-16 md:py-24">
      <div ref={ref} className="wrap grid items-center gap-10 lg:grid-cols-[.75fr_1.25fr]">
        <div>
          <p className="eyebrow">Interactive 3D</p>
          <h2 className="mt-3 text-[clamp(2rem,3.6vw,3rem)]">Turn it over in your hands</h2>
          <p className="muted mt-5 max-w-md leading-relaxed">Rotate, zoom and look at the case, the crown and the caseback. Watches without their own model show a realistic representative model of the same style, always labelled.</p>
          <ul className="mt-7 space-y-2.5 text-[.92rem]">
            {['Drag to rotate, pinch or scroll to zoom', 'Front, side, crown and back views', 'Full screen, and AR on Android'].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="size-1.5 rotate-45 bg-champagne" />{t}</li>
            ))}
          </ul>
          <Link to="/showcase" className="btn btn-gold mt-9">Open the 3D showcase</Link>
        </div>
        <div className="relative aspect-[4/3] ring-1 ring-smoke">
          {seen ? (
            <Suspense fallback={<Skeleton className="size-full" />}>
              <Viewer3D modelUrl={product?.modelUrl} representative={representativeModel(product)} name={product?.name ?? 'Generic watch'} className="size-full" />
            </Suspense>
          ) : <Skeleton className="size-full" />}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- brands

function BrandCard({ b, big }) {
  const img = BRAND_IMAGES[b.slug];
  return (
    <Link to={`/brands/${b.slug}`} className={cx('group relative flex flex-col overflow-hidden bg-coal ring-1 ring-smoke transition-[box-shadow,transform] duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-25px_rgba(0,0,0,.9)] hover:ring-champagne/50', big && 'sm:col-span-2 sm:row-span-2')}>
      <div className={cx('stage relative', big ? 'aspect-[4/3] sm:flex-1' : 'aspect-[4/3]')}>
        {img ? (
          <img src={img.src} alt={`${b.name} ${img.watch}`} loading="lazy" className="absolute inset-[8%] size-[84%] object-contain drop-shadow-[0_26px_26px_rgba(0,0,0,.65)] transition-transform duration-1000 ease-out group-hover:scale-[1.06] group-hover:-rotate-2" />
        ) : (
          <WatchArt kind="dress" seed={b.slug} className="absolute inset-[18%] size-[64%]" label="" />
        )}
      </div>
      <div className="flex items-end justify-between gap-4 border-t border-smoke/70 p-5">
        <div className="min-w-0">
          <p className="eyebrow !text-[.62rem]">{[b.country, b.founded && `Est. ${b.founded}`].filter(Boolean).join(' · ')}</p>
          <h3 className={cx('mt-1.5 leading-tight group-hover:text-champagne', big ? 'text-[2.3rem]' : 'text-[1.45rem]')}>{b.name}</h3>
          <p className="muted mt-1 truncate text-[.8rem]">{img?.watch ? `${img.watch} · ` : ''}{plural(b.productCount, 'watch', 'watches')}</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full ring-1 ring-champagne/40 transition-colors group-hover:bg-champagne group-hover:text-ink"><Icon name="chevronR" size={16} /></span>
      </div>
    </Link>
  );
}

function BrandShowcase({ brands, loading }) {
  const items = (brands ?? []).filter((b) => b.productCount > 0);
  const credited = items.filter((b) => BRAND_IMAGES[b.slug]);
  return (
    <Section>
      <Head eyebrow="The houses" title="Every brand we carry" sub="From Geneva ateliers to Tokyo and Bengaluru. Choose a house to see its collections." action={<More to="/brands">All brands</More>} />
      {loading ? <Skeleton className="h-96" /> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((b, i) => <BrandCard key={b.slug} b={b} big={i < 2} />)}
        </div>
      )}
      {credited.length > 0 && (
        <details className="mt-8 text-[.74rem] text-ash">
          <summary className="w-fit cursor-pointer hover:text-champagne">Photo credits</summary>
          <p className="mt-2 max-w-4xl leading-relaxed">
            Photos from Wikimedia Commons, backgrounds removed and colour graded for this site:{' '}
            {credited.map((b, i) => {
              const c = BRAND_IMAGES[b.slug].credit;
              return <span key={b.slug}>{i > 0 && '; '}{b.name}, <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-ash/40 underline-offset-2 hover:text-champagne">{c.author}</a> (<a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-ash/40 underline-offset-2 hover:text-champagne">{c.license}</a>)</span>;
            })}.
          </p>
        </details>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- occasions

function Occasions() {
  return (
    <Section>
      <Head eyebrow="Shop by occasion" title="A watch for every moment" />
      <ul className="grid gap-px bg-smoke ring-1 ring-smoke sm:grid-cols-2 lg:grid-cols-5">
        {OCCASIONS.map((o, i) => (
          <li key={o.key} className="bg-ink">
            <Link to={`/occasion/${o.key}`} className="group relative flex h-full min-h-60 flex-col justify-between overflow-hidden p-6 transition-colors hover:bg-coal">
              <span className="font-display text-[2.6rem] leading-none text-champagne/25 transition-colors group-hover:text-champagne/60">0{i + 1}</span>
              <span>
                <span className="block font-display text-[1.4rem] leading-tight">{o.label}</span>
                <span className="muted mt-2 block text-[.84rem] leading-relaxed">{o.blurb}</span>
                <span className="mt-4 inline-flex items-center gap-2 text-[.74rem] font-semibold uppercase tracking-[.16em] text-champagne">Explore<Icon name="chevronR" size={13} className="transition-transform group-hover:translate-x-1" /></span>
              </span>
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-champagne transition-transform duration-500 group-hover:scale-x-100" />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------- craft and guide

const CRAFT = [
  ['Movement', 'The calibre is the heart of a watch. Mechanical movements are assembled from hundreds of tiny parts; quartz trades that ritual for accuracy.'],
  ['Case and crystal', 'Steel, gold, titanium or ceramic: each changes weight, wear and character. Sapphire crystal resists scratches.'],
  ['Dial and hands', 'Finishing on the dial, from sunburst to enamel, is where many houses show their hand.'],
  ['Service', 'A mechanical watch is meant to be serviced and passed on. Ask about service intervals before you buy.'],
];
const STEPS = [
  ['Decide how you will wear it', 'Daily wear, occasions or travel narrows the choice faster than budget alone.'],
  ['Get the size right', 'Case diameter and lug-to-lug length matter more than the number on a spec sheet.'],
  ['Pick a movement', 'Automatic for the mechanical experience, quartz for low upkeep, smart for notifications.'],
  ['Compare, then decide', 'Compare up to four watches and read warranty and return terms before you pay.'],
];

function ArtOfChoosing() {
  return (
    <Section light>
      <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <p className="eyebrow">Understanding craftsmanship</p>
          <h2 className="mt-3 text-[clamp(2rem,3.4vw,2.8rem)]">What to look for when you hold a watch</h2>
          <dl className="mt-10 divide-y divide-[#d9cfba] border-y border-[#d9cfba]">
            {CRAFT.map(([t, d]) => (
              <div key={t} className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr]">
                <dt className="font-display text-[1.25rem]">{t}</dt>
                <dd className="muted text-[.92rem] leading-relaxed">{d}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8"><More to="/craftsmanship">Read about craftsmanship</More></div>
        </div>
        <div className="bg-umber p-8 text-ivory md:p-12">
          <p className="eyebrow !text-champagne">Buying guide</p>
          <h2 className="mt-3 text-[clamp(1.8rem,3vw,2.4rem)]">Four questions to find the right watch</h2>
          <ol className="mt-8 space-y-7">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[3rem_1fr] gap-4">
                <span className="h-display text-[2.4rem] leading-none text-champagne">{i + 1}</span>
                <span><span className="block font-display text-[1.2rem]">{t}</span><span className="mt-1 block text-[.9rem] text-ivory/65">{d}</span></span>
              </li>
            ))}
          </ol>
          <Link to="/journal" className="btn btn-gold mt-10">Read the journal</Link>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- journal, reviews, newsletter, trust

function Journal({ articles }) {
  if (!articles?.length) return null;
  return (
    <Section>
      <Head eyebrow="The journal" title="Stories and guides" action={<More to="/journal">All articles</More>} />
      <div className="grid gap-8 md:grid-cols-3">
        {articles.map((a) => (
          <article key={a.slug} className="group">
            <Link to={`/journal/${a.slug}`} className="block">
              <div className="stage relative aspect-[3/2] overflow-hidden ring-1 ring-smoke">
                {a.coverUrl ? <img src={a.coverUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" /> : <WatchArt kind="dress" seed={a.slug} className="absolute inset-[18%] size-[64%]" label="" />}
              </div>
              <p className="eyebrow mt-5 !text-[.66rem]">{[a.category, dateFmt(a.publishedAt)].filter(Boolean).join(' · ')}</p>
              <h3 className="mt-2 text-[1.4rem] leading-snug group-hover:text-champagne">{a.title}</h3>
              <p className="muted mt-2 text-[.9rem]">{a.excerpt}</p>
            </Link>
          </article>
        ))}
      </div>
    </Section>
  );
}

function Reviews({ reviews }) {
  if (!reviews?.length) return null;
  return (
    <Section className="bg-coal">
      <Head eyebrow="Reviews" title="What customers say" sub="From verified accounts, moderated before publishing." center />
      <div className="grid gap-5 md:grid-cols-3">
        {reviews.slice(0, 3).map((r, i) => (
          <figure key={i} className="relative bg-ink p-7 ring-1 ring-smoke">
            <span aria-hidden="true" className="absolute right-6 top-2 font-display text-[4rem] leading-none text-champagne/20">“</span>
            <Stars value={r.rating} count={1} />
            {r.title && <p className="mt-4 font-display text-[1.2rem]">{r.title}</p>}
            <blockquote className="muted mt-2 text-[.92rem] leading-relaxed">{r.body}</blockquote>
            <figcaption className="mt-5 text-[.8rem]">{r.author} · <span className="muted">{r.product}</span></figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

function Newsletter() {
  return (
    <section className="on-light relative overflow-hidden bg-linen py-16 text-umber md:py-20">
      <div aria-hidden="true" className="absolute -right-24 -top-24 size-80 rounded-full border border-bronze/20" />
      <div aria-hidden="true" className="absolute -right-10 -top-10 size-52 rounded-full border border-bronze/20" />
      <div className="wrap relative grid items-center gap-8 md:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="eyebrow">The list</p>
          <h2 className="mt-3 text-[clamp(1.9rem,3.2vw,2.6rem)]">New arrivals and stories, occasionally</h2>
          <p className="muted mt-3">No noise. Unsubscribe any time.</p>
        </div>
        <NewsletterForm id="nl-home" light />
      </div>
    </section>
  );
}

function Trust({ site }) {
  const items = [
    ['truck', 'Insured shipping', 'Every order ships fully insured with tracking.'],
    ['return', `${site?.returnWindowDays ?? 7}-day returns`, 'Unworn, in original condition.'],
    ['shield', 'Warranty', site?.warrantyNote || 'Warranty terms are listed on each watch.'],
    ['lock', 'Secure payments', 'Card details go straight to the payment provider.'],
  ];
  return (
    <section className="border-t rule">
      <div className="wrap">
      <ul className="grid gap-px bg-smoke sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([i, t, d]) => (
          <li key={t} className="flex gap-4 bg-ink px-2 py-9 sm:px-6">
            <span className="grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-champagne/40"><Icon name={i} size={20} className="text-champagne" /></span>
            <div><p className="font-semibold">{t}</p><p className="muted text-[.84rem]">{d}</p></div>
          </li>
        ))}
      </ul>
      </div>
    </section>
  );
}

function PromoBanners({ banners }) {
  const items = (banners ?? []).filter((b) => b.placement !== 'announcement').slice(0, 2);
  if (!items.length) return null;
  const isExt = (h) => /^https:\/\//.test(h ?? '');
  return (
    <section className="border-b rule bg-coal">
      <ul className="wrap grid gap-3 py-6 md:grid-cols-2">
        {items.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-4 border border-champagne/30 p-5">
            <div><p className="font-display text-[1.25rem] leading-tight">{b.title}</p>{b.subtitle && <p className="muted mt-1 text-[.88rem]">{b.subtitle}</p>}</div>
            {b.ctaLabel && b.ctaHref && (isExt(b.ctaHref) ? <a className="btn btn-line btn-sm shrink-0" href={b.ctaHref} rel="noopener noreferrer">{b.ctaLabel}</a> : <Link className="btn btn-line btn-sm shrink-0" to={b.ctaHref}>{b.ctaLabel}</Link>)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Home() {
  const { data: site } = useSite();
  const { data: home, isLoading } = useHome();
  const brands = useBrands();
  const { data: picks } = useQuery({ queryKey: ['spotlight-picks'], queryFn: () => get('/api/catalog/by-slugs', { slugs: SPOTLIGHT_PICKS.join(',') }), staleTime: 5 * 60_000 });
  const stats = brands.data ? { brands: brands.data.items.length, watches: brands.data.items.reduce((n, b) => n + b.productCount, 0) } : null;
  const spotlight = [...(picks?.items ?? []), ...(home?.featured ?? []), ...(home?.bestSellers ?? [])].find((p) => p.image) ?? home?.bestSellers?.[0];
  return (
    <>
      <Seo title={null} description="Browse luxury and everyday watches by brand, collection and occasion. Compare models, save favourites and check out securely." path="/" />
      <Hero site={site} stats={stats} />
      <BrandMarquee brands={brands.data?.items} />
      <PromoBanners banners={home?.banners} />
      <Collections />
      <Selection home={home} loading={isLoading} />
      <Categories />
      <Interactive3D product={spotlight} />
      <BrandShowcase brands={brands.data?.items} loading={brands.isLoading} />
      <Occasions />
      <ArtOfChoosing />
      <Journal articles={home?.articles} />
      <Reviews reviews={home?.reviews} />
      <Newsletter />
      <Trust site={site} />
    </>
  );
}
