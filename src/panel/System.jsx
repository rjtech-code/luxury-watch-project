import { useEffect, useState } from 'react';
import { dateTimeFmt, money } from '@/lib/format';
import { Field, Icon, Tabs } from '@/components/ui';
import { Check, PageHead, Panel, Pill, SearchBox, Table, useAdmin, useSave } from './kit';

function useSetting(key) {
  const q = useAdmin('settings', '/settings');
  const save = useSave({ method: 'PUT', path: `/settings/${key}`, ok: 'Settings saved.' });
  return { value: q.data?.settings?.[key], loading: q.isLoading, save: (value) => save.mutate({ value }), saving: save.isPending };
}

function Form({ title, hint, children, onSubmit, saving }) {
  return <Panel title={title}>{hint && <p className="muted mb-4 text-sm">{hint}</p>}<form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>{children}<button className="btn btn-gold btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></form></Panel>;
}

function Brand() {
  const { value, save, saving } = useSetting('brand');
  const [f, setF] = useState(null);
  useEffect(() => { if (value && !f) setF({ name: value.name, tagline: value.tagline ?? '', email: value.email ?? '', phone: value.phone ?? '', address: value.address ?? '', social: value.social ?? {} }); }, [value, f]);
  if (!f) return null;
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Form title="Business details" hint="Shown on the contact page and in emails. Leave blank anything you do not want published." onSubmit={() => save(f)} saving={saving}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Store name"><input className="input" required value={f.name} onChange={s('name')} /></Field><Field label="Tagline"><input className="input" value={f.tagline} onChange={s('tagline')} /></Field><Field label="Contact email"><input className="input" type="email" value={f.email} onChange={s('email')} /></Field><Field label="Phone"><input className="input" value={f.phone} onChange={s('phone')} /></Field><Field label="Address" className="sm:col-span-2"><input className="input" value={f.address} onChange={s('address')} /></Field></div>
    </Form>
  );
}

function Simple({ k, title, hint, build, render }) {
  const { value, save, saving } = useSetting(k);
  const [f, setF] = useState(null);
  useEffect(() => { if (value !== undefined && f === null) setF(value); }, [value, f]);
  if (f === null) return null;
  return <Form title={title} hint={hint} onSubmit={() => save(build ? build(f) : f)} saving={saving}>{render(f, setF)}</Form>;
}

function Delivery() {
  const { value, save, saving } = useSetting('delivery');
  const [rows, setRows] = useState(null);
  useEffect(() => { if (value && !rows) setRows(Object.entries(value).map(([key, m]) => ({ key, label: m.label, fee: String(m.feeMinor / 100), freeAbove: m.freeAboveMinor != null ? String(m.freeAboveMinor / 100) : '', eta: m.etaDays ?? '' }))); }, [value, rows]);
  if (!rows) return null;
  const set = (i, k) => (e) => setRows(rows.map((r, n) => (n === i ? { ...r, [k]: e.target.value } : r)));
  return (
    <Form title="Delivery methods" hint="A “standard” method must always exist." saving={saving} onSubmit={() => save(Object.fromEntries(rows.map((r) => [r.key, { label: r.label, feeMinor: Math.round(Number(r.fee || 0) * 100), freeAboveMinor: r.freeAbove === '' ? null : Math.round(Number(r.freeAbove) * 100), etaDays: r.eta }])))}>
      {rows.map((r, i) => (
        <div key={r.key} className="grid gap-3 border-b rule pb-4 sm:grid-cols-4">
          <Field label={`Name (${r.key})`}><input className="input" required value={r.label} onChange={set(i, 'label')} /></Field>
          <Field label="Fee (₹)"><input className="input" type="number" min="0" step="0.01" value={r.fee} onChange={set(i, 'fee')} /></Field>
          <Field label="Free above (₹)"><input className="input" type="number" min="0" value={r.freeAbove} onChange={set(i, 'freeAbove')} /></Field>
          <Field label="Estimated days"><input className="input" placeholder="3-5" value={r.eta} onChange={set(i, 'eta')} /></Field>
        </div>
      ))}
    </Form>
  );
}

export function Settings() {
  const [tab, setTab] = useState('store');
  return (
    <div>
      <PageHead title="Settings" />
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ value: 'store', label: 'Store' }, { value: 'commerce', label: 'Tax and delivery' }, { value: 'policies', label: 'Policies' }, { value: 'payments', label: 'Payments' }]} />
      <div className="max-w-3xl space-y-6">
        {tab === 'store' && <>
          <Brand />
          <Simple k="announcement" title="Announcement bar" hint="One line shown above the header. Leave empty to hide it." build={(f) => f} render={(f, set) => <Field label="Message"><input className="input" maxLength={200} value={f} onChange={(e) => set(e.target.value)} /></Field>} />
        </>}
        {tab === 'commerce' && <>
          <Simple k="tax" title="Tax (GST)" hint="Prices are tax-inclusive when “inclusive” is on: tax is reported inside the total, not added to it." render={(f, set) => <div className="grid gap-4 sm:grid-cols-2"><Field label="Label"><input className="input" value={f.label} onChange={(e) => set({ ...f, label: e.target.value })} /></Field><Field label="Rate (%)"><input className="input" type="number" min="0" max="40" step="0.01" value={f.ratePercent} onChange={(e) => set({ ...f, ratePercent: Number(e.target.value) })} /></Field><Check label="Charge tax" checked={f.enabled} onChange={(v) => set({ ...f, enabled: v })} /><Check label="Prices include tax" checked={f.inclusive} onChange={(v) => set({ ...f, inclusive: v })} /></div>} />
          <Delivery />
          <Simple k="giftWrap" title="Gift wrap" render={(f, set) => <div className="flex flex-wrap items-end gap-6"><Check label="Offer gift wrap" checked={f.enabled} onChange={(v) => set({ ...f, enabled: v })} /><Field label="Fee (₹)"><input className="input" type="number" min="0" value={f.feeMinor / 100} onChange={(e) => set({ ...f, feeMinor: Math.round(Number(e.target.value) * 100) })} /></Field></div>} />
        </>}
        {tab === 'policies' && <>
          <Simple k="policies" title="Returns and warranty" render={(f, set) => <div className="grid gap-4"><Field label="Return window (days)"><input className="input" type="number" min="0" max="60" value={f.returnWindowDays} onChange={(e) => set({ ...f, returnWindowDays: Number(e.target.value) })} /></Field><Field label="Customers can cancel until"><select className="input" value={f.cancelUntilStatus} onChange={(e) => set({ ...f, cancelUntilStatus: e.target.value })}><option value="PROCESSING">Processing</option><option value="PACKED">Packed</option></select></Field><Field label="Warranty note (shown on the site)"><textarea className="input" maxLength={1000} value={f.warrantyNote} onChange={(e) => set({ ...f, warrantyNote: e.target.value })} /></Field></div>} />
          <Simple k="loyalty" title="Loyalty points" render={(f, set) => <div className="flex flex-wrap items-end gap-6"><Check label="Enable loyalty points" checked={f.enabled} onChange={(v) => set({ ...f, enabled: v })} /><Field label="Points per ₹100 spent"><input className="input" type="number" min="0" max="100" step="0.1" value={f.pointsPerHundredRupees} onChange={(e) => set({ ...f, pointsPerHundredRupees: Number(e.target.value) })} /></Field></div>} />
        </>}
        {tab === 'payments' && <Simple k="payments" title="Payment methods" hint="Razorpay also needs API keys on the server (see Integrations). A method is only offered at checkout when it is enabled here and, for Razorpay, configured." render={(f, set) => <div className="space-y-3"><Check label="Online payments (Razorpay)" checked={f.razorpayEnabled} onChange={(v) => set({ ...f, razorpayEnabled: v })} /><Check label="Cash on delivery" checked={f.codEnabled} onChange={(v) => set({ ...f, codEnabled: v })} /></div>} />}
      </div>
    </div>
  );
}

export function Integrations() {
  const q = useAdmin('integrations', '/integrations');
  const d = q.data;
  const Row = ({ label, ok, children }) => <div className="flex items-start justify-between gap-4 border-b rule py-4"><div><p className="font-semibold">{label}</p><div className="muted mt-1 text-sm">{children}</div></div><Pill tone={ok ? 'ok' : 'warn'}>{ok ? 'Connected' : 'Not configured'}</Pill></div>;
  return (
    <div>
      <PageHead title="Integrations" sub="Secrets live in the server environment and are never sent to the browser." />
      {d && <div className="max-w-3xl border rule bg-coal px-5">
        <Row label="Database" ok={d.database === 'ok'}>PostgreSQL connection {d.database === 'ok' ? 'is healthy.' : 'failed.'}</Row>
        <Row label="Razorpay payments" ok={d.razorpay.configured}>Needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET. {d.razorpay.webhookSecretSet ? 'Webhook secret is set.' : 'RAZORPAY_WEBHOOK_SECRET is not set.'} Point the Razorpay webhook to <code className="text-champagne">{window.location.origin}{d.razorpay.webhookUrl}</code> for events payment.captured, order.paid, payment.failed and refund.processed.</Row>
        <Row label="Email (SMTP)" ok={d.email.configured}>{d.email.configured ? 'Order and account emails are sent.' : 'Emails are written to the server log instead of being sent. Set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM.'}</Row>
        <Row label="File storage" ok>{d.storage.type} ({d.storage.path}). {d.storage.note}</Row>
      </div>}
    </div>
  );
}

export function AuditLogs() {
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdmin('audit', '/audit-logs', { action: action || undefined, actor: actor || undefined, page });
  return (
    <div>
      <PageHead title="Audit log" sub="Every sensitive staff action is recorded and cannot be edited."><SearchBox value={action} onChange={(v) => { setAction(v); setPage(1); }} placeholder="Action, e.g. order" /><SearchBox value={actor} onChange={(v) => { setActor(v); setPage(1); }} placeholder="Actor email" /></PageHead>
      <Table query={list} rows={list.data?.items ?? []} page={page} onPage={setPage} empty="No entries."
        columns={[{ key: 'createdAt', label: 'When', render: (r) => dateTimeFmt(r.createdAt), mute: true }, { key: 'actorEmail', label: 'Actor' }, { key: 'action', label: 'Action', render: (r) => <Pill tone="gold">{r.action}</Pill> }, { key: 'entity', label: 'Target', render: (r) => [r.entity, r.entityId].filter(Boolean).join(' · '), mute: true }, { key: 'meta', label: 'Details', render: (r) => (r.meta ? <code className="block max-w-xs truncate text-[.74rem]" title={JSON.stringify(r.meta)}>{JSON.stringify(r.meta)}</code> : '') }, { key: 'ip', label: 'IP', mute: true }]} />
    </div>
  );
}
