import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, get } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { toast } from '@/lib/store';
import { cx } from '@/lib/format';
import { ErrorState, Icon, Pagination, Skeleton, Spinner } from '@/components/ui';

export const A = '/api/admin';
export const useAdmin = (key, path, query, opts) => useQuery({ queryKey: ['admin', key, query ?? null], queryFn: () => get(`${A}${path}`, query), placeholderData: (p) => p, ...opts });

/** Mutation that toasts errors, shows success text and refreshes admin queries. */
export function useSave({ method = 'POST', path, ok = 'Saved.', onDone, keys }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars) => { const body = Object.fromEntries(Object.entries(vars ?? {}).filter(([k]) => !k.startsWith('__'))); return api(`${A}${vars?.__path ?? (typeof path === 'function' ? path(vars) : path)}`, { method, body: method === 'DELETE' ? undefined : body }); },
    onSuccess: (r, v) => { if (ok) toast.ok(ok); qc.invalidateQueries({ queryKey: ['admin'] }); onDone?.(r, v); },
    onError: (e) => toast.error(errMsg(e)),
  });
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-[clamp(1.7rem,3vw,2.3rem)]">{title}</h1>{sub && <p className="muted mt-1 text-sm">{sub}</p>}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Panel({ title, children, className }) {
  return <section className={cx('border rule bg-coal p-5', className)}>{title && <h2 className="mb-4 text-lg">{title}</h2>}{children}</section>;
}

export function Table({ query, columns, rows, empty = 'Nothing to show.', onRow, page, onPage }) {
  if (query?.isLoading) return <Skeleton className="h-64" />;
  if (query?.error) return <ErrorState error={query.error} retry={query.refetch} />;
  return (
    <>
      <div className="overflow-x-auto border rule bg-coal">
        <table className="table-lux">
          <thead><tr>{columns.map((c) => <th key={c.key} className={c.right ? 'text-right' : ''}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={columns.length} className="muted py-10 text-center">{empty}</td></tr>}
            {rows.map((r, i) => (
              <tr key={r.id ?? r.key ?? i} className={onRow ? 'cursor-pointer' : ''} onClick={onRow ? () => onRow(r) : undefined}>
                {columns.map((c) => <td key={c.key} className={cx(c.right && 'text-right tabular-nums', c.mute && 'muted')}>{c.render ? c.render(r) : r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onPage && query?.data && <Pagination page={page} pages={query.data.pages} onChange={onPage} />}
    </>
  );
}

export const SearchBox = ({ value, onChange, placeholder = 'Search…' }) => (
  <div className="relative"><Icon name="search" size={16} className="muted absolute left-3 top-1/2 -translate-y-1/2" /><input className="input !min-h-10 !pl-9" type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} /></div>
);

export const Select = ({ value, onChange, options, label, className }) => (
  <select className={cx('input !min-h-10 !w-auto', className)} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

export function Pill({ children, tone = 'mute' }) {
  const t = { ok: 'bg-ok/15 text-ok', warn: 'bg-warn/15 text-warn', danger: 'bg-danger/15 text-danger', gold: 'bg-champagne/20 text-champagne', mute: 'bg-smoke text-ash' }[tone];
  return <span className={cx('inline-flex px-2 py-0.5 text-[.74rem] font-semibold', t)}>{children}</span>;
}

export function Check({ label, checked, onChange }) {
  return <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--color-champagne)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

/** Upload a JPEG, PNG, WebP or GLB to the server and return its URL. */
export function Uploader({ onUploaded, accept = 'image/jpeg,image/png,image/webp', label = 'Upload image' }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api(`${A}/uploads`, { method: 'POST', body: fd });
      onUploaded(r.url);
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Upload failed.'); } finally { setBusy(false); }
  };
  return (
    <>
      <input ref={ref} type="file" accept={accept} className="sr-only" onChange={pick} aria-label={label} />
      <button type="button" className="btn btn-line btn-sm" disabled={busy} onClick={() => ref.current?.click()}>{busy ? <Spinner className="size-4" /> : <Icon name="plus" size={15} />}{label}</button>
    </>
  );
}

export const num = (v) => (v === '' || v == null ? null : Number(v));
export const rupees = (minor) => (minor == null ? '' : String(minor / 100));
export const toMinor = (r) => (r === '' || r == null ? null : Math.round(Number(r) * 100));
