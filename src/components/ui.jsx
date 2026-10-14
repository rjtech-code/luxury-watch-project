import { createContext, useContext, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { cx } from '@/lib/format';
import { useUi } from '@/lib/store';

export const Icon = ({ name, size = 20, className, ...rest }) => {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    search: <><circle cx="11" cy="11" r="7" {...p} /><path d="m20 20-3.5-3.5" {...p} /></>,
    user: <><circle cx="12" cy="8" r="4" {...p} /><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" {...p} /></>,
    heart: <path d="M12 20s-7-4.6-9-9.2C1.8 7.4 3.7 4.5 6.8 4.5c1.9 0 3.4 1 5.2 3 1.8-2 3.3-3 5.2-3 3.1 0 5 2.9 3.8 6.3-2 4.6-9 9.2-9 9.2Z" {...p} />,
    bag: <><path d="M5 8h14l-1 12H6L5 8Z" {...p} /><path d="M9 8V6a3 3 0 0 1 6 0v2" {...p} /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" {...p} />,
    close: <path d="M6 6l12 12M18 6 6 18" {...p} />,
    chevron: <path d="m6 9 6 6 6-6" {...p} />,
    chevronR: <path d="m9 6 6 6-6 6" {...p} />,
    chevronL: <path d="m15 6-6 6 6 6" {...p} />,
    plus: <path d="M12 5v14M5 12h14" {...p} />,
    minus: <path d="M5 12h14" {...p} />,
    check: <path d="m5 12 5 5 9-10" {...p} />,
    filter: <path d="M4 6h16M7 12h10M10 18h4" {...p} />,
    grid: <><rect x="4" y="4" width="6.5" height="6.5" {...p} /><rect x="13.5" y="4" width="6.5" height="6.5" {...p} /><rect x="4" y="13.5" width="6.5" height="6.5" {...p} /><rect x="13.5" y="13.5" width="6.5" height="6.5" {...p} /></>,
    list: <path d="M4 6h16M4 12h16M4 18h16" {...p} />,
    eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" {...p} /><circle cx="12" cy="12" r="3" {...p} /></>,
    compare: <><path d="M8 4v16M16 4v16" {...p} /><path d="m4 8 4-4 4 4M12 16l4 4 4-4" {...p} /></>,
    share: <><circle cx="18" cy="5" r="2.5" {...p} /><circle cx="6" cy="12" r="2.5" {...p} /><circle cx="18" cy="19" r="2.5" {...p} /><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" {...p} /></>,
    truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" {...p} /><circle cx="7" cy="17.5" r="1.8" {...p} /><circle cx="17" cy="17.5" r="1.8" {...p} /></>,
    shield: <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" {...p} />,
    return: <><path d="M9 14 4 9l5-5" {...p} /><path d="M4 9h10a6 6 0 0 1 0 12h-3" {...p} /></>,
    headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" {...p} /><rect x="3" y="14" width="4" height="6" rx="1" {...p} /><rect x="17" y="14" width="4" height="6" rx="1" {...p} /></>,
    lock: <><rect x="5" y="11" width="14" height="9" rx="1" {...p} /><path d="M8 11V8a4 4 0 0 1 8 0v3" {...p} /></>,
    trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" {...p} />,
    edit: <path d="M4 20h4L19 9l-4-4L4 16v4Z" {...p} />,
    gift: <><rect x="4" y="9" width="16" height="11" {...p} /><path d="M3 9h18v3H3zM12 9v11M12 9S10 4 7.5 5 9 9 12 9Zm0 0s2-5 4.5-4S15 9 12 9Z" {...p} /></>,
    box: <path d="m3 8 9-5 9 5v8l-9 5-9-5V8Zm0 0 9 5 9-5M12 13v8" {...p} />,
    rotate: <><path d="M20 12a8 8 0 1 1-2.5-5.8" {...p} /><path d="M20 4v5h-5" {...p} /></>,
    expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...p} />,
    zoomIn: <><circle cx="11" cy="11" r="7" {...p} /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" {...p} /></>,
    zoomOut: <><circle cx="11" cy="11" r="7" {...p} /><path d="m20 20-3.5-3.5M8 11h6" {...p} /></>,
    logout: <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" {...p} />,
    bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Zm4 4a2 2 0 0 0 4 0" {...p} />,
    star: <path d="m12 3 2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8L12 3Z" {...p} />,
    mapPin: <><path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11Z" {...p} /><circle cx="12" cy="10" r="2.5" {...p} /></>,
    download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" {...p} />,
    alert: <><path d="M12 4 2.5 20h19L12 4Z" {...p} /><path d="M12 10v4.5M12 17.5v.01" {...p} /></>,
    info: <><circle cx="12" cy="12" r="9" {...p} /><path d="M12 11v5M12 8v.01" {...p} /></>,
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true" focusable="false" {...rest}>
      {paths[name] ?? null}
    </svg>
  );
};

export const Spinner = ({ className }) => (
  <svg viewBox="0 0 24 24" className={cx('size-5 animate-spin', className)} aria-label="Loading" role="status">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" opacity=".25" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export const Skeleton = ({ className }) => <div className={cx('skeleton', className)} aria-hidden="true" />;

export function EmptyState({ title, body, action, icon = 'box', className }) {
  return (
    <div className={cx('mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center', className)}>
      <Icon name={icon} size={34} className="text-champagne-deep" />
      <h3 className="mt-5 text-2xl">{title}</h3>
      {body && <p className="muted mt-2 text-[.95rem]">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }) {
  return (
    <EmptyState
      icon="alert"
      title="We couldn't load this"
      body={error?.message ?? 'Check your connection and try again.'}
      action={retry && <button className="btn btn-line" onClick={retry}>Try again</button>}
    />
  );
}

export function Field({ label, error, hint, children, className, htmlFor }) {
  const id = useId();
  const child = children && typeof children === 'object' && 'type' in children ? { ...children, props: { id: htmlFor ?? id, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': error ? `${id}-e` : undefined, ...children.props } } : children;
  return (
    <div className={className}>
      {label && <label className="label" htmlFor={htmlFor ?? id}>{label}</label>}
      {child}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p id={`${id}-e`} className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function Stars({ value = 0, count, size = 14 }) {
  if (!count) return null;
  const v = Number(value);
  return (
    <span className="inline-flex items-center gap-1.5 text-[.8rem]" aria-label={`${v.toFixed(1)} out of 5 from ${count} reviews`}>
      <span className="inline-flex text-champagne-deep" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <svg key={i} viewBox="0 0 24 24" width={size} height={size}>
            <defs><linearGradient id={`g${i}`}><stop offset={`${Math.max(0, Math.min(1, v - (i - 1))) * 100}%`} stopColor="currentColor" /><stop offset={`${Math.max(0, Math.min(1, v - (i - 1))) * 100}%`} stopColor="transparent" /></linearGradient></defs>
            <path d="m12 3 2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8L12 3Z" fill={`url(#g${i})`} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        ))}
      </span>
      <span className="muted">({count})</span>
    </span>
  );
}

export const Badge = ({ children, tone = 'gold', className }) => (
  <span className={cx('inline-flex items-center px-2 py-0.5 text-[.72rem] font-semibold leading-5', tone === 'gold' && 'bg-champagne text-ink', tone === 'line' && 'border border-champagne/50 text-champagne', tone === 'danger' && 'bg-danger/15 text-danger', tone === 'ok' && 'bg-ok/15 text-ok', tone === 'warn' && 'bg-warn/15 text-warn', tone === 'mute' && 'bg-smoke text-ash', className)}>{children}</span>
);

export function Breadcrumbs({ items, className }) {
  return (
    <nav aria-label="Breadcrumb" className={cx('text-[.82rem]', className)}>
      <ol className="muted flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            {i > 0 && <Icon name="chevronR" size={12} />}
            {it.to ? <Link to={it.to} className="hover:text-champagne">{it.label}</Link> : <span aria-current="page" className="text-inherit opacity-90">{it.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
  const withGaps = nums.reduce((a, n, i) => (i && n - nums[i - 1] > 1 ? [...a, '…', n] : [...a, n]), []);
  const btn = 'grid size-10 place-items-center border text-sm transition-colors';
  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-1.5">
      <button className={cx(btn, 'rule hover:border-champagne disabled:opacity-40')} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><Icon name="chevronL" size={16} /></button>
      {withGaps.map((n, i) => n === '…' ? <span key={`g${i}`} className="px-1 muted">…</span> : (
        <button key={n} onClick={() => onChange(n)} aria-current={n === page ? 'page' : undefined} className={cx(btn, n === page ? 'border-champagne bg-champagne text-ink' : 'rule hover:border-champagne')}>{n}</button>
      ))}
      <button className={cx(btn, 'rule hover:border-champagne disabled:opacity-40')} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><Icon name="chevronR" size={16} /></button>
    </nav>
  );
}

export function QtyStepper({ value, onChange, min = 1, max = 10, disabled, size = 'md' }) {
  const b = cx('grid place-items-center transition-colors hover:text-champagne disabled:opacity-35', size === 'sm' ? 'size-8' : 'size-11');
  return (
    <div className={cx('inline-flex items-center border rule', size === 'sm' ? 'h-8' : 'h-11')} role="group" aria-label="Quantity">
      <button type="button" className={b} onClick={() => onChange(value - 1)} disabled={disabled || value <= min} aria-label="Decrease quantity"><Icon name="minus" size={14} /></button>
      <span className="min-w-8 text-center text-sm tabular-nums" aria-live="polite">{value}</span>
      <button type="button" className={b} onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label="Increase quantity"><Icon name="plus" size={14} /></button>
    </div>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible overlay: portal, scroll lock, Escape to close, focus trap and focus return. */
function Overlay({ open, onClose, label, children, panelClass, wrapClass }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const node = ref.current;
    (node.querySelector('[data-autofocus]') ?? node.querySelector(FOCUSABLE) ?? node)?.focus?.();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key !== 'Tab') return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className={cx('fixed inset-0 z-[80] flex', wrapClass)}>
      <div className="anim-fade absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={panelClass}>{children}</div>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, children, wide, light }) {
  return (
    <Overlay open={open} onClose={onClose} label={title} wrapClass="items-end justify-center sm:items-center p-0 sm:p-6" panelClass={cx('anim-sheet sm:anim-fade relative max-h-[92dvh] w-full overflow-y-auto border rule shadow-2xl sm:max-w-xl', wide && 'sm:max-w-4xl', light ? 'on-light bg-paper text-umber' : 'bg-charcoal')}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b rule bg-inherit px-5 py-4 sm:px-6">
        <h2 className="text-xl">{title}</h2>
        <button onClick={onClose} className="grid size-9 place-items-center hover:text-champagne" aria-label="Close"><Icon name="close" /></button>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </Overlay>
  );
}

export function Drawer({ open, onClose, title, children, side = 'right', footer }) {
  return (
    <Overlay open={open} onClose={onClose} label={title} wrapClass={side === 'right' ? 'justify-end' : 'items-end'} panelClass={cx('relative flex flex-col bg-charcoal shadow-2xl', side === 'right' ? 'anim-slide h-full w-full max-w-md border-l rule' : 'anim-sheet max-h-[88dvh] w-full border-t rule')}>
      <div className="flex items-center justify-between border-b rule px-5 py-4">
        <h2 className="text-xl">{title}</h2>
        <button onClick={onClose} className="grid size-9 place-items-center hover:text-champagne" aria-label="Close"><Icon name="close" /></button>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="border-t rule px-5 py-4">{footer}</div>}
    </Overlay>
  );
}

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[95] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx('anim-sheet pointer-events-auto flex max-w-md items-start gap-3 border bg-charcoal px-4 py-3 text-sm shadow-xl', t.kind === 'error' ? 'border-danger/60' : t.kind === 'ok' ? 'border-champagne/50' : 'rule')}>
          <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'ok' ? 'check' : 'info'} size={18} className={t.kind === 'error' ? 'text-danger' : 'text-champagne'} />
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="text-ash hover:text-ivory" aria-label="Dismiss"><Icon name="close" size={16} /></button>
        </div>
      ))}
    </div>
  );
}

export function Disclosure({ title, children, defaultOpen, className }) {
  return (
    <details className={cx('group border-b rule', className)} open={defaultOpen}>
      <summary className="flex list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <Icon name="chevron" size={18} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-5 text-[.93rem] leading-relaxed">{children}</div>
    </details>
  );
}

export function SectionHead({ title, sub, action, className }) {
  return (
    <div className={cx('mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-3', className)}>
      <div>
        <h2 className="text-[clamp(1.8rem,3.2vw,2.6rem)]">{title}</h2>
        {sub && <p className="muted mt-2 max-w-xl">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

const TabsCtx = createContext(null);
export const useTabs = () => useContext(TabsCtx);
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cx('flex gap-1 overflow-x-auto border-b rule scrollbar-thin', className)}>
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)} className={cx('whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors', value === t.value ? 'border-champagne text-champagne' : 'border-transparent muted hover:text-ivory')}>{t.label}</button>
      ))}
    </div>
  );
}
