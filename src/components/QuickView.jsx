import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MOVEMENT_LABEL, cx } from '@/lib/format';
import { useCartActions, useProduct, useWishlist } from '@/lib/hooks';
import { useUi } from '@/lib/store';
import { Badge, Icon, Modal, Skeleton } from './ui';
import { Price, ProductImage } from './ProductCard';

/** Adds the chosen variant to the cart. A watch with no price cannot be bought online. */
export function AddToCart({ product, variant, className, block = true }) {
  const { add } = useCartActions();
  const setCartOpen = useUi((s) => s.setCartOpen);
  const priceless = product.priceMinor == null;
  const out = !priceless && (variant ? variant.available <= 0 : product.available <= 0);
  if (priceless) return <Link to="/contact" className={cx('btn btn-gold', block && 'w-full', className)}>Enquire about this watch</Link>;
  return (
    <button
      className={cx('btn btn-gold', block && 'w-full', className)}
      disabled={out || add.isPending || !variant}
      onClick={() => add.mutate({ variantId: variant.id, quantity: 1 }, { onSuccess: () => setCartOpen(true) })}
    >
      <Icon name="bag" size={18} />{out ? 'Sold out' : add.isPending ? 'Adding…' : 'Add to cart'}
    </button>
  );
}

export function QuickView({ slug, onClose }) {
  const { data, isLoading, error } = useProduct(slug);
  const wish = useWishlist();
  const p = data?.product;
  const [vid, setVid] = useState(null);
  const variant = p?.variants?.find((v) => v.id === vid) ?? p?.variants?.[0];
  return (
    <Modal open={Boolean(slug)} onClose={onClose} title={p ? `${p.brandName} ${p.name}` : 'Quick view'} wide>
      {isLoading && <div className="grid gap-6 sm:grid-cols-2"><Skeleton className="aspect-square" /><Skeleton className="h-64" /></div>}
      {error && <p role="alert">This watch could not be loaded.</p>}
      {p && (
        <div className="grid gap-6 sm:grid-cols-2">
          <ProductImage product={p} className="aspect-square" label={p.name} />
          <div className="flex flex-col gap-3">
            <p className="muted">{p.brandName}{p.collectionName ? ` · ${p.collectionName}` : ''}</p>
            <h3 className="text-2xl">{p.name}</h3>
            <Price product={p} size="lg" />
            <div className="flex flex-wrap gap-2">
              {p.isLimitedEdition && <Badge tone="line">Limited edition</Badge>}
              {p.priceMinor != null && p.available <= 0 && <Badge tone="mute">Sold out</Badge>}
            </div>
            <dl className="muted grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[.88rem]">
              {p.movement && <><dt>Movement</dt><dd className="text-ivory">{MOVEMENT_LABEL[p.movement] ?? p.movement}</dd></>}
              {p.caseDiameterMm && <><dt>Case</dt><dd className="text-ivory">{Number(p.caseDiameterMm)} mm</dd></>}
              {p.waterResistanceM != null && <><dt>Water resistance</dt><dd className="text-ivory">{p.waterResistanceM} m</dd></>}
            </dl>
            {p.variants.length > 1 && (
              <fieldset><legend className="label">Option</legend>
                <div className="flex flex-wrap gap-2">{p.variants.map((v) => <button key={v.id} type="button" onClick={() => setVid(v.id)} aria-pressed={v.id === variant?.id} disabled={v.available <= 0} className={cx('btn btn-sm', v.id === variant?.id ? 'btn-gold' : 'btn-line')}>{v.label}</button>)}</div>
              </fieldset>
            )}
            <div className="mt-auto flex flex-col gap-2 pt-2">
              <AddToCart product={p} variant={variant} />
              <div className="flex gap-2">
                <button className="btn btn-line flex-1" aria-pressed={wish.has(p.slug)} onClick={() => wish.toggle(p.slug)}><Icon name="heart" size={17} className={wish.has(p.slug) ? 'fill-current text-champagne' : ''} />{wish.has(p.slug) ? 'Saved' : 'Save'}</button>
                <Link to={`/watches/${p.slug}`} onClick={onClose} className="btn btn-line flex-1">Full details</Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
