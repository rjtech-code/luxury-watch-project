import { useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PAYMENT_LABEL, STATUS_LABEL, cx, dateFmt, money, plural } from '@/lib/format';
import { del, get, patch, post, put } from '@/lib/api';
import { errMsg, useAuthActions, useBySlugs, useMe, useWishlist } from '@/lib/hooks';
import { toast } from '@/lib/store';
import { Seo } from '@/lib/seo';
import { Badge, EmptyState, ErrorState, Field, Icon, Modal, Pagination, Skeleton, Stars } from '@/components/ui';
import { ProductCard } from '@/components/ProductCard';
import { OrderView } from './Checkout';

const NAV = [['', 'Overview'], ['orders', 'Orders'], ['wishlist', 'Wishlist'], ['addresses', 'Addresses'], ['reviews', 'Reviews'], ['notifications', 'Notifications'], ['support', 'Support'], ['profile', 'Profile'], ['security', 'Security']];

const useAcct = (key, path, opts) => useQuery({ queryKey: ['acct', key], queryFn: () => get(path), ...opts });
const Head = ({ title, children }) => <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-[1.8rem]">{title}</h2>{children}</div>;

function Overview() {
  const { data: me } = useMe();
  const { data, isLoading, error } = useAcct('overview', '/api/account/overview');
  if (isLoading) return <Skeleton className="h-48" />;
  if (error) return <ErrorState error={error} />;
  return (
    <div>
      <Head title={`Welcome, ${me.name.split(' ')[0]}`} />
      {!me.emailVerified && <VerifyBanner />}
      <dl className="grid gap-3 sm:grid-cols-3">
        {[['Orders', data.totalOrders, 'orders'], ['Wishlist', data.wishlistItems, 'wishlist'], ['Saved addresses', data.savedAddresses, 'addresses']].map(([k, v, to]) => <Link key={k} to={to} className="border rule bg-coal p-5 hover:border-champagne/60"><dt className="muted text-sm">{k}</dt><dd className="h-display mt-1 text-4xl">{v}</dd></Link>)}
      </dl>
      {data.loyalty && <p className="mt-4 border rule p-4 text-sm">Loyalty points: <strong>{data.loyalty.points}</strong></p>}
      <h3 className="mb-3 mt-10 text-xl">Recent orders</h3>
      {data.recentOrders.length ? <OrderTable items={data.recentOrders} /> : <p className="muted">No orders yet. <Link to="/shop" className="text-champagne underline">Browse watches</Link></p>}
    </div>
  );
}

function VerifyBanner() {
  const m = useMutation({ mutationFn: () => post('/api/auth/resend-verification'), onSuccess: () => toast.ok('Verification email sent.'), onError: (e) => toast.error(errMsg(e)) });
  return <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-warn/40 bg-warn/10 p-4 text-sm"><span>Please verify your email address.</span><button className="btn btn-line btn-sm" onClick={() => m.mutate()} disabled={m.isPending}>Resend email</button></div>;
}

function OrderTable({ items }) {
  return (
    <div className="overflow-x-auto"><table className="table-lux"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Payment</th><th className="text-right">Total</th></tr></thead>
      <tbody>{items.map((o) => <tr key={o.orderNumber}><td><Link to={`/account/orders/${o.orderNumber}`} className="font-semibold text-champagne hover:underline">{o.orderNumber}</Link></td><td>{dateFmt(o.placedAt)}</td><td>{STATUS_LABEL[o.status] ?? o.status}</td><td>{PAYMENT_LABEL[o.paymentStatus] ?? o.paymentStatus ?? '–'}</td><td className="text-right tabular-nums">{money(o.totalMinor)}</td></tr>)}</tbody></table></div>
  );
}

function Orders() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({ queryKey: ['acct', 'orders', page], queryFn: () => get('/api/account/orders', { page }), placeholderData: (p) => p });
  return (
    <div><Head title="Orders" />
      {isLoading ? <Skeleton className="h-48" /> : error ? <ErrorState error={error} /> : !data.items.length ? <EmptyState title="No orders yet" action={<Link to="/shop" className="btn btn-gold">Browse watches</Link>} /> : <><OrderTable items={data.items} /><Pagination page={page} pages={data.pages} onChange={setPage} /></>}
    </div>
  );
}

function OrderDetail() {
  const { orderNumber } = useParams();
  const qc = useQueryClient();
  const [ret, setRet] = useState(false);
  const [reason, setReason] = useState('');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['acct', 'order', orderNumber], queryFn: () => get(`/api/account/orders/${orderNumber}`) });
  const cancel = useMutation({ mutationFn: () => post(`/api/account/orders/${orderNumber}/cancel`, {}), onSuccess: () => { toast.ok('Order cancelled.'); refetch(); qc.invalidateQueries({ queryKey: ['acct'] }); }, onError: (e) => toast.error(errMsg(e)) });
  const ask = useMutation({ mutationFn: () => post(`/api/account/orders/${orderNumber}/return`, { reason }), onSuccess: () => { toast.ok('Return requested. We will email you next steps.'); setRet(false); refetch(); }, onError: (e) => toast.error(errMsg(e)) });
  if (isLoading) return <Skeleton className="h-64" />;
  if (error) return <ErrorState error={error} />;
  const o = data.order;
  return (
    <div><Link to="/account/orders" className="muted mb-4 inline-flex items-center gap-1 text-sm hover:text-champagne"><Icon name="chevronL" size={14} />All orders</Link>
      <OrderView order={{ ...o, canCancel: false }} />
      <div className="mt-6 flex flex-wrap gap-3">
        {o.canCancel && <button className="btn btn-danger" disabled={cancel.isPending} onClick={() => window.confirm('Cancel this order?') && cancel.mutate()}>Cancel order</button>}
        {o.canReturn && <button className="btn btn-line" onClick={() => setRet(true)}>Request a return</button>}
      </div>
      <Modal open={ret} onClose={() => setRet(false)} title="Request a return">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); ask.mutate(); }}><Field label="Reason"><textarea className="input" required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field><button className="btn btn-gold" disabled={ask.isPending}>Submit request</button></form>
      </Modal>
    </div>
  );
}

function WishlistTab() {
  const w = useWishlist();
  const { data, isLoading } = useBySlugs(w.slugs.slice(0, 12));
  return <div><Head title="Wishlist" />{!w.count ? <EmptyState icon="heart" title="Nothing saved yet" action={<Link to="/shop" className="btn btn-gold">Browse watches</Link>} /> : isLoading ? <Skeleton className="h-64" /> : <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{data?.items.map((p) => <ProductCard key={p.id} product={p} />)}</div>}</div>;
}

const EMPTY = { label: '', fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', isDefault: false };
function Addresses() {
  const qc = useQueryClient();
  const { data, isLoading } = useAcct('addresses', '/api/account/addresses');
  const [edit, setEdit] = useState(null);
  const save = useMutation({
    mutationFn: (a) => { const { id, userId, createdAt, updatedAt, country, ...body } = a; const b = { ...body, label: body.label || null, line2: body.line2 || null }; return id ? put(`/api/account/addresses/${id}`, b) : post('/api/account/addresses', b); },
    onSuccess: () => { setEdit(null); qc.invalidateQueries({ queryKey: ['acct', 'addresses'] }); qc.invalidateQueries({ queryKey: ['addresses'] }); toast.ok('Address saved.'); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const rm = useMutation({ mutationFn: (id) => del(`/api/account/addresses/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['acct', 'addresses'] }); qc.invalidateQueries({ queryKey: ['addresses'] }); }, onError: (e) => toast.error(errMsg(e)) });
  const f = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  return (
    <div><Head title="Addresses"><button className="btn btn-gold btn-sm" onClick={() => setEdit(EMPTY)}><Icon name="plus" size={15} />Add address</button></Head>
      {isLoading ? <Skeleton className="h-40" /> : !data.items.length ? <EmptyState icon="mapPin" title="No saved addresses" /> : (
        <ul className="grid gap-3 sm:grid-cols-2">{data.items.map((a) => (
          <li key={a.id} className="border rule bg-coal p-5 text-sm"><div className="flex items-center justify-between"><p className="font-semibold">{a.label || a.fullName}</p>{a.isDefault && <Badge>Default</Badge>}</div><p className="muted mt-2">{a.fullName}<br />{a.line1}{a.line2 && `, ${a.line2}`}<br />{a.city}, {a.state} {a.postalCode}<br />{a.phone}</p>
            <div className="mt-4 flex gap-4"><button className="text-champagne hover:underline" onClick={() => setEdit({ ...EMPTY, ...a, label: a.label ?? '', line2: a.line2 ?? '' })}>Edit</button><button className="muted hover:text-danger" onClick={() => window.confirm('Delete this address?') && rm.mutate(a.id)}>Delete</button></div></li>))}</ul>
      )}
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? 'Edit address' : 'New address'}>
        {edit && <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}>
          <Field label="Label (e.g. Home)"><input className="input" maxLength={30} value={edit.label} onChange={f('label')} /></Field>
          <Field label="Full name"><input className="input" required value={edit.fullName} onChange={f('fullName')} /></Field>
          <Field label="Phone"><input className="input" required type="tel" value={edit.phone} onChange={f('phone')} /></Field>
          <Field label="PIN code"><input className="input" required inputMode="numeric" maxLength={6} value={edit.postalCode} onChange={f('postalCode')} /></Field>
          <Field label="Address line 1" className="sm:col-span-2"><input className="input" required value={edit.line1} onChange={f('line1')} /></Field>
          <Field label="Address line 2" className="sm:col-span-2"><input className="input" value={edit.line2} onChange={f('line2')} /></Field>
          <Field label="City"><input className="input" required value={edit.city} onChange={f('city')} /></Field>
          <Field label="State"><input className="input" required value={edit.state} onChange={f('state')} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-[var(--color-champagne)]" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} />Make default</label>
          <button className="btn btn-gold sm:col-span-2" disabled={save.isPending}>Save address</button>
        </form>}
      </Modal>
    </div>
  );
}

function Reviews() {
  const qc = useQueryClient();
  const { data, isLoading } = useAcct('reviews', '/api/account/reviews');
  const rm = useMutation({ mutationFn: (id) => del(`/api/account/reviews/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['acct', 'reviews'] }), onError: (e) => toast.error(errMsg(e)) });
  return <div><Head title="Your reviews" />{isLoading ? <Skeleton className="h-32" /> : !data.items.length ? <EmptyState icon="star" title="No reviews yet" body="Write a review from any watch page." /> : <ul className="divide-y rule border-y rule">{data.items.map((r) => <li key={r.id} className="py-4"><div className="flex flex-wrap items-center gap-3"><Link to={`/watches/${r.productSlug}`} className="font-semibold hover:text-champagne">{r.productName}</Link><Stars value={r.rating} count={1} /><Badge tone={r.status === 'APPROVED' ? 'ok' : r.status === 'REJECTED' ? 'danger' : 'warn'}>{r.status === 'PENDING' ? 'Awaiting approval' : r.status.toLowerCase()}</Badge></div>{r.title && <p className="mt-1">{r.title}</p>}<p className="muted text-sm">{r.body}</p><button className="muted mt-2 text-sm hover:text-danger" onClick={() => window.confirm('Delete this review?') && rm.mutate(r.id)}>Delete</button></li>)}</ul>}</div>;
}

function Notifications() {
  const qc = useQueryClient();
  const { data, isLoading } = useAcct('notifications', '/api/account/notifications');
  const read = useMutation({ mutationFn: () => post('/api/account/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['acct', 'notifications'] }) });
  return <div><Head title="Notifications">{data?.unread > 0 && <button className="btn btn-line btn-sm" onClick={() => read.mutate()}>Mark all read</button>}</Head>{isLoading ? <Skeleton className="h-32" /> : !data.items.length ? <EmptyState icon="bell" title="No notifications" /> : <ul className="divide-y rule border-y rule">{data.items.map((n) => <li key={n.id} className="flex gap-3 py-4"><span className={cx('mt-2 size-2 shrink-0 rounded-full', n.readAt ? 'bg-smoke' : 'bg-champagne')} /><div><p className={n.readAt ? 'muted' : 'font-semibold'}>{n.title}</p>{n.body && <p className="muted text-sm">{n.body}</p>}<p className="muted text-[.78rem]">{dateFmt(n.createdAt)}</p></div></li>)}</ul>}</div>;
}

function Support() {
  const { data, isLoading } = useAcct('support', '/api/account/support');
  return <div><Head title="Support requests"><Link to="/contact" className="btn btn-gold btn-sm">New request</Link></Head>{isLoading ? <Skeleton className="h-32" /> : !data.items.length ? <EmptyState icon="headset" title="No requests" body="Contact, warranty and service requests you send while signed in appear here." /> : <div className="overflow-x-auto"><table className="table-lux"><thead><tr><th>Reference</th><th>Type</th><th>Subject</th><th>Status</th><th>Date</th></tr></thead><tbody>{data.items.map((r) => <tr key={r.reference}><td>{r.reference}</td><td>{r.type.toLowerCase()}</td><td>{r.subject}</td><td>{r.status.toLowerCase().replace('_', ' ')}</td><td>{dateFmt(r.createdAt)}</td></tr>)}</tbody></table></div>}</div>;
}

function Profile() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const prefs = useAcct('prefs', '/api/account/notification-prefs');
  const [name, setName] = useState(me.name);
  const [phone, setPhone] = useState(me.phone ?? '');
  const save = useMutation({ mutationFn: (b) => patch('/api/account/profile', b), onSuccess: (r) => { qc.setQueryData(['me'], r.user); qc.invalidateQueries({ queryKey: ['acct', 'prefs'] }); toast.ok('Saved.'); }, onError: (e) => toast.error(errMsg(e)) });
  const p = prefs.data?.notificationPrefs;
  return (
    <div className="max-w-lg"><Head title="Profile" />
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ name, phone: phone || null }); }}>
        <Field label="Email"><input className="input" value={me.email} disabled readOnly /></Field>
        <Field label="Name"><input className="input" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <button className="btn btn-gold" disabled={save.isPending}>Save changes</button>
      </form>
      {p && <fieldset className="mt-10 space-y-2"><legend className="mb-2 text-xl">Email preferences</legend>{[['orderUpdates', 'Order updates'], ['offers', 'Offers and news'], ['restock', 'Restock alerts']].map(([k, l]) => <label key={k} className="flex items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-[var(--color-champagne)]" checked={p[k]} onChange={(e) => save.mutate({ notificationPrefs: { ...p, [k]: e.target.checked } })} />{l}</label>)}</fieldset>}
    </div>
  );
}

function Security() {
  const nav = useNavigate();
  const { logout } = useAuthActions();
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const m = useMutation({ mutationFn: () => post('/api/auth/change-password', f), onSuccess: () => { toast.ok('Password changed.'); setF({ currentPassword: '', newPassword: '' }); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div className="max-w-lg"><Head title="Security" />
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="Current password"><input className="input" type="password" required autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
        <Field label="New password" hint="At least 10 characters with an upper-case letter, a lower-case letter and a number."><input className="input" type="password" required minLength={10} autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
        <button className="btn btn-gold" disabled={m.isPending}>Change password</button>
      </form>
      <button className="btn btn-line mt-10" onClick={() => logout.mutate(undefined, { onSettled: () => nav('/') })}><Icon name="logout" size={17} />Sign out</button>
    </div>
  );
}

export function AccountRoutes() {
  const { data: me, isLoading } = useMe();
  const loc = useLocation();
  if (isLoading) return <div className="wrap py-16"><Skeleton className="h-64" /></div>;
  if (!me) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return (
    <div className="wrap py-10">
      <Seo title="My account" noindex />
      <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Account" className="flex gap-1 overflow-x-auto lg:flex-col">
          {NAV.map(([to, l]) => <NavLink key={to} to={`/account/${to}`.replace(/\/$/, '')} end className={({ isActive }) => cx('whitespace-nowrap border-l-2 px-4 py-2 text-[.92rem]', isActive ? 'border-champagne text-champagne' : 'border-transparent muted hover:text-ivory')}>{l}</NavLink>)}
          {(me.role === 'MANAGER' || me.role === 'SUPER_ADMIN') && <Link to={me.role === 'SUPER_ADMIN' ? '/admin' : '/manager'} className="border-l-2 border-transparent px-4 py-2 text-[.92rem] text-champagne">Staff panel</Link>}
        </nav>
        <div className="min-w-0">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:orderNumber" element={<OrderDetail />} />
            <Route path="wishlist" element={<WishlistTab />} />
            <Route path="addresses" element={<Addresses />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="support" element={<Support />} />
            <Route path="profile" element={<Profile />} />
            <Route path="security" element={<Security />} />
            <Route path="*" element={<Navigate to="/account" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
