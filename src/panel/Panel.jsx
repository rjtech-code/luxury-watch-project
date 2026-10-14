import { lazy, Suspense } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { cx } from '@/lib/format';
import { useAuthActions, useCan, useMe, useSite } from '@/lib/hooks';
import { Seo } from '@/lib/seo';
import { Icon, Skeleton, Spinner, Toaster } from '@/components/ui';

const lz = (f, n) => lazy(() => f().then((m) => ({ default: m[n] })));
const Dashboard = lz(() => import('./Dashboard'), 'Dashboard');
const Analytics = lz(() => import('./Dashboard'), 'Analytics');
const Orders = lz(() => import('./Orders'), 'Orders');
const OrderDetail = lz(() => import('./Orders'), 'OrderDetail');
const Returns = lz(() => import('./Orders'), 'Returns');
const Products = lz(() => import('./Catalog'), 'Products');
const ProductEdit = lz(() => import('./Catalog'), 'ProductEdit');
const Taxonomy = lz(() => import('./Catalog'), 'Taxonomy');
const Inventory = lz(() => import('./Catalog'), 'Inventory');
const Customers = lz(() => import('./People'), 'Customers');
const Managers = lz(() => import('./People'), 'Managers');
const Coupons = lz(() => import('./Marketing'), 'Coupons');
const Reviews = lz(() => import('./Marketing'), 'Reviews');
const Content = lz(() => import('./Marketing'), 'Content');
const Support = lz(() => import('./Marketing'), 'Support');
const Settings = lz(() => import('./System'), 'Settings');
const Integrations = lz(() => import('./System'), 'Integrations');
const AuditLogs = lz(() => import('./System'), 'AuditLogs');

// perm: any one of these grants the link (SUPER_ADMIN always passes). The server enforces the same rules.
const ITEMS = [
  { to: '', label: 'Dashboard', icon: 'grid', perm: ['sales.read'] },
  { to: 'analytics', label: 'Analytics', icon: 'compare', perm: ['sales.read'] },
  { to: 'orders', label: 'Orders', icon: 'box', perm: ['orders.read'] },
  { to: 'returns', label: 'Returns', icon: 'return', perm: ['orders.read'] },
  { to: 'inventory', label: 'Inventory', icon: 'list', perm: ['inventory.read'] },
  { to: 'products', label: 'Products', icon: 'star', perm: ['products.write'], admin: true },
  { to: 'taxonomy', label: 'Brands & collections', icon: 'filter', perm: ['products.write'], admin: true },
  { to: 'customers', label: 'Customers', icon: 'user', perm: ['users.manage'], admin: true },
  { to: 'managers', label: 'Managers & roles', icon: 'shield', perm: ['users.manage'], admin: true },
  { to: 'coupons', label: 'Coupons', icon: 'gift', perm: ['coupons.manage'], admin: true },
  { to: 'reviews', label: 'Reviews', icon: 'star', perm: ['reviews.moderate'], admin: true },
  { to: 'content', label: 'Banners & journal', icon: 'edit', perm: ['content.manage'], admin: true },
  { to: 'support', label: 'Support', icon: 'headset', perm: ['support.manage'] },
  { to: 'settings', label: 'Settings', icon: 'lock', perm: ['settings.manage'], admin: true },
  { to: 'integrations', label: 'Integrations', icon: 'truck', perm: ['settings.manage'], admin: true },
  { to: 'audit', label: 'Audit log', icon: 'eye', perm: ['audit.read'], admin: true },
];

export function PanelRoutes({ scope }) {
  const { data: me, isLoading } = useMe();
  const can = useCan();
  const { logout } = useAuthActions();
  const nav = useNavigate();
  const loc = useLocation();
  const { data: site } = useSite();
  const base = `/${scope}`;
  if (isLoading) return <div className="grid min-h-dvh place-items-center"><Spinner className="size-8 text-champagne" /></div>;
  if (!me) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  const allowed = scope === 'admin' ? me.role === 'SUPER_ADMIN' : ['MANAGER', 'SUPER_ADMIN'].includes(me.role);
  if (!allowed) return <Navigate to={me.role === 'MANAGER' ? '/manager' : '/unauthorized'} replace />;
  const items = ITEMS.filter((i) => (scope === 'admin' || !i.admin) && can(...i.perm));
  const first = items[0]?.to ?? '';
  const guard = (to, el) => (items.some((i) => i.to === to) ? el : <Navigate to="/unauthorized" replace />);

  return (
    <div className="min-h-dvh bg-ink text-ivory lg:grid lg:grid-cols-[15rem_1fr]">
      <Seo title={scope === 'admin' ? 'Admin' : 'Manager'} noindex />
      <aside className="border-b rule bg-coal lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Link to="/" className="h-display text-xl">{site?.brand?.name ?? 'Time Luxe'}</Link>
          <p className="muted text-[.74rem] uppercase tracking-[.16em] lg:mt-1">{scope === 'admin' ? 'Super admin' : 'Manager'}</p>
        </div>
        <nav aria-label="Panel" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-6">
          {items.map((i) => (
            <NavLink key={i.to} to={`${base}/${i.to}`.replace(/\/$/, '')} end={i.to === ''} className={({ isActive }) => cx('flex items-center gap-2.5 whitespace-nowrap px-3 py-2 text-[.9rem]', isActive ? 'bg-champagne/12 text-champagne' : 'muted hover:text-ivory')}>
              <Icon name={i.icon} size={17} />{i.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t rule p-4 text-[.82rem] lg:block">
          <p className="truncate">{me.name}</p><p className="muted truncate">{me.email}</p>
          <div className="mt-3 flex gap-3"><Link to="/" className="text-champagne hover:underline">Storefront</Link><button className="muted hover:text-ivory" onClick={() => logout.mutate(undefined, { onSettled: () => nav('/login') })}>Sign out</button></div>
        </div>
      </aside>
      <main className="min-w-0 p-5 md:p-8">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <Routes>
            <Route index element={items.some((i) => i.to === '') ? <Dashboard scope={scope} /> : items.length ? <Navigate to={`${base}/${first}`} replace /> : <Navigate to="/unauthorized" replace />} />
            <Route path="analytics" element={guard('analytics', <Analytics />)} />
            <Route path="orders" element={guard('orders', <Orders scope={scope} />)} />
            <Route path="orders/:orderNumber" element={guard('orders', <OrderDetail scope={scope} />)} />
            <Route path="returns" element={guard('returns', <Returns />)} />
            <Route path="inventory" element={guard('inventory', <Inventory />)} />
            <Route path="products" element={guard('products', <Products />)} />
            <Route path="products/:id" element={guard('products', <ProductEdit />)} />
            <Route path="taxonomy" element={guard('taxonomy', <Taxonomy />)} />
            <Route path="customers" element={guard('customers', <Customers />)} />
            <Route path="managers" element={guard('managers', <Managers />)} />
            <Route path="coupons" element={guard('coupons', <Coupons />)} />
            <Route path="reviews" element={guard('reviews', <Reviews />)} />
            <Route path="content" element={guard('content', <Content />)} />
            <Route path="support" element={guard('support', <Support />)} />
            <Route path="settings" element={guard('settings', <Settings />)} />
            <Route path="integrations" element={guard('integrations', <Integrations />)} />
            <Route path="audit" element={guard('audit', <AuditLogs />)} />
            <Route path="*" element={<Navigate to={base} replace />} />
          </Routes>
        </Suspense>
      </main>
      <Toaster />
    </div>
  );
}
