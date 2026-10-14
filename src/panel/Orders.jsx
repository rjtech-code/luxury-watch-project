import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PAYMENT_LABEL, STATUS_LABEL, dateTimeFmt, money, moneyExact } from '@/lib/format';
import { useCan, useMe } from '@/lib/hooks';
import { Field, Modal } from '@/components/ui';
import { Timeline } from '@/pages/Checkout';
import { Panel, PageHead, Pill, SearchBox, Select, Table, useAdmin, useSave } from './kit';

const statusTone = (s) => ({ DELIVERED: 'ok', CANCELLED: 'danger', RETURNED: 'danger', RETURN_REQUESTED: 'warn', PENDING_PAYMENT: 'warn' }[s] ?? 'gold');
const payTone = (s) => ({ PAID: 'ok', FAILED: 'danger', PENDING: 'warn' }[s] ?? 'mute');

export function Orders({ scope }) {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const status = sp.get('status') ?? '';
  const payment = sp.get('payment') ?? '';
  const query = { q: q || undefined, status: status || undefined, payment: payment || undefined, page };
  const list = useAdmin('orders', '/orders', query);
  const set = (k) => (v) => { setPage(1); setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); return n; }, { replace: true }); };
  return (
    <div>
      <PageHead title="Orders"><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Order, email or phone" />
        <Select label="Status" value={status} onChange={set('status')} options={[['', 'All statuses'], ...Object.entries(STATUS_LABEL)]} />
        <Select label="Payment" value={payment} onChange={set('payment')} options={[['', 'Any payment'], ...Object.entries(PAYMENT_LABEL)]} />
      </PageHead>
      <Table query={list} rows={list.data?.items ?? []} page={page} onPage={setPage} onRow={(r) => nav(`/${scope}/orders/${r.orderNumber}`)} empty="No orders match."
        columns={[
          { key: 'orderNumber', label: 'Order', render: (r) => <Link className="font-semibold text-champagne" to={`/${scope}/orders/${r.orderNumber}`} onClick={(e) => e.stopPropagation()}>{r.orderNumber}</Link> },
          { key: 'placedAt', label: 'Placed', render: (r) => dateTimeFmt(r.placedAt), mute: true },
          { key: 'customer', label: 'Customer', render: (r) => <>{r.customer}<span className="muted block text-[.78rem]">{r.contactEmail}</span></> },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={statusTone(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Pill> },
          { key: 'paymentStatus', label: 'Payment', render: (r) => <Pill tone={payTone(r.paymentStatus)}>{PAYMENT_LABEL[r.paymentStatus] ?? r.paymentStatus}</Pill> },
          { key: 'totalMinor', label: 'Total', right: true, render: (r) => money(r.totalMinor) },
        ]} />
      <p className="muted mt-3 text-[.8rem]">{list.data ? `${list.data.total} orders` : ''}</p>
    </div>
  );
}

export function OrderDetail({ scope }) {
  const { orderNumber } = useParams();
  const { data: me } = useMe();
  const can = useCan();
  const q = useAdmin('order', `/orders/${orderNumber}`);
  const [next, setNext] = useState(null);
  const [form, setForm] = useState({ note: '', carrier: '', trackingNumber: '', trackingUrl: '' });
  const [refund, setRefund] = useState(null);
  const status = useSave({ method: 'PATCH', path: `/orders/${orderNumber}/status`, ok: 'Order updated.', onDone: () => setNext(null) });
  const refundM = useSave({ method: 'POST', path: `/orders/${orderNumber}/refund`, ok: 'Refund recorded.', onDone: () => setRefund(null) });
  if (q.isLoading) return <p className="muted">Loading…</p>;
  if (q.error) return <p role="alert">{q.error.message}</p>;
  const { order: o, items, timeline, shipments, payments, returns, nextStatuses } = q.data;
  const addr = o.shippingAddress;
  const submitStatus = (e) => {
    e.preventDefault();
    const shipment = next === 'SHIPPED' ? Object.fromEntries(Object.entries({ carrier: form.carrier, trackingNumber: form.trackingNumber, trackingUrl: form.trackingUrl }).filter(([, v]) => v)) : undefined;
    status.mutate({ status: next, ...(form.note ? { note: form.note } : {}), ...(shipment && Object.keys(shipment).length ? { shipment } : {}) });
  };
  const remaining = Number(o.totalMinor) - Number(o.refundedMinor);
  return (
    <div>
      <Link to={`/${scope}/orders`} className="muted mb-3 inline-block text-sm hover:text-champagne">← All orders</Link>
      <PageHead title={`Order ${o.orderNumber}`} sub={`Placed ${dateTimeFmt(o.placedAt)}`}>
        <Pill tone={statusTone(o.status)}>{STATUS_LABEL[o.status] ?? o.status}</Pill><Pill tone={payTone(o.paymentStatus)}>{PAYMENT_LABEL[o.paymentStatus]}</Pill>
      </PageHead>
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Panel title="Items"><table className="table-lux"><thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Unit</th><th className="text-right">Total</th></tr></thead><tbody>{items.map((i) => <tr key={i.id}><td>{i.brandName} {i.productName}<span className="muted block text-[.76rem]">{i.sku}</span></td><td className="text-right">{i.quantity}</td><td className="text-right tabular-nums">{moneyExact(i.unitPriceMinor)}</td><td className="text-right tabular-nums">{moneyExact(i.lineTotalMinor)}</td></tr>)}</tbody></table></Panel>
          <Panel title="History"><Timeline order={{ timeline: timeline.map((t) => ({ status: t.status, note: t.note, at: t.createdAt })) }} /></Panel>
          {returns.length > 0 && <Panel title="Returns">{returns.map((r) => <p key={r.id} className="text-sm"><Pill tone="warn">{r.status}</Pill> {r.reason}</p>)}<Link to={`/${scope}/returns`} className="mt-3 inline-block text-sm text-champagne">Manage returns</Link></Panel>}
        </div>
        <div className="space-y-6">
          <Panel title="Totals"><dl className="space-y-1.5 text-sm">{[['Subtotal', o.subtotalMinor], ['Discount', -o.discountMinor], ['Shipping', o.shippingMinor], ['Gift wrap', o.giftWrapMinor], ['Tax (included)', o.taxMinor]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="muted">{k}</dt><dd className="tabular-nums">{moneyExact(Number(v))}</dd></div>)}<div className="flex justify-between border-t rule pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums">{moneyExact(Number(o.totalMinor))}</dd></div>{Number(o.refundedMinor) > 0 && <div className="flex justify-between text-warn"><dt>Refunded</dt><dd className="tabular-nums">{moneyExact(Number(o.refundedMinor))}</dd></div>}</dl></Panel>
          <Panel title="Customer"><p className="text-sm">{addr.fullName}<br />{addr.line1}{addr.line2 && `, ${addr.line2}`}<br />{addr.city}, {addr.state} {addr.postalCode}<br /><a className="text-champagne" href={`tel:${o.contactPhone}`}>{o.contactPhone}</a><br /><a className="text-champagne" href={`mailto:${o.contactEmail}`}>{o.contactEmail}</a></p>{o.notes && <p className="muted mt-3 text-sm">Note: {o.notes}</p>}{o.isGift && <p className="mt-2 text-sm">Gift{o.giftMessage ? `: “${o.giftMessage}”` : ''}</p>}</Panel>
          <Panel title="Payment">{payments.length ? payments.map((p, i) => <p key={i} className="text-sm">{p.provider} · {p.status} · {p.method ?? 'n/a'}<br /><span className="muted text-[.76rem]">{p.providerPaymentId}</span>{p.failureReason && <span className="block text-danger">{p.failureReason}</span>}</p>) : <p className="muted text-sm">No payment record.</p>}
            {me.role === 'SUPER_ADMIN' && ['PAID', 'PARTIALLY_REFUNDED'].includes(o.paymentStatus) && remaining > 0 && <button className="btn btn-line btn-sm mt-3" onClick={() => setRefund({ amount: String(remaining / 100), note: '' })}>Record refund</button>}</Panel>
          {shipments.map((s) => <Panel key={s.id} title="Shipment"><p className="text-sm">{s.carrier} · {s.trackingNumber}</p></Panel>)}
          {can('orders.update') && nextStatuses.length > 0 && <Panel title="Update status"><div className="flex flex-wrap gap-2">{nextStatuses.map((s) => <button key={s} className={`btn btn-sm ${s === 'CANCELLED' ? 'btn-danger' : 'btn-gold'}`} onClick={() => setNext(s)}>{STATUS_LABEL[s] ?? s}</button>)}</div></Panel>}
        </div>
      </div>

      <Modal open={Boolean(next)} onClose={() => setNext(null)} title={`Mark as ${STATUS_LABEL[next] ?? ''}`}>
        <form className="space-y-4" onSubmit={submitStatus}>
          {next === 'SHIPPED' && <><Field label="Carrier"><input className="input" value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} /></Field><Field label="Tracking number"><input className="input" value={form.trackingNumber} onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })} /></Field><Field label="Tracking link (https://)"><input className="input" type="url" value={form.trackingUrl} onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })} /></Field></>}
          <Field label="Note (optional)"><input className="input" maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          {next === 'CANCELLED' && <p className="text-sm text-warn">Cancelling releases reserved stock. Online payments are not refunded automatically: record a refund afterwards.</p>}
          <button className="btn btn-gold" disabled={status.isPending}>Confirm</button>
        </form>
      </Modal>
      <Modal open={Boolean(refund)} onClose={() => setRefund(null)} title="Record refund">
        {refund && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); refundM.mutate({ amountMinor: Math.round(Number(refund.amount) * 100), ...(refund.note ? { note: refund.note } : {}) }); }}>
          <p className="muted text-sm">Razorpay payments are refunded through the gateway. COD and offline orders are recorded only: send the money yourself.</p>
          <Field label={`Amount (₹, up to ${remaining / 100})`}><input className="input" type="number" step="0.01" min="1" max={remaining / 100} required value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} /></Field>
          <Field label="Note"><input className="input" maxLength={300} value={refund.note} onChange={(e) => setRefund({ ...refund, note: e.target.value })} /></Field>
          <button className="btn btn-gold" disabled={refundM.isPending}>Issue refund</button>
        </form>}
      </Modal>
    </div>
  );
}

export function Returns() {
  const q = useAdmin('returns', '/returns');
  const can = useCan();
  const upd = useSave({ method: 'PATCH', path: (v) => `/returns/${v.id}`, ok: 'Return updated.' });
  return (
    <div><PageHead title="Returns" />
      <Table query={q} rows={q.data?.items ?? []} empty="No return requests."
        columns={[
          { key: 'orderNumber', label: 'Order' }, { key: 'createdAt', label: 'Requested', render: (r) => dateTimeFmt(r.createdAt), mute: true },
          { key: 'reason', label: 'Reason' }, { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'REQUESTED' ? 'warn' : r.status === 'REJECTED' ? 'danger' : 'ok'}>{r.status}</Pill> },
          { key: 'totalMinor', label: 'Order total', right: true, render: (r) => money(r.totalMinor) },
          { key: 'act', label: '', render: (r) => can('orders.update') && r.status === 'REQUESTED' ? <span className="flex gap-2"><button className="btn btn-gold btn-sm" onClick={() => upd.mutate({ __path: `/returns/${r.id}`, status: 'APPROVED' })}>Approve</button><button className="btn btn-danger btn-sm" onClick={() => upd.mutate({ __path: `/returns/${r.id}`, status: 'REJECTED' })}>Reject</button></span> : r.status === 'APPROVED' && can('orders.update') ? <button className="btn btn-line btn-sm" onClick={() => upd.mutate({ __path: `/returns/${r.id}`, status: 'RECEIVED' })}>Mark received</button> : null },
        ]} />
    </div>
  );
}
