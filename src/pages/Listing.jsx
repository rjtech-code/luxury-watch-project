import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { GENDER_LABEL, MOVEMENT_LABEL, cx, moneyCompact, plural } from '@/lib/format';
import { useBrands, useCategories, useCollections, useFilters, useProducts } from '@/lib/hooks';
import { OCCASIONS } from '@/lib/nav';
import { Seo } from '@/lib/seo';
import { Breadcrumbs, Drawer, EmptyState, ErrorState, Icon, Pagination } from '@/components/ui';
import { ProductCard, ProductGridSkeleton } from '@/components/ProductCard';
import { QuickView } from '@/components/QuickView';
import { NotFound } from './System';

const LIST_KEYS = ['brand', 'collection', 'category', 'gender', 'movement', 'occasion', 'caseMaterial', 'strapMaterial', 'dialColor'];
const FLAG_KEYS = ['inStock', 'discounted', 'limited'];
const NUM_KEYS = ['minPrice', 'maxPrice', 'minSize', 'maxSize', 'minWater'];

const SORTS = [
  ['featured', 'Featured'], ['newest', 'Newest'], ['popular', 'Most viewed'], ['rating', 'Top rated'],
  ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'],
];

const LABELS = { brand: 'Brand', collection: 'Collection', category: 'Category', gender: 'Gender', movement: 'Movement', occasion: 'Occasion', caseMaterial: 'Case material', strapMaterial: 'Strap material', dialColor: 'Dial colour' };
const titleCase = (s) => String(s).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function readFilters(sp) {
  const f = {};
  for (const k of LIST_KEYS) { const v = sp.get(k); if (v) f[k] = v.split(',').filter(Boolean); }
  for (const k of FLAG_KEYS) if (sp.get(k) === 'true') f[k] = true;
  for (const k of NUM_KEYS) { const v = sp.get(k); if (v !== null && v !== '' && !Number.isNaN(Number(v))) f[k] = Number(v); }
  f.sort = SORTS.some(([v]) => v === sp.get('sort')) ? sp.get('sort') : undefined;
  f.page = Math.max(1, Number(sp.get('page')) || 1);
  if (sp.get('q')) f.q = sp.get('q');
  return f;
}

function useFilterState(fixed) {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => readFilters(sp), [sp]);
  const update = useCallback((patch, { keepPage = false } = {}) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length)) next.delete(k);
        else next.set(k, Array.isArray(v) ? v.join(',') : String(v));
      }
      if (!keepPage) next.delete('page');
      return next;
    }, { replace: true });
  }, [setSp]);
  const clear = useCallback(() => setSp((prev) => { const n = new URLSearchParams(); if (prev.get('q')) n.set('q', prev.get('q')); return n; }, { replace: true }), [setSp]);
  const query = useMemo(() => ({ ...filters, ...fixed, pageSize: 12 }), [filters, fixed]);
  return { filters, update, clear, query };
}

function Group({ title, children, defaultOpen = true }) {
  return (
    <details open={defaultOpen} className="group border-b rule py-4">
      <summary className="flex list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">{title}<Icon name="chevron" size={16} className="transition-transform group-open:rotate-180" /></summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function CheckList({ name, options, selected = [], onChange, format, limit = 8 }) {
  const [all, setAll] = useState(false);
  const shown = all ? options : options.slice(0, limit);
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto scrollbar-thin pr-1">
        {shown.map((o) => (
          <li key={o.value}>
            <label className="flex cursor-pointer items-center gap-3 py-1.5 text-[.9rem]">
              <input type="checkbox" className="size-4 accent-[var(--color-champagne)]" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} name={name} />
              <span className="flex-1">{format ? format(o.value) : o.label ?? o.value}</span>
              {o.count != null && <span className="muted text-[.78rem] tabular-nums">{o.count}</span>}
            </label>
          </li>
        ))}
      </ul>
      {options.length > limit && <button type="button" className="mt-2 text-[.84rem] font-semibold text-champagne hover:underline" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${options.length}`}</button>}
    </>
  );
}

function RangeInputs({ lo, hi, onChange, unit, ph }) {
  const [a, setA] = useState(lo ?? '');
  const [b, setB] = useState(hi ?? '');
  const commit = () => onChange(a === '' ? undefined : Number(a), b === '' ? undefined : Number(b));
  const key = `${lo ?? ''}-${hi ?? ''}`;
  return (
    <div key={key} className="flex items-center gap-2">
      <input className="input !min-h-10 !px-2.5" type="number" min="0" inputMode="numeric" aria-label={`Minimum ${unit}`} placeholder={ph?.[0] ?? 'Min'} defaultValue={lo ?? ''} onChange={(e) => setA(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      <span className="muted">–</span>
      <input className="input !min-h-10 !px-2.5" type="number" min="0" inputMode="numeric" aria-label={`Maximum ${unit}`} placeholder={ph?.[1] ?? 'Max'} defaultValue={hi ?? ''} onChange={(e) => setB(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </div>
  );
}

/** Only facets the catalogue can actually satisfy are shown, because the API omits empty ones. */
function FilterPanel({ facets, filters, update, hide = [] }) {
  if (!facets) return <div className="space-y-4" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-10" />)}</div>;
  const set = (k) => (v) => update({ [k]: v });
  const list = (k, options, format) => !hide.includes(k) && options?.length > 0 && (
    <Group title={LABELS[k]} defaultOpen={['brand', 'category', 'gender'].includes(k) || (filters[k]?.length ?? 0) > 0}>
      <CheckList name={k} options={options} selected={filters[k]} onChange={set(k)} format={format} />
    </Group>
  );
  return (
    <div>
      {facets.price && (
        <Group title="Price (₹)">
          <RangeInputs lo={filters.minPrice} hi={filters.maxPrice} unit="price" ph={[Math.floor(facets.price.minMinor / 100), Math.ceil(facets.price.maxMinor / 100)].map((n) => moneyCompact(n * 100).replace('₹', ''))} onChange={(a, b) => update({ minPrice: a, maxPrice: b })} />
        </Group>
      )}
      {list('brand', facets.brands.map((b) => ({ value: b.slug, label: b.name, count: b.count })))}
      {list('category', facets.categories.map((b) => ({ value: b.slug, label: b.name, count: b.count })))}
      {!hide.includes('collection') && list('collection', facets.collections.filter((c) => !filters.brand?.length || filters.brand.some((b) => c.slug.startsWith(`${b}-`))).map((c) => ({ value: c.slug, label: `${c.name} (${c.brand})`, count: c.count })))}
      {facets.gender && list('gender', facets.gender.options, (v) => GENDER_LABEL[v] ?? titleCase(v))}
      {facets.movement && list('movement', facets.movement.options, (v) => MOVEMENT_LABEL[v] ?? titleCase(v))}
      {facets.occasion && list('occasion', facets.occasion.options, titleCase)}
      {facets.caseSize && (
        <Group title="Case size (mm)" defaultOpen={false}>
          <RangeInputs lo={filters.minSize} hi={filters.maxSize} unit="case size" ph={[Math.floor(facets.caseSize.min), Math.ceil(facets.caseSize.max)]} onChange={(a, b) => update({ minSize: a, maxSize: b })} />
        </Group>
      )}
      {facets.waterResistance && (
        <Group title="Water resistance" defaultOpen={false}>
          <select className="input" aria-label="Minimum water resistance" value={filters.minWater ?? ''} onChange={(e) => update({ minWater: e.target.value || undefined })}>
            <option value="">Any</option>
            {[30, 50, 100, 200, 300].filter((n) => n <= facets.waterResistance.maxM).map((n) => <option key={n} value={n}>{n} m or more</option>)}
          </select>
        </Group>
      )}
      {facets.caseMaterial && list('caseMaterial', facets.caseMaterial.options, titleCase)}
      {facets.strapMaterial && list('strapMaterial', facets.strapMaterial.options, titleCase)}
      {facets.dialColor && list('dialColor', facets.dialColor.options, titleCase)}
      <Group title="Availability">
        <div className="space-y-1">
          {[['inStock', 'In stock only'], ...(facets.hasDiscounts ? [['discounted', 'On sale']] : []), ['limited', 'Limited editions']].map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center gap-3 py-1.5 text-[.9rem]">
              <input type="checkbox" className="size-4 accent-[var(--color-champagne)]" checked={Boolean(filters[k])} onChange={(e) => update({ [k]: e.target.checked })} />{label}
            </label>
          ))}
        </div>
      </Group>
    </div>
  );
}

function Chips({ filters, facets, update, hide = [] }) {
  const names = useMemo(() => {
    const m = {};
    facets?.brands.forEach((b) => (m[`brand:${b.slug}`] = b.name));
    facets?.categories.forEach((b) => (m[`category:${b.slug}`] = b.name));
    facets?.collections.forEach((b) => (m[`collection:${b.slug}`] = b.name));
    return m;
  }, [facets]);
  const chips = [];
  for (const k of LIST_KEYS) {
    if (hide.includes(k)) continue;
    for (const v of filters[k] ?? []) chips.push({ id: `${k}:${v}`, label: names[`${k}:${v}`] ?? (k === 'movement' ? MOVEMENT_LABEL[v] : k === 'gender' ? GENDER_LABEL[v] : null) ?? titleCase(v), remove: () => update({ [k]: filters[k].filter((x) => x !== v) }) });
  }
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) chips.push({ id: 'price', label: `₹${filters.minPrice ?? 0}${filters.maxPrice !== undefined ? ` – ₹${filters.maxPrice}` : '+'}`, remove: () => update({ minPrice: undefined, maxPrice: undefined }) });
  if (filters.minSize !== undefined || filters.maxSize !== undefined) chips.push({ id: 'size', label: `${filters.minSize ?? 0}–${filters.maxSize ?? '∞'} mm`, remove: () => update({ minSize: undefined, maxSize: undefined }) });
  if (filters.minWater !== undefined) chips.push({ id: 'water', label: `${filters.minWater} m+`, remove: () => update({ minWater: undefined }) });
  if (filters.inStock) chips.push({ id: 'stock', label: 'In stock', remove: () => update({ inStock: false }) });
  if (filters.discounted) chips.push({ id: 'sale', label: 'On sale', remove: () => update({ discounted: false }) });
  if (filters.limited) chips.push({ id: 'ltd', label: 'Limited editions', remove: () => update({ limited: false }) });
  return chips;
}

/**
 * The shared catalogue page. `fixed` pins filters that belong to the page itself (e.g. gender for "Men's watches")
 * and `defaultSort` sets the order when the visitor has not chosen one.
 */
export function Listing({ title, intro, fixed, defaultSort, crumbs, path, hide = [], seoDescription, header, footer, bare = false, noindexWhenFiltered = true }) {
  const { filters, update, clear, query } = useFilterState(fixed);
  const [view, setView] = useState('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quick, setQuick] = useState(null);
  const facets = useFilters().data;
  const q = { ...query, sort: filters.sort ?? defaultSort ?? 'featured' };
  const { data, isLoading, isFetching, error, refetch } = useProducts(q);
  const chips = Chips({ filters, facets, update, hide });
  const active = chips.length > 0 || Boolean(filters.q);
  const total = data?.total;

  return (
    <>
      {!bare && <Seo title={title} description={seoDescription ?? intro} path={path} noindex={noindexWhenFiltered && (active || filters.page > 1)} />}
      {!bare && <div className="border-b rule">
        <div className="wrap py-8 md:py-12">
          {crumbs && <Breadcrumbs items={crumbs} className="mb-5" />}
          {header ?? (
            <>
              <h1 className="text-[clamp(2.2rem,5vw,3.8rem)]">{title}</h1>
              {intro && <p className="muted mt-3 max-w-2xl">{intro}</p>}
            </>
          )}
        </div>
      </div>}

      <div className="wrap grid gap-10 py-8 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto scrollbar-thin pr-3">
            <div className="flex items-center justify-between pb-2"><h2 className="text-xl">Filters</h2>{active && <button className="text-[.84rem] font-semibold text-champagne hover:underline" onClick={clear}>Clear all</button>}</div>
            <FilterPanel facets={facets} filters={filters} update={update} hide={hide} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 border-b rule pb-4">
            <button className="btn btn-line btn-sm lg:hidden" onClick={() => setFiltersOpen(true)}><Icon name="filter" size={16} />Filters{chips.length ? ` (${chips.length})` : ''}</button>
            <p className="muted mr-auto text-[.88rem]" aria-live="polite">{total === undefined ? 'Loading…' : filters.q ? `${plural(total, 'result')} for “${filters.q}”` : plural(total, 'watch', 'watches')}</p>
            <label className="flex items-center gap-2 text-[.86rem]"><span className="muted max-sm:sr-only">Sort by</span>
              <select className="input !min-h-10 !w-auto" value={q.sort} onChange={(e) => update({ sort: e.target.value })}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <div className="flex border rule" role="group" aria-label="Layout">
              {[['grid', 'grid', 'Grid view'], ['list', 'list', 'List view']].map(([v, i, l]) => (
                <button key={v} onClick={() => setView(v)} aria-pressed={view === v} aria-label={l} className={cx('grid size-10 place-items-center', view === v ? 'bg-champagne text-ink' : 'hover:text-champagne')}><Icon name={i} size={17} /></button>
              ))}
            </div>
          </div>

          {chips.length > 0 && (
            <ul className="flex flex-wrap items-center gap-2 py-4" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.id}><button onClick={c.remove} className="inline-flex items-center gap-1.5 border border-champagne/50 px-3 py-1 text-[.82rem] hover:bg-champagne/10" aria-label={`Remove filter ${c.label}`}>{c.label}<Icon name="close" size={13} /></button></li>
              ))}
              <li><button className="px-2 text-[.82rem] font-semibold text-champagne hover:underline" onClick={clear}>Clear all</button></li>
            </ul>
          )}

          <div className={cx('mt-6 transition-opacity', isFetching && !isLoading && 'opacity-60')}>
            {error ? <ErrorState error={error} retry={refetch} />
              : isLoading ? <ProductGridSkeleton view={view} />
              : data.items.length === 0 ? (
                <EmptyState icon="search" title="No watches match" body={active ? 'Try removing a filter or two.' : 'Nothing is listed here yet.'} action={active ? <button className="btn btn-gold" onClick={clear}>Clear filters</button> : <Link to="/shop" className="btn btn-gold">Browse all watches</Link>} />
              ) : (
                <div className={view === 'list' ? 'space-y-4' : 'grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3'}>
                  {data.items.map((p) => <ProductCard key={p.id} product={p} view={view} onQuickView={() => setQuick(p.slug)} />)}
                </div>
              )}
          </div>
          {data && <Pagination page={data.page} pages={data.pages} onChange={(n) => { update({ page: n > 1 ? n : undefined }, { keepPage: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
          {footer}
        </div>
      </div>

      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" side="bottom" footer={<div className="flex gap-3"><button className="btn btn-line flex-1" onClick={clear}>Clear all</button><button className="btn btn-gold flex-1" onClick={() => setFiltersOpen(false)}>Show {total ?? ''} watches</button></div>}>
        <FilterPanel facets={facets} filters={filters} update={update} hide={hide} />
      </Drawer>
      <QuickView slug={quick} onClose={() => setQuick(null)} />
    </>
  );
}

// -------------------------------------------------------------------- page wrappers
const home = { label: 'Home', to: '/' };

export const Shop = () => <Listing title="All watches" intro="Every watch in the catalogue. Narrow by brand, category, movement, size and more." path="/shop" crumbs={[home, { label: 'Shop' }]} />;

export const Mens = () => <Listing title="Men's watches" intro="Watches for men, including unisex models." fixed={{ gender: ['men'] }} hide={['gender']} path="/mens-watches" crumbs={[home, { label: "Men's watches" }]} />;
export const Womens = () => <Listing title="Women's watches" intro="Watches for women, including unisex models." fixed={{ gender: ['women'] }} hide={['gender']} path="/womens-watches" crumbs={[home, { label: "Women's watches" }]} />;
export const Smart = () => <Listing title="Smartwatches" intro="Connected watches for notifications, fitness and everyday use." fixed={{ smart: true }} hide={['movement']} path="/smart-watches" crumbs={[home, { label: 'Smartwatches' }]} />;
export const NewArrivals = () => <Listing title="New arrivals" intro="The most recently released watches." defaultSort="newest" path="/new-arrivals" crumbs={[home, { label: 'New arrivals' }]} />;
export const BestSellers = () => <Listing title="Best sellers" intro="The watches customers look at most." defaultSort="popular" path="/best-sellers" crumbs={[home, { label: 'Best sellers' }]} />;
export const Limited = () => <Listing title="Limited editions" intro="Watches produced in restricted numbers." fixed={{ limited: true }} path="/limited-editions" crumbs={[home, { label: 'Limited editions' }]} />;

export function Search() {
  const [sp] = useSearchParams();
  const q = sp.get('q') ?? '';
  return <Listing title={q ? `Search: ${q}` : 'Search'} intro={q ? undefined : 'Type a brand, collection or model in the search box.'} path="/search" crumbs={[home, { label: 'Search' }]} noindexWhenFiltered header={<h1 className="text-[clamp(2rem,4.5vw,3.2rem)]">{q ? <>Results for <em className="text-champagne not-italic">“{q}”</em></> : 'Search'}</h1>} seoDescription="Search results" />;
}

export function Category() {
  const { slug } = useParams();
  const { data, isLoading } = useCategories();
  const cat = data?.items.find((c) => c.slug === slug);
  if (isLoading) return <div className="wrap py-24"><div className="skeleton h-24" /></div>;
  if (!cat) return <NotFound />;
  return <Listing key={slug} title={cat.name} intro={cat.description || `${cat.name} from the catalogue.`} fixed={{ category: [slug] }} hide={['category']} path={`/category/${slug}`} crumbs={[home, { label: 'Shop', to: '/shop' }, { label: cat.name }]} />;
}

export function Occasion() {
  const { key } = useParams();
  const o = OCCASIONS.find((x) => x.key === key);
  if (!o) return <OccasionIndex />;
  return <Listing key={key} title={o.label} intro={o.blurb} fixed={{ category: o.categories }} hide={['category']} path={`/occasion/${key}`} crumbs={[home, { label: 'Occasions', to: '/occasion' }, { label: o.label }]} />;
}

export function OccasionIndex() {
  return (
    <>
      <Seo title="Shop by occasion" description="Find a watch for formal evenings, business, sport, travel or everyday wear." path="/occasion" />
      <div className="wrap py-14">
        <Breadcrumbs items={[home, { label: 'Occasions' }]} className="mb-5" />
        <h1 className="text-[clamp(2.2rem,5vw,3.8rem)]">Shop by occasion</h1>
        <p className="muted mt-3 max-w-2xl">An editorial guide: each occasion groups the kinds of watch that suit it.</p>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OCCASIONS.map((o) => <li key={o.key}><Link to={`/occasion/${o.key}`} className="block h-full border rule bg-coal p-6 transition-colors hover:border-champagne/60"><h2 className="text-2xl">{o.label}</h2><p className="muted mt-2">{o.blurb}</p></Link></li>)}
        </ul>
      </div>
    </>
  );
}
