import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PAYMENT_LABEL, STATUS_LABEL, cx, dateTimeFmt, money } from '@/lib/format';
import { ApiError, get, post } from '@/lib/api';
import { errMsg, useCart, useMe } from '@/lib/hooks';
import { Seo } from '@/lib/seo';
import { Breadcrumbs, EmptyState, ErrorState, Field, Icon, Skeleton, Spinner } from '@/components/ui';
import { ProductImage } from '@/components/ProductCard';
import { CouponBox, Totals } from './Cart';

const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'];
const key = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-xxxxxxxx`);

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const EMPTY_ADDR = { fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '' };

export function Checkout() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: cart, isLoading } = useCart();
  const opts = useQuery({ queryKey: ['checkout-options'], queryFn: () => get('/api/checkout/options'), staleTime: 60_000 });
  const addrs = useQuery({ queryKey: ['addresses'], queryFn: () => get('/api/account/addresses'), enabled: Boolean(me) });
  const [contact, setContact] = useState({ email: '', phone: '' });
  const [addr, setAddr] = useState(EMPTY_ADDR);
  const [delivery, setDelivery] = useState('standard');
  const [pay, setPay] = useState(null);
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);
  const idem = useRef(key());

  useEffect(() => { if (me) setContact((c) => ({ email: c.email || me.email, phone: c.phone || me.phone || '' })); }, [me]);
  useEffect(() => {
    const d = addrs.data?.items?.find((a) => a.isDefault) ?? addrs.data?.items?.[0];
    if (d && !addr.line1) setAddr({ fullName: d.fullName, phone: d.phone, line1: d.line1, line2: d.line2 ?? '', city: d.city, state: d.state, postalCode: d.postalCode });
  }, [addrs.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!pay && opts.data) setPay(opts.data.payments.razorpay ? 'razorpay' : opts.data.payments.cod ? 'cod' : null); }, [opts.data, pay]);

  const quote = useQuery({
    queryKey: ['quote', delivery, isGift, cart?.itemCount, cart?.coupon?.code],
    queryFn: () => post('/api/checkout/quote', { deliveryMethod: delivery, isGift }),
    enabled: Boolean(cart?.lines.length),
    placeholderData: (p) => p,
  });

  const validate = () => {
    const e = {};
    if (!/^\S+@\S+\.\S+$/.test(contact.email)) e.email = 'Enter a valid email address.';
    if (!/^\+?[0-9\s-]{8,15}$/.test(contact.phone)) e.phone = 'Enter a valid phone number.';
    if (addr.fullName.trim().length < 2) e.fullName = 'Enter the recipient name.';
    if (!/^\+?[0-9\s-]{8,15}$/.test(addr.phone)) e.aphone = 'Enter a valid phone number.';
    if (addr.line1.trim().length < 3) e.line1 = 'Enter the street address.';
    if (addr.city.trim().length < 2) e.city = 'Enter the city.';
    if (!addr.state) e.state = 'Choose a state.';
    if (!/^[1-9][0-9]{5}$/.test(addr.postalCode)) e.postalCode = 'Enter a valid 6-digit PIN code.';
    if (!pay) e.pay = 'No payment method is available right now.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setBanner(null);
    if (!validate()) { document.querySelector('[aria-invalid="true"]')?.focus(); return; }
    setBusy(true);
    try {
      const r = await post('/api/checkout/place', {
        contactEmail: contact.email, contactPhone: contact.phone,
        shippingAddress: { ...addr, line2: addr.line2 || null, country: 'IN' },
        deliveryMethod: delivery, paymentMethod: pay, isGift, ...(isGift && giftMessage ? { giftMessage } : {}), ...(notes ? { notes } : {}),
        idempotencyKey: idem.current,
      });
      qc.invalidateQueries({ queryKey: ['cart'] });
      const orderNumber = r.order.orderNumber;
      const grant = { state: { contact: contact.email } };
      if (pay === 'cod' || !r.gateway) return nav(`/order/${orderNumber}`, grant);
      if (!(await loadRazorpay())) { setBanner('The payment window could not be loaded. Check your connection and use “Pay now” from your order page.'); return nav(`/order/${orderNumber}`, grant); }
      const rzp = new window.Razorpay({
        key: r.gateway.keyId, amount: r.gateway.amountMinor, currency: r.gateway.currency, order_id: r.gateway.razorpayOrderId, name: 'Time Luxe', description: `Order ${orderNumber}`,
        prefill: { name: addr.fullName, email: contact.email, contact: contact.phone },
        theme: { color: '#d2b57b' },
        handler: async (resp) => {
          try { await post('/api/payments/razorpay/verify', resp); } catch { /* the webhook will still confirm; the confirmation page polls */ }
          nav(`/order/${orderNumber}`, grant);
        },
        modal: { ondismiss: () => { setBusy(false); nav(`/order/${orderNumber}`, grant); } },
      });
      rzp.on('payment.failed', () => setBanner('The payment did not go through. You can retry from your order page before the order expires.'));
      rzp.open();
    } catch (e) {
      setBanner(e instanceof ApiError ? e.message : errMsg(e));
      if (e instanceof ApiError && e.details?.fieldErrors) setErrors(e.details.fieldErrors);
      qc.invalidateQueries({ queryKey: ['cart'] });
    } finally { setBusy(false); }
  };

  if (isLoading || opts.isLoading) return <div className="wrap py-16"><Skeleton className="h-96" /></div>;
  if (!cart?.lines.length) return <EmptyState icon="bag" title="Your cart is empty" action={<Link to="/shop" className="btn btn-gold">Browse watches</Link>} />;
  const o = opts.data;
  const totals = quote.data?.totals ?? cart.totals;
  const a = (k) => (e) => setAddr({ ...addr, [k]: e.target.value });
  const noPay = !o.payments.razorpay && !o.payments.cod;

  return (
    <>
      <Seo title="Checkout" noindex />
      <form className="wrap py-12" onSubmit={submit} noValidate>
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart', to: '/cart' }, { label: 'Checkout' }]} className="mb-5" />
        <h1 className="text-[clamp(2.2rem,5vw,3.6rem)]">Checkout</h1>
        {!me && <p className="muted mt-2">Checking out as a guest. <Link to="/login" state={{ from: '/checkout' }} className="text-champagne underline underline-offset-4">Sign in</Link> to use saved addresses.</p>}
        {banner && <p role="alert" className="mt-6 border border-danger/50 bg-danger/10 px-4 py-3 text-sm">{banner}</p>}
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_26rem]">
          <div className="space-y-10">
            <fieldset className="space-y-4"><legend className="mb-2 text-2xl">1 · Contact</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" error={errors.email}><input className="input" type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
                <Field label="Phone" error={errors.phone}><input className="input" type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
              </div>
            </fieldset>

            <fieldset className="space-y-4"><legend className="mb-2 text-2xl">2 · Delivery address</legend>
              {addrs.data?.items?.length > 1 && (
                <Field label="Saved addresses"><select className="input" onChange={(e) => { const s = addrs.data.items.find((x) => x.id === e.target.value); if (s) setAddr({ fullName: s.fullName, phone: s.phone, line1: s.line1, line2: s.line2 ?? '', city: s.city, state: s.state, postalCode: s.postalCode }); }} defaultValue=""><option value="" disabled>Choose…</option>{addrs.data.items.map((s) => <option key={s.id} value={s.id}>{s.label || s.line1}, {s.city}</option>)}</select></Field>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" error={errors.fullName}><input className="input" autoComplete="name" value={addr.fullName} onChange={a('fullName')} /></Field>
                <Field label="Recipient phone" error={errors.aphone}><input className="input" type="tel" autoComplete="tel" value={addr.phone} onChange={a('phone')} /></Field>
                <Field label="Address line 1" error={errors.line1} className="sm:col-span-2"><input className="input" autoComplete="address-line1" value={addr.line1} onChange={a('line1')} /></Field>
                <Field label="Address line 2 (optional)" className="sm:col-span-2"><input className="input" autoComplete="address-line2" value={addr.line2} onChange={a('line2')} /></Field>
                <Field label="City" error={errors.city}><input className="input" autoComplete="address-level2" value={addr.city} onChange={a('city')} /></Field>
                <Field label="State" error={errors.state}><select className="input" autoComplete="address-level1" value={addr.state} onChange={a('state')}><option value="">Select…</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
                <Field label="PIN code" error={errors.postalCode}><input className="input" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={addr.postalCode} onChange={a('postalCode')} /></Field>
                <Field label="Country"><input className="input" value="India" disabled readOnly /></Field>
              </div>
            </fieldset>

            <fieldset className="space-y-3"><legend className="mb-2 text-2xl">3 · Delivery method</legend>
              {o.delivery.map((d) => (
                <label key={d.key} className={cx('flex cursor-pointer items-center gap-4 border p-4', delivery === d.key ? 'border-champagne bg-champagne/5' : 'rule hover:border-champagne/50')}>
                  <input type="radio" name="delivery" className="accent-[var(--color-champagne)]" checked={delivery === d.key} onChange={() => setDelivery(d.key)} />
                  <span className="flex-1"><span className="block font-semibold">{d.label}</span><span className="muted text-[.84rem]">{d.etaDays ? `Estimated ${d.etaDays} business days` : ''}{d.freeAboveMinor ? ` · free above ${money(d.freeAboveMinor)}` : ''}</span></span>
                  <span className="tabular-nums">{d.feeMinor ? money(d.feeMinor) : 'Free'}</span>
                </label>
              ))}
              {o.giftWrap?.enabled && (
                <label className="flex cursor-pointer items-center gap-3 pt-2 text-[.92rem]"><input type="checkbox" className="size-4 accent-[var(--color-champagne)]" checked={isGift} onChange={(e) => setIsGift(e.target.checked)} /><Icon name="gift" size={18} className="text-champagne" />Gift wrap {o.giftWrap.feeMinor ? `(${money(o.giftWrap.feeMinor)})` : '(free)'}</label>
              )}
              {isGift && <Field label="Gift message (optional)"><textarea className="input" maxLength={300} value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} /></Field>}
              <Field label="Order notes (optional)"><textarea className="input !min-h-20" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            </fieldset>

            <fieldset className="space-y-3"><legend className="mb-2 text-2xl">4 · Payment</legend>
              {noPay && <p className="border border-warn/50 bg-warn/10 p-4 text-sm" role="alert">Online payment is not set up on this store yet, so orders cannot be placed. Please contact us to complete your purchase.</p>}
              {o.payments.razorpay && <label className={cx('flex cursor-pointer items-center gap-4 border p-4', pay === 'razorpay' ? 'border-champagne bg-champagne/5' : 'rule')}><input type="radio" name="pay" className="accent-[var(--color-champagne)]" checked={pay === 'razorpay'} onChange={() => setPay('razorpay')} /><span className="flex-1"><span className="block font-semibold">Pay online</span><span className="muted text-[.84rem]">Cards, UPI, netbanking and wallets via Razorpay. We never see your card details.</span></span><Icon name="lock" size={18} className="text-champagne" /></label>}
              {o.payments.cod && <label className={cx('flex cursor-pointer items-center gap-4 border p-4', pay === 'cod' ? 'border-champagne bg-champagne/5' : 'rule')}><input type="radio" name="pay" className="accent-[var(--color-champagne)]" checked={pay === 'cod'} onChange={() => setPay('cod')} /><span className="flex-1"><span className="block font-semibold">Cash on delivery</span><span className="muted text-[.84rem]">Pay when the watch arrives.</span></span></label>}
              {errors.pay && <p className="field-error">{errors.pay}</p>}
            </fieldset>
          </div>

          <aside className="h-fit space-y-5 border rule bg-coal p-6 lg:sticky lg:top-28" aria-label="Order summary">
            <h2 className="text-xl">Order summary</h2>
            <ul className="max-h-64 divide-y rule overflow-y-auto scrollbar-thin">
              {cart.lines.map((l) => <li key={l.variantId} className="flex gap-3 py-3 text-sm"><ProductImage product={l} className="size-14 shrink-0" /><div className="min-w-0 flex-1"><p className="truncate">{l.name}</p><p className="muted text-[.8rem]">Qty {l.quantity}</p></div><span className="tabular-nums">{money(l.lineTotalMinor)}</span></li>)}
            </ul>
            <CouponBox nested />
            <Totals totals={totals} taxLabel={cart.taxLabel} />
            <button className="btn btn-gold w-full" disabled={busy || noPay || cart.hasIssues}>{busy ? <><Spinner className="size-4" />Processing…</> : pay === 'cod' ? 'Place order' : 'Pay now'}</button>
            <p className="muted text-center text-[.78rem]">By placing this order you agree to the <Link to="/terms" className="underline">terms</Link> and <Link to="/returns" className="underline">returns policy</Link>.</p>
          </aside>
        </div>
      </form>
    </>
  );
}

export function Timeline({ order }) {
  return (
    <ol className="space-y-4 border-l rule pl-5">
      {order.timeline.map((t, i) => (
        <li key={i} className="relative"><span className={cx('absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full', i === order.timeline.length - 1 ? 'bg-champagne' : 'bg-smoke')} /><p className="font-semibold">{STATUS_LABEL[t.status] ?? t.status}</p><p className="muted text-[.8rem]">{dateTimeFmt(t.at)}{t.note ? ` · ${t.note}` : ''}</p></li>
      ))}
    </ol>
  );
}

export function OrderView({ order, contact, onChange }) {
  const [reason, setReason] = useState('');
  const cancel = useMutation({ mutationFn: () => post('/api/orders/cancel', { orderNumber: order.orderNumber, contact, reason: reason || undefined }), onSuccess: (r) => onChange?.(r.order) });
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-3"><span className="border border-champagne/50 px-3 py-1 text-sm font-semibold text-champagne">{STATUS_LABEL[order.status] ?? order.status}</span><span className="muted text-sm">Payment: {PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus}{order.paymentProvider ? ` (${order.paymentProvider})` : ''}</span></div>
        {order.shipment && <div className="border rule p-4 text-sm"><p className="font-semibold">Shipment</p><p className="muted">{order.shipment.carrier} · {order.shipment.trackingNumber}{order.shipment.trackingUrl && <> · <a className="text-champagne underline" href={order.shipment.trackingUrl} target="_blank" rel="noreferrer noopener">Track with carrier</a></>}</p>{order.shipment.estimatedDeliveryAt && <p className="muted">Estimated delivery {dateTimeFmt(order.shipment.estimatedDeliveryAt)}</p>}</div>}
        <section><h2 className="mb-4 text-xl">Progress</h2><Timeline order={order} /></section>
        <section><h2 className="mb-2 text-xl">Items</h2>
          <ul className="divide-y rule border-y rule">{order.items.map((it, i) => <li key={i} className="flex gap-4 py-4"><ProductImage product={{ image: it.imageUrl, name: it.productName }} className="size-16 shrink-0" /><div className="flex-1"><p className="muted text-[.8rem]">{it.brandName}</p><p>{it.productName}</p><p className="muted text-[.84rem]">Qty {it.quantity}</p></div><span className="tabular-nums">{money(it.lineTotalMinor)}</span></li>)}</ul>
        </section>
      </div>
      <aside className="h-fit space-y-5 border rule bg-coal p-6">
        <h2 className="text-xl">Order {order.orderNumber}</h2>
        <p className="muted text-sm">Placed {dateTimeFmt(order.placedAt)}<br />Ship to {order.shippingTo.fullName}, {order.shippingTo.city}, {order.shippingTo.state} {order.shippingTo.postalCode}</p>
        <Totals totals={order.totals} />
        {order.canCancel && contact && (
          <div className="space-y-2 border-t rule pt-4"><label className="label" htmlFor="why">Cancel this order</label><input id="why" className="input" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} /><button className="btn btn-danger w-full" disabled={cancel.isPending} onClick={() => window.confirm('Cancel this order?') && cancel.mutate()}>Cancel order</button>{cancel.error && <p className="field-error">{errMsg(cancel.error)}</p>}</div>
        )}
        <p className="muted text-[.8rem]">Need help? <Link to="/contact" className="underline">Contact us</Link> with your order number.</p>
      </aside>
    </div>
  );
}

export function OrderConfirmation() {
  const { orderNumber } = useParams();
  const { state } = useLocation();
  const { data: me } = useMe();
  const contact = state?.contact ?? me?.email ?? '';
  const [tries, setTries] = useState(0);
  const q = useQuery({
    queryKey: ['order', orderNumber, contact],
    queryFn: () => get('/api/orders/track', { orderNumber, contact }),
    enabled: Boolean(contact),
    retry: false,
    refetchInterval: (query) => (query.state.data?.order?.paymentStatus === 'PENDING' && query.state.data?.order?.paymentProvider === 'razorpay' && tries < 10 ? 3000 : false),
  });
  useEffect(() => { if (q.dataUpdatedAt) setTries((n) => n + 1); }, [q.dataUpdatedAt]);
  const order = q.data?.order;
  if (!contact) return <div className="wrap py-16"><EmptyState icon="info" title={`Order ${orderNumber}`} body="Look up this order with the email or phone number used at checkout." action={<Link className="btn btn-gold" to="/track-order">Track an order</Link>} /></div>;
  if (q.isLoading) return <div className="wrap py-16"><Skeleton className="h-64" /></div>;
  if (q.error) return <ErrorState error={q.error} retry={q.refetch} />;
  const paid = order.paymentStatus === 'PAID' || order.paymentProvider === 'cod';
  return (
    <>
      <Seo title={`Order ${orderNumber}`} noindex />
      <div className="wrap py-12">
        <div className="mb-10 max-w-2xl">
          <Icon name={paid ? 'check' : 'info'} size={40} className="text-champagne" />
          <h1 className="mt-3 text-[clamp(2rem,4.5vw,3.2rem)]">{paid ? 'Thank you. Your order is placed.' : order.status === 'CANCELLED' ? 'This order was cancelled' : 'Awaiting payment confirmation'}</h1>
          <p className="muted mt-2">{paid ? `We have sent a confirmation to ${contact}. Keep your order number (${orderNumber}) to track it.` : order.status === 'CANCELLED' ? 'No payment was taken for a cancelled order.' : 'We have not received confirmation of your payment yet. This page updates automatically; unpaid orders are released after 30 minutes.'}</p>
        </div>
        <OrderView order={order} contact={contact} onChange={() => q.refetch()} />
      </div>
    </>
  );
}

export function TrackOrder() {
  const [f, setF] = useState({ orderNumber: '', contact: '' });
  const [params, setParams] = useState(null);
  const q = useQuery({ queryKey: ['track', params], queryFn: () => get('/api/orders/track', params), enabled: Boolean(params), retry: false });
  return (
    <>
      <Seo title="Track your order" description="Look up an order with your order number and the email or phone used at checkout." path="/track-order" />
      <div className="wrap py-12">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Track order' }]} className="mb-5" />
        <h1 className="text-[clamp(2.2rem,5vw,3.6rem)]">Track your order</h1>
        <form className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); setParams({ orderNumber: f.orderNumber.trim(), contact: f.contact.trim() }); }}>
          <Field label="Order number"><input className="input uppercase" required placeholder="TL-260101-ABCDE" value={f.orderNumber} onChange={(e) => setF({ ...f, orderNumber: e.target.value })} /></Field>
          <Field label="Email or phone used at checkout"><input className="input" required value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
          <button className="btn btn-gold" disabled={q.isFetching}>{q.isFetching ? 'Looking…' : 'Track'}</button>
        </form>
        <div className="mt-10">
          {q.error && <p role="alert" className="max-w-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm">{q.error.message}</p>}
          {q.data && <OrderView order={q.data.order} contact={params.contact} onChange={() => q.refetch()} />}
        </div>
      </div>
    </>
  );
}
