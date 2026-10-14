import { useState } from 'react';
import { Link } from 'react-router-dom';
import { money } from '@/lib/format';
import { useCart, useCartActions, useSite } from '@/lib/hooks';
import { Seo } from '@/lib/seo';
import { Breadcrumbs, EmptyState, Icon, QtyStepper, Skeleton } from '@/components/ui';
import { ProductImage } from '@/components/ProductCard';

export function Totals({ totals, taxLabel }) {
  const row = (k, v, strong) => <div className={`flex justify-between gap-4 ${strong ? 'border-t rule pt-3 text-lg font-semibold' : ''}`}><dt className={strong ? '' : 'muted'}>{k}</dt><dd className="tabular-nums">{v}</dd></div>;
  return (
    <dl className="space-y-2 text-[.92rem]">
      {row('Subtotal', money(totals.subtotalMinor))}
      {totals.discountMinor > 0 && row('Discount', `− ${money(totals.discountMinor)}`)}
      {row('Delivery', totals.shippingMinor ? money(totals.shippingMinor) : 'Free')}
      {totals.giftWrapMinor > 0 && row('Gift wrap', money(totals.giftWrapMinor))}
      {row('Total', money(totals.totalMinor), true)}
      {taxLabel && <p className="muted text-[.78rem]">Includes {taxLabel}{totals.taxMinor ? `: ${money(totals.taxMinor)}` : ''}</p>}
    </dl>
  );
}

export function CouponBox({ nested = false }) {
  const { data: cart } = useCart();
  const { applyCoupon, removeCoupon } = useCartActions();
  const [code, setCode] = useState('');
  if (cart?.coupon) return <div className="flex items-center justify-between border border-champagne/40 px-3 py-2 text-sm"><span><Icon name="check" size={15} className="mr-1 inline text-ok" />{cart.coupon.code} applied</span><button className="font-semibold text-champagne hover:underline" onClick={() => removeCoupon.mutate()}>Remove</button></div>;
  const apply = () => { if (code.trim()) applyCoupon.mutate(code.trim(), { onSuccess: () => setCode('') }); };
  const inner = (
    <>
      <label className="sr-only" htmlFor={nested ? 'coupon-co' : 'coupon'}>Coupon code</label>
      <input id={nested ? 'coupon-co' : 'coupon'} className="input uppercase" placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={nested ? (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } } : undefined} />
      <button type={nested ? 'button' : 'submit'} onClick={nested ? apply : undefined} className="btn btn-line shrink-0" disabled={applyCoupon.isPending}>Apply</button>
    </>
  );
  return nested ? <div className="flex gap-2">{inner}</div> : <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); apply(); }}>{inner}</form>;
}

export function CartPage() {
  const { data: cart, isLoading } = useCart();
  const { setQty, remove } = useCartActions();
  const { data: site } = useSite();
  return (
    <>
      <Seo title="Your cart" noindex />
      <div className="wrap py-12">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart' }]} className="mb-5" />
        <h1 className="text-[clamp(2.2rem,5vw,3.6rem)]">Your cart</h1>
        {isLoading ? <Skeleton className="mt-8 h-64" /> : !cart?.lines.length ? (
          <EmptyState icon="bag" title="Your cart is empty" body="Find something you'll wear for years." action={<Link to="/shop" className="btn btn-gold">Browse watches</Link>} />
        ) : (
          <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_24rem]">
            <ul className="divide-y rule border-y rule">
              {cart.lines.map((l) => (
                <li key={l.variantId} className="grid grid-cols-[6rem_1fr] gap-4 py-5 sm:grid-cols-[8rem_1fr]">
                  <Link to={`/watches/${l.slug}`}><ProductImage product={l} className="aspect-square" /></Link>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between gap-4">
                      <div><p className="muted text-[.8rem]">{l.brandName}</p><Link to={`/watches/${l.slug}`} className="text-lg leading-tight hover:text-champagne">{l.name}</Link></div>
                      <p className="tabular-nums">{money(l.lineTotalMinor)}</p>
                    </div>
                    {l.issue && <p className="text-[.84rem] text-warn" role="alert">{l.issue}</p>}
                    <div className="mt-auto flex items-center gap-4">
                      <QtyStepper value={l.quantity} max={Math.max(1, Math.min(10, l.available))} onChange={(q) => setQty.mutate({ variantId: l.variantId, quantity: q })} disabled={setQty.isPending} size="sm" />
                      <button className="muted flex items-center gap-1 text-[.84rem] hover:text-danger" onClick={() => remove.mutate(l.variantId)}><Icon name="trash" size={15} />Remove</button>
                      <span className="muted text-[.8rem] max-sm:hidden">{money(l.unitPriceMinor)} each</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <aside className="h-fit space-y-5 border rule bg-coal p-6 lg:sticky lg:top-28" aria-label="Order summary">
              <h2 className="text-xl">Summary</h2>
              <CouponBox />
              {cart.couponError && <p className="field-error">{cart.couponError}</p>}
              <Totals totals={cart.totals} taxLabel={cart.taxLabel ?? site?.taxLabel} />
              {cart.hasIssues ? <p className="text-[.84rem] text-warn">Resolve the items marked above to continue.</p> : <Link to="/checkout" className="btn btn-gold w-full">Checkout</Link>}
              <Link to="/shop" className="block text-center text-[.88rem] text-champagne hover:underline">Continue shopping</Link>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
