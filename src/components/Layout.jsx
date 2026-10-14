import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cx, money } from '@/lib/format';
import { NAV, OCCASIONS, UTILITY } from '@/lib/nav';
import { useAuthActions, useBrands, useCart, useCartActions, useCollections, useMe, useSite, useWishlist } from '@/lib/hooks';
import { useLists, useUi } from '@/lib/store';
import { get } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Drawer, EmptyState, Icon, Modal, QtyStepper, Toaster } from './ui';
import { NewsletterForm } from './Newsletter';
import { ProductImage } from './ProductCard';

function useDebounced(v, ms = 220) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function Wordmark({ site }) {
  return (
    <Link to="/" className="group flex flex-col leading-none" aria-label={`${site?.brand?.name ?? 'Time Luxe'} home`}>
      <span className="h-display whitespace-nowrap text-[1.4rem] tracking-[.02em] text-ivory sm:text-[1.9rem]">{site?.brand?.name ?? 'Time Luxe'}</span>
      {site?.brand?.tagline && <span className="muted mt-1 hidden text-[.7rem] tracking-[.14em] sm:block">{site.brand.tagline}</span>}
    </Link>
  );
}

function Mega({ kind, onClose }) {
  const brands = useBrands();
  const cols = useCollections();
  if (kind === 'brands') {
    return (
      <div className="grid grid-cols-2 gap-x-10 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
        {(brands.data?.items ?? []).map((b) => <Link key={b.slug} to={`/brands/${b.slug}`} onClick={onClose} className="py-1.5 text-[.93rem] hover:text-champagne">{b.name}<span className="muted ml-2 text-[.78rem]">{b.productCount}</span></Link>)}
        <Link to="/brands" onClick={onClose} className="py-1.5 font-semibold text-champagne">All brands</Link>
      </div>
    );
  }
  if (kind === 'collections') {
    const groups = {};
    for (const c of cols.data?.items ?? []) (groups[c.brandName] ??= []).push(c);
    return (
      <div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(groups).slice(0, 8).map(([brand, items]) => (
            <div key={brand}>
              <p className="mb-1.5 text-[.95rem] font-semibold">{brand}</p>
              {items.slice(0, 4).map((c) => <Link key={c.slug} to={`/collections/${c.slug}`} onClick={onClose} className="muted block py-0.5 text-[.88rem] hover:text-champagne">{c.name}</Link>)}
            </div>
          ))}
        </div>
        <Link to="/collections" onClick={onClose} className="mt-5 inline-block font-semibold text-champagne">All collections</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-x-10 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {OCCASIONS.map((o) => <Link key={o.key} to={`/occasion/${o.key}`} onClick={onClose} className="group block py-1"><span className="font-semibold group-hover:text-champagne">{o.label}</span><span className="muted block text-[.84rem]">{o.blurb}</span></Link>)}
    </div>
  );
}

function DesktopNav() {
  const [open, setOpen] = useState(null);
  const loc = useLocation();
  const timer = useRef(0);
  useEffect(() => setOpen(null), [loc.pathname]);
  const enter = (k) => { clearTimeout(timer.current); setOpen(k); };
  const leave = () => { timer.current = window.setTimeout(() => setOpen(null), 140); };
  return (
    <nav aria-label="Primary" className="relative hidden border-t rule lg:block" onMouseLeave={leave} onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}>
      <ul className="wrap flex items-center justify-between gap-1 py-0.5 text-[.82rem] xl:text-[.86rem]">
        {NAV.map((n) => (
          <li key={n.to} onMouseEnter={() => (n.mega ? enter(n.mega) : leave())} className="relative">
            {n.mega ? (
              <div className="flex items-center">
                <NavLink to={n.to} className={({ isActive }) => cx('py-3.5 pl-1.5 transition-colors hover:text-champagne', isActive && 'text-champagne')}>{n.label}</NavLink>
                <button aria-label={`${n.label} menu`} aria-expanded={open === n.mega} onClick={() => setOpen(open === n.mega ? null : n.mega)} className="px-1 py-3.5 hover:text-champagne"><Icon name="chevron" size={13} className={cx('transition-transform', open === n.mega && 'rotate-180')} /></button>
              </div>
            ) : (
              <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => cx('block px-1.5 py-3.5 transition-colors hover:text-champagne', isActive && 'text-champagne')}>{n.label}</NavLink>
            )}
          </li>
        ))}
      </ul>
      {open && (
        <div className="anim-fade absolute inset-x-0 top-full border-y rule bg-ink/98 shadow-2xl" onMouseEnter={() => clearTimeout(timer.current)}>
          <div className="wrap py-8"><Mega kind={open} onClose={() => setOpen(null)} /></div>
        </div>
      )}
    </nav>
  );
}

function UserMenu({ me }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { logout } = useAuthActions();
  const nav = useNavigate();
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const key = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const links = [
    me.role === 'SUPER_ADMIN' && { to: '/admin', label: 'Admin panel' },
    me.role === 'MANAGER' && { to: '/manager', label: 'Manager panel' },
    { to: '/account', label: 'My account' }, { to: '/account/orders', label: 'My orders' }, { to: '/wishlist', label: 'Wishlist' },
  ].filter(Boolean);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label="Account menu" className="grid size-10 place-items-center hover:text-champagne"><Icon name="user" /></button>
      {open && (
        <div role="menu" className="anim-fade absolute right-0 top-full z-50 mt-2 w-56 border rule bg-charcoal py-2 shadow-2xl">
          <p className="truncate border-b rule px-4 pb-2 text-[.84rem]"><span className="block font-semibold">{me.name}</span><span className="muted">{me.email}</span></p>
          {links.map((l) => <Link key={l.to} role="menuitem" to={l.to} onClick={() => setOpen(false)} className="block px-4 py-2 text-[.9rem] hover:bg-smoke hover:text-champagne">{l.label}</Link>)}
          <button role="menuitem" className="block w-full px-4 py-2 text-left text-[.9rem] hover:bg-smoke hover:text-champagne" onClick={() => { setOpen(false); logout.mutate(undefined, { onSettled: () => nav('/') }); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

function SearchModal() {
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const searches = useLists((s) => s.searches);
  const pushSearch = useLists((s) => s.pushSearch);
  const clear = useLists((s) => s.clearSearches);
  const sug = useQuery({ queryKey: ['suggest', dq], queryFn: () => get('/api/catalog/suggest', { q: dq }), enabled: dq.length >= 2, staleTime: 30_000 });
  const go = (term) => { const t = term.trim(); if (!t) return; pushSearch(t); setOpen(false); setQ(''); nav(`/search?q=${encodeURIComponent(t)}`); };
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Search watches" wide>
      <form onSubmit={(e) => { e.preventDefault(); go(q); }} role="search">
        <div className="flex">
          <input data-autofocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by brand, collection or model" aria-label="Search watches" className="input flex-1 border-r-0" autoComplete="off" />
          <button className="btn btn-gold" aria-label="Search"><Icon name="search" size={18} /></button>
        </div>
      </form>
      <div className="mt-6 min-h-40">
        {dq.length >= 2 ? (
          sug.data?.items?.length ? (
            <ul className="divide-y rule border-y rule">
              {sug.data.items.map((p) => (
                <li key={p.slug}><Link to={`/watches/${p.slug}`} onClick={() => { pushSearch(dq); setOpen(false); }} className="flex items-center gap-4 py-2.5 hover:text-champagne">
                  <ProductImage product={p} className="size-14 shrink-0 border rule" /><span className="min-w-0 flex-1"><span className="muted block text-[.78rem]">{p.brandName}</span><span className="block truncate">{p.name}</span></span>
                  {p.priceMinor != null && <span className="text-[.9rem] tabular-nums">{money(p.priceMinor)}</span>}
                </Link></li>
              ))}
              <li className="py-3"><button onClick={() => go(dq)} className="font-semibold text-champagne">See all results for "{dq}"</button></li>
            </ul>
          ) : sug.isFetching ? <p className="muted">Searching…</p> : <p className="muted">No watches match "{dq}". Try a brand such as Omega, or a collection such as Speedmaster.</p>
        ) : searches.length ? (
          <div>
            <div className="mb-2 flex items-center justify-between"><p className="text-[.9rem] font-semibold">Recent searches</p><button onClick={clear} className="muted text-[.8rem] hover:text-champagne">Clear</button></div>
            <div className="flex flex-wrap gap-2">{searches.map((s) => <button key={s} onClick={() => go(s)} className="border rule px-3 py-1.5 text-[.88rem] hover:border-champagne hover:text-champagne">{s}</button>)}</div>
          </div>
        ) : <p className="muted">Start typing to see matching watches.</p>}
      </div>
    </Modal>
  );
}

export function CartDrawer() {
  const open = useUi((s) => s.cartOpen);
  const setOpen = useUi((s) => s.setCartOpen);
  const { data: cart, isLoading } = useCart();
  const { setQty, remove } = useCartActions();
  const close = () => setOpen(false);
  const lines = cart?.lines ?? [];
  return (
    <Drawer open={open} onClose={close} title={`Your cart${cart?.itemCount ? ` (${cart.itemCount})` : ''}`} footer={lines.length ? (
      <div>
        <div className="mb-1 flex justify-between text-[.95rem]"><span>Subtotal</span><span className="font-semibold tabular-nums">{money(cart.totals.subtotalMinor)}</span></div>
        <p className="muted mb-4 text-[.8rem]">Shipping, discounts and taxes are confirmed at checkout.</p>
        <div className="grid grid-cols-2 gap-3"><Link to="/cart" onClick={close} className="btn btn-line">View cart</Link><Link to="/checkout" onClick={close} className="btn btn-gold">Checkout</Link></div>
      </div>
    ) : null}>
      {isLoading ? <p className="muted py-8">Loading your cart…</p> : !lines.length ? (
        <EmptyState icon="bag" title="Your cart is empty" body="Find a watch you love and it will wait for you here." action={<Link to="/shop" onClick={close} className="btn btn-gold">Shop all watches</Link>} />
      ) : (
        <ul className="divide-y rule">
          {lines.map((l) => (
            <li key={l.variantId} className="flex gap-4 py-4">
              <Link to={`/watches/${l.slug}`} onClick={close} className="w-24 shrink-0"><ProductImage product={l} className="aspect-[4/5] border rule" /></Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="muted text-[.78rem]">{l.brandName}</p>
                <Link to={`/watches/${l.slug}`} onClick={close} className="leading-snug hover:text-champagne">{l.name}</Link>
                <p className="mt-1 text-[.92rem] tabular-nums">{money(l.unitPriceMinor)}</p>
                {l.issue && <p className="mt-1 text-[.78rem] text-warn">{l.issue === 'out_of_stock' ? 'Out of stock' : l.issue === 'low_stock' ? `Only ${l.available} available` : 'No longer available'}</p>}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <QtyStepper size="sm" value={l.quantity} max={Math.max(1, Math.min(10, l.available))} onChange={(q) => setQty.mutate({ variantId: l.variantId, quantity: q })} disabled={setQty.isPending} />
                  <button onClick={() => remove.mutate(l.variantId)} className="muted text-[.8rem] hover:text-danger">Remove</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function MobileMenu() {
  const open = useUi((s) => s.menuOpen);
  const setOpen = useUi((s) => s.setMenuOpen);
  const { data: me } = useMe();
  const { logout } = useAuthActions();
  const brands = useBrands();
  const [sub, setSub] = useState(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname, setOpen]);
  const close = () => setOpen(false);
  return (
    <Drawer open={open} onClose={close} title="Menu">
      <nav aria-label="Mobile">
        <ul className="divide-y rule">
          {[...NAV, ...UTILITY].map((n) => (
            <li key={n.to}>
              {n.mega === 'brands' || n.mega === 'occasion' ? (
                <>
                  <button className="flex w-full items-center justify-between py-3.5 text-left" aria-expanded={sub === n.mega} onClick={() => setSub(sub === n.mega ? null : n.mega)}>{n.label}<Icon name="chevron" size={16} className={cx('transition-transform', sub === n.mega && 'rotate-180')} /></button>
                  {sub === n.mega && (
                    <ul className="mb-3 space-y-1 border-l rule pl-4">
                      <li><Link to={n.to} className="block py-1.5 font-semibold text-champagne">All {n.label.toLowerCase()}</Link></li>
                      {n.mega === 'brands' ? (brands.data?.items ?? []).map((b) => <li key={b.slug}><Link to={`/brands/${b.slug}`} className="block py-1.5">{b.name}</Link></li>) : OCCASIONS.map((o) => <li key={o.key}><Link to={`/occasion/${o.key}`} className="block py-1.5">{o.label}</Link></li>)}
                    </ul>
                  )}
                </>
              ) : <Link to={n.to} className="block py-3.5">{n.label}</Link>}
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-6 grid gap-3">
        {me ? (<>
          {me.role === 'SUPER_ADMIN' && <Link to="/admin" className="btn btn-line">Admin panel</Link>}
          {me.role === 'MANAGER' && <Link to="/manager" className="btn btn-line">Manager panel</Link>}
          <Link to="/account" className="btn btn-line">My account</Link>
          <button className="btn" onClick={() => logout.mutate()}>Sign out</button>
        </>) : (<><Link to="/login" className="btn btn-gold">Log in</Link><Link to="/signup" className="btn btn-line">Sign up</Link></>)}
      </div>
    </Drawer>
  );
}

function Header() {
  const { data: site } = useSite();
  const { data: me } = useMe();
  const { data: cart } = useCart();
  const wish = useWishlist();
  const setSearch = useUi((s) => s.setSearchOpen);
  const setCart = useUi((s) => s.setCartOpen);
  const setMenu = useUi((s) => s.setMenuOpen);
  const [stuck, setStuck] = useState(false);
  useEffect(() => { const on = () => setStuck(window.scrollY > 8); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  const count = cart?.itemCount ?? 0;
  const icon = 'relative grid size-10 place-items-center hover:text-champagne';
  const dot = 'absolute right-0 top-0.5 grid min-w-4 place-items-center bg-champagne px-1 text-[.65rem] font-bold leading-4 text-ink';
  return (
    <header className={cx('sticky top-0 z-50 border-b transition-colors', stuck ? 'rule bg-ink/95 backdrop-blur' : 'border-transparent bg-ink')}>
      <div className="wrap flex h-[4.25rem] items-center justify-between gap-4">
        <button className="grid size-10 place-items-center hover:text-champagne lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Icon name="menu" /></button>
        <div className="min-w-0 max-lg:mr-auto"><Wordmark site={site} /></div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button className={icon} onClick={() => setSearch(true)} aria-label="Search"><Icon name="search" /></button>
          {me ? <UserMenu me={me} /> : <Link to="/login" className={cx(icon, 'lg:hidden')} aria-label="Log in"><Icon name="user" /></Link>}
          <Link to="/wishlist" className={cx(icon, 'max-xs:hidden')} aria-label={`Wishlist, ${wish.count} items`}><Icon name="heart" />{wish.count > 0 && <span className={dot}>{wish.count}</span>}</Link>
          <button className={icon} onClick={() => setCart(true)} aria-label={`Cart, ${count} items`}><Icon name="bag" />{count > 0 && <span className={dot}>{count}</span>}</button>
          {!me && (
            <div className="ml-3 hidden items-center gap-2 lg:flex">
              <Link to="/login" className="btn btn-line btn-sm">Log in</Link>
              <Link to="/signup" className="btn btn-gold btn-sm">Sign up</Link>
            </div>
          )}
        </div>
      </div>
      <DesktopNav />
    </header>
  );
}

function AnnouncementBar() {
  const { data: site } = useSite();
  if (!site) return <div className="h-9 bg-charcoal" />;
  return (
    <div className="bg-charcoal text-[.8rem]">
      {site.demoPricing && <p className="border-b border-warn/30 bg-warn/10 px-4 py-1.5 text-center text-warn">Demo catalogue: prices and stock shown are placeholders for testing, not real offers.</p>}
      <div className="wrap flex h-9 items-center justify-center gap-6 lg:justify-between">
        <p className="truncate text-champagne">{site.announcement}</p>
        <ul className="hidden items-center gap-5 lg:flex">{UTILITY.map((u) => <li key={u.to}><Link to={u.to} className="muted hover:text-champagne">{u.label}</Link></li>)}</ul>
      </div>
    </div>
  );
}

function Footer() {
  const { data: site } = useSite();
  const b = site?.brand ?? {};
  const social = Object.entries(b.social ?? {}).filter(([, v]) => v);
  const col = (title, items) => (
    <div>
      <h3 className="mb-4 font-sans text-[.95rem] font-semibold">{title}</h3>
      <ul className="space-y-2.5 text-[.9rem]">{items.map(([label, to]) => <li key={to}><Link to={to} className="muted hover:text-champagne">{label}</Link></li>)}</ul>
    </div>
  );
  return (
    <footer className="mt-24 border-t rule bg-coal">
      <div className="wrap grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1.3fr_repeat(3,1fr)_1.4fr]">
        <div>
          <p className="h-display text-3xl">{b.name ?? 'Time Luxe'}</p>
          {b.tagline && <p className="muted mt-2">{b.tagline}</p>}
          <address className="muted mt-6 space-y-1.5 text-[.9rem] not-italic">
            {b.address && <p>{b.address}</p>}
            {b.phone && <p><a href={`tel:${b.phone.replace(/\s/g, '')}`} className="hover:text-champagne">{b.phone}</a></p>}
            {b.email && <p><a href={`mailto:${b.email}`} className="hover:text-champagne">{b.email}</a></p>}
            {!b.address && !b.phone && !b.email && <p>Contact details are added in the admin settings.</p>}
          </address>
          {social.length > 0 && <ul className="mt-5 flex flex-wrap gap-4 text-[.9rem]">{social.map(([k, v]) => <li key={k}><a href={v} target="_blank" rel="noopener noreferrer" className="muted capitalize hover:text-champagne">{k === 'x' ? 'X' : k}</a></li>)}</ul>}
        </div>
        {col('Customer support', [['Contact us', '/contact'], ['FAQ', '/faq'], ['Track your order', '/track-order'], ['Request a service', '/service']])}
        {col('Shipping and returns', [['Shipping policy', '/shipping'], ['Returns policy', '/returns'], ['Warranty information', '/warranty'], ['Register your warranty', '/warranty#register']])}
        {col('The house', [['About us', '/about'], ['Craftsmanship', '/craftsmanship'], ['Journal', '/journal'], ['Watch buying guide', '/journal/how-to-choose-your-first-luxury-watch']])}
        <div>
          <h3 className="mb-4 font-sans text-[.95rem] font-semibold">Stay connected</h3>
          <p className="muted mb-4 text-[.9rem]">New arrivals and journal stories, sent occasionally.</p>
          <NewsletterForm id="nl-footer" />
        </div>
      </div>
      <div className="border-t rule">
        <div className="wrap flex flex-col gap-3 py-6 text-[.8rem] md:flex-row md:items-center md:justify-between">
          <p className="muted">© {new Date().getFullYear()} {b.name ?? 'Time Luxe'}. Brand names belong to their owners; this store is not affiliated with or endorsed by any watch manufacturer.</p>
          <ul className="flex gap-5"><li><Link to="/privacy" className="muted hover:text-champagne">Privacy policy</Link></li><li><Link to="/terms" className="muted hover:text-champagne">Terms and conditions</Link></li></ul>
        </div>
      </div>
    </footer>
  );
}

export function Layout() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, left: 0 }); }, [loc.pathname]);
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:bg-champagne focus:px-4 focus:py-2 focus:text-ink">Skip to content</a>
      <AnnouncementBar />
      <Header />
      <main id="main" tabIndex={-1} className="outline-none"><Outlet /></main>
      <Footer />
      <SearchModal />
      <CartDrawer />
      <MobileMenu />
      <Toaster />
    </>
  );
}
