import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cx, money } from '@/lib/format';
import { useCompare, useWishlist } from '@/lib/hooks';
import { Badge, Icon, Stars } from './ui';
import { WatchArt } from './WatchArt';

/**
 * Real photos fill the frame (they come with their own background); without a photo, a drawn watch sits
 * on a display-case spotlight.
 */
export function ProductImage({ product, className, label, eager, zoom, fit = 'cover' }) {
  const [failed, setFailed] = useState(false);
  const url = product.image ?? product.images?.[0]?.url;
  const photo = url && !failed;
  return (
    <div className={cx('relative overflow-hidden', photo ? 'bg-coal' : 'stage', className)}>
      {photo ? (
        <>
          <img src={url} alt={label ?? ''} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} className={cx('absolute inset-0 size-full transition-transform duration-700 ease-out', fit === 'cover' ? 'object-cover' : 'object-contain', zoom && 'group-hover:scale-[1.06]')} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,.35)]" />
        </>
      ) : (
        <WatchArt product={product} className={cx('absolute inset-0 size-full p-[12%] transition-transform duration-700 ease-out', zoom && 'group-hover:scale-[1.05]')} label={label} />
      )}
    </div>
  );
}

export function Price({ product, className, size = 'md' }) {
  if (product.priceMinor == null) return <span className={cx('muted', className)}>Price on request</span>;
  const off = product.compareAtMinor > product.priceMinor ? Math.round((1 - product.priceMinor / product.compareAtMinor) * 100) : 0;
  return (
    <span className={cx('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      <span className={cx('font-semibold tabular-nums', size === 'lg' ? 'text-[1.7rem]' : 'text-[1.02rem]')}>{money(product.priceMinor)}</span>
      {off > 0 && <><s className="muted text-[.85em] tabular-nums">{money(product.compareAtMinor)}</s><span className="text-ok text-[.8em] font-semibold">{off}% off</span></>}
    </span>
  );
}

function StockBadge({ p }) {
  if (p.priceMinor == null) return null;
  if (p.available <= 0) return <Badge tone="mute">Sold out</Badge>;
  if (p.available <= 2) return <Badge tone="warn">Only {p.available} left</Badge>;
  return null;
}

export const ProductCard = memo(function ProductCard({ product: p, view = 'grid', onQuickView }) {
  const wish = useWishlist();
  const compare = useCompare();
  const liked = wish.has(p.slug);
  const to = `/watches/${p.slug}`;
  const off = p.compareAtMinor > p.priceMinor;

  const actions = (
    <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5">
      <button onClick={() => wish.toggle(p.slug)} aria-pressed={liked} aria-label={liked ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`} className={cx('grid size-9 place-items-center border bg-ink/70 backdrop-blur transition-colors', liked ? 'border-champagne text-champagne' : 'rule hover:border-champagne hover:text-champagne')}>
        <Icon name="heart" size={17} className={liked ? 'fill-current' : ''} />
      </button>
      <button onClick={() => compare.toggle(p.slug)} aria-pressed={compare.has(p.slug)} aria-label={`Compare ${p.name}`} className={cx('grid size-9 place-items-center border bg-ink/70 opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100', compare.has(p.slug) ? 'border-champagne text-champagne opacity-100' : 'rule hover:border-champagne hover:text-champagne')}>
        <Icon name="compare" size={17} />
      </button>
    </div>
  );

  const badges = (
    <div className="absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
      {p.isLimitedEdition && <Badge tone="line">Limited edition</Badge>}
      {off && <Badge>Sale</Badge>}
      <StockBadge p={p} />
    </div>
  );

  if (view === 'list') {
    return (
      <article className="group grid grid-cols-[132px_1fr] gap-4 border rule bg-coal text-ivory sm:grid-cols-[200px_1fr] sm:gap-6">
        <Link to={to} className="relative block" tabIndex={-1} aria-hidden="true">
          <ProductImage product={p} className="aspect-[4/5] h-full" />
        </Link>
        <div className="relative flex flex-col justify-center gap-2 py-4 pr-14 sm:pr-16">
          <Link to={`/brands/${p.brandSlug}`} className="muted text-[.82rem] hover:text-champagne">{p.brandName}</Link>
          <h3 className="text-xl leading-tight"><Link to={to} className="hover:text-champagne">{p.name}</Link></h3>
          {p.collectionName && <p className="muted text-[.84rem]">{p.collectionName} collection</p>}
          <Stars value={p.ratingAvg} count={p.ratingCount} />
          <Price product={p} />
          <div className="mt-1 flex gap-2">
            <Link to={to} className="btn btn-line btn-sm">View details</Link>
            {onQuickView && <button className="btn btn-sm hover:text-champagne" onClick={() => onQuickView(p)}>Quick view</button>}
          </div>
          <div className="absolute right-3 top-3 flex gap-1.5">
            <button onClick={() => wish.toggle(p.slug)} aria-pressed={liked} aria-label={liked ? 'Remove from wishlist' : 'Add to wishlist'} className={cx('grid size-9 place-items-center', liked ? 'text-champagne' : 'muted hover:text-champagne')}><Icon name="heart" className={liked ? 'fill-current' : ''} /></button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group relative flex flex-col bg-coal text-ivory ring-1 ring-smoke transition-[box-shadow,transform] duration-500 hover:-translate-y-1 hover:shadow-[0_24px_50px_-20px_rgba(0,0,0,.9)] hover:ring-champagne/40">
      <div className="relative">
        <Link to={to} className="block" aria-label={`${p.brandName} ${p.name}`}>
          <ProductImage product={p} className="aspect-[4/5]" zoom />
        </Link>
        {badges}
        {actions}
        {onQuickView && (
          <button onClick={() => onQuickView(p)} className="absolute inset-x-3 bottom-3 z-10 translate-y-3 border border-champagne/40 bg-ink/85 py-2 text-[.8rem] font-semibold uppercase tracking-[.14em] text-champagne opacity-0 backdrop-blur transition-all duration-300 focus-visible:translate-y-0 focus-visible:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 max-md:hidden">
            Quick view
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col border-t border-smoke/70 px-4 pb-4 pt-3.5 text-center">
        <p className="truncate text-[.7rem] font-semibold uppercase tracking-[.2em] text-champagne">{p.brandName}</p>
        <h3 className="mt-1.5 font-display text-[1.12rem] leading-snug"><Link to={to} className="after:absolute after:inset-x-0 after:top-0 after:aspect-[4/5] after:content-[''] hover:text-champagne">{p.name}</Link></h3>
        {p.collectionName && <p className="muted mt-0.5 truncate text-[.76rem]">{p.collectionName}</p>}
        <div className="mx-auto my-3 h-px w-8 bg-champagne/40 transition-all duration-500 group-hover:w-16" />
        <div className="mt-auto flex flex-col items-center gap-1">
          <Price product={p} />
          {p.ratingCount > 0 && <Stars value={p.ratingAvg} count={p.ratingCount} />}
        </div>
      </div>
    </article>
  );
});

export function ProductGridSkeleton({ n = 8, view = 'grid' }) {
  return (
    <div className={view === 'list' ? 'space-y-4' : 'grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4'}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="bg-coal ring-1 ring-smoke">
          <div className="skeleton aspect-[4/5]" />
          <div className="space-y-2 p-4"><div className="skeleton h-3 w-1/3" /><div className="skeleton h-5 w-4/5" /><div className="skeleton h-4 w-1/2" /></div>
        </div>
      ))}
    </div>
  );
}
