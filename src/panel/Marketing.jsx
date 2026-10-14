import { useState } from 'react';
import { dateFmt, dateTimeFmt, money } from '@/lib/format';
import { Field, Icon, Modal, Stars, Tabs } from '@/components/ui';
import { Check, PageHead, Pill, Select, Table, Uploader, num, useAdmin, useSave } from './kit';

const nn = (v) => (v === '' || v == null ? null : v);
const dtLocal = (v) => (v ? new Date(v).toISOString().slice(0, 16) : '');
const dtIso = (v) => (v ? new Date(v).toISOString() : null);

export function Coupons() {
  const list = useAdmin('coupons', '/coupons');
  const [e, setE] = useState(null);
  const save = useSave({ method: e?.id ? 'PUT' : 'POST', path: e?.id ? `/coupons/${e.id}` : '/coupons', ok: 'Coupon saved.', onDone: () => setE(null) });
  const blank = { code: '', description: '', type: 'PERCENT', value: '10', minSubtotal: '0', maxDiscount: '', startsAt: '', endsAt: '', usageLimit: '', perUserLimit: '', isActive: true };
  const edit = (c) => setE({ ...c, value: c.type === 'FIXED' ? String(c.value / 100) : String(c.value), minSubtotal: String(c.minSubtotalMinor / 100), maxDiscount: c.maxDiscountMinor ? String(c.maxDiscountMinor / 100) : '', startsAt: dtLocal(c.startsAt), endsAt: dtLocal(c.endsAt), usageLimit: c.usageLimit ?? '', perUserLimit: c.perUserLimit ?? '', description: c.description ?? '' });
  const submit = (ev) => {
    ev.preventDefault();
    save.mutate({ code: e.code, description: nn(e.description), type: e.type, value: e.type === 'FIXED' ? Math.round(Number(e.value) * 100) : Number(e.value), minSubtotalMinor: Math.round(Number(e.minSubtotal || 0) * 100), maxDiscountMinor: e.maxDiscount ? Math.round(Number(e.maxDiscount) * 100) : null, startsAt: dtIso(e.startsAt), endsAt: dtIso(e.endsAt), usageLimit: num(e.usageLimit), perUserLimit: num(e.perUserLimit), isActive: e.isActive });
  };
  const f = (k) => (ev) => setE({ ...e, [k]: ev.target.value });
  return (
    <div>
      <PageHead title="Coupons"><button className="btn btn-gold btn-sm" onClick={() => setE(blank)}><Icon name="plus" size={15} />New coupon</button></PageHead>
      <Table query={list} rows={list.data?.items ?? []} onRow={edit} empty="No coupons yet."
        columns={[
          { key: 'code', label: 'Code', render: (r) => <span className="font-semibold">{r.code}</span> },
          { key: 'type', label: 'Discount', render: (r) => (r.type === 'PERCENT' ? `${r.value}%` : money(r.value)) },
          { key: 'minSubtotalMinor', label: 'Min. order', right: true, render: (r) => (r.minSubtotalMinor ? money(r.minSubtotalMinor) : '–') },
          { key: 'usedCount', label: 'Used', right: true, render: (r) => `${r.usedCount ?? 0}${r.usageLimit ? ` / ${r.usageLimit}` : ''}` },
          { key: 'endsAt', label: 'Ends', render: (r) => (r.endsAt ? dateFmt(r.endsAt) : '–'), mute: true },
          { key: 'isActive', label: 'Status', render: (r) => <Pill tone={r.isActive ? 'ok' : 'mute'}>{r.isActive ? 'Active' : 'Off'}</Pill> },
        ]} />
      <Modal open={Boolean(e)} onClose={() => setE(null)} title={e?.id ? `Edit ${e.code}` : 'New coupon'}>
        {e && <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <Field label="Code"><input className="input uppercase" required pattern="[A-Za-z0-9_\-]{3,30}" value={e.code} onChange={f('code')} /></Field>
          <Field label="Type"><select className="input" value={e.type} onChange={f('type')}><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount (₹)</option></select></Field>
          <Field label={e.type === 'PERCENT' ? 'Percent off' : 'Amount off (₹)'}><input className="input" type="number" min="1" max={e.type === 'PERCENT' ? 100 : undefined} step={e.type === 'PERCENT' ? 1 : 0.01} required value={e.value} onChange={f('value')} /></Field>
          <Field label="Minimum order (₹)"><input className="input" type="number" min="0" value={e.minSubtotal} onChange={f('minSubtotal')} /></Field>
          {e.type === 'PERCENT' && <Field label="Maximum discount (₹, optional)"><input className="input" type="number" min="1" value={e.maxDiscount} onChange={f('maxDiscount')} /></Field>}
          <Field label="Starts"><input className="input" type="datetime-local" value={e.startsAt} onChange={f('startsAt')} /></Field>
          <Field label="Ends"><input className="input" type="datetime-local" value={e.endsAt} onChange={f('endsAt')} /></Field>
          <Field label="Total uses (optional)"><input className="input" type="number" min="1" value={e.usageLimit} onChange={f('usageLimit')} /></Field>
          <Field label="Uses per customer (optional)"><input className="input" type="number" min="1" value={e.perUserLimit} onChange={f('perUserLimit')} /></Field>
          <Field label="Description" className="sm:col-span-2"><input className="input" maxLength={200} value={e.description} onChange={f('description')} /></Field>
          <div className="sm:col-span-2"><Check label="Active" checked={e.isActive} onChange={(v) => setE({ ...e, isActive: v })} /></div>
          <button className="btn btn-gold sm:col-span-2" disabled={save.isPending}>Save coupon</button>
        </form>}
      </Modal>
    </div>
  );
}

export function Reviews() {
  const [status, setStatus] = useState('PENDING');
  const list = useAdmin('reviews', '/reviews', { status });
  const upd = useSave({ method: 'PATCH', path: (v) => `/reviews/${v.__id}`, ok: 'Review updated.' });
  return (
    <div>
      <PageHead title="Review moderation"><Select label="Status" value={status} onChange={setStatus} options={[['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']]} /></PageHead>
      <Table query={list} rows={list.data?.items ?? []} empty="Nothing here."
        columns={[
          { key: 'product', label: 'Product' }, { key: 'rating', label: 'Rating', render: (r) => <Stars value={r.rating} count={1} /> },
          { key: 'body', label: 'Review', render: (r) => <div className="max-w-md">{r.title && <p className="font-semibold">{r.title}</p>}<p className="muted text-[.84rem]">{r.body}</p><p className="muted mt-1 text-[.74rem]">{r.author} · {dateFmt(r.createdAt)}{r.verifiedPurchase && ' · verified purchase'}</p></div> },
          { key: 'act', label: '', render: (r) => <span className="flex gap-2">{r.status !== 'APPROVED' && <button className="btn btn-gold btn-sm" onClick={() => upd.mutate({ __id: r.id, status: 'APPROVED' })}>Approve</button>}{r.status !== 'REJECTED' && <button className="btn btn-danger btn-sm" onClick={() => upd.mutate({ __id: r.id, status: 'REJECTED' })}>Reject</button>}</span> },
        ]} />
    </div>
  );
}

function Banners() {
  const list = useAdmin('banners', '/banners');
  const [e, setE] = useState(null);
  const save = useSave({ method: e?.id ? 'PUT' : 'POST', path: e?.id ? `/banners/${e.id}` : '/banners', onDone: () => setE(null) });
  const del = useSave({ method: 'DELETE', path: (v) => `/banners/${v.__id}`, ok: 'Banner deleted.' });
  const f = (k) => (ev) => setE({ ...e, [k]: ev.target.value });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><p className="muted text-sm">Active banners are returned to the storefront and shown on the home page.</p><button className="btn btn-gold btn-sm" onClick={() => setE({ placement: 'promo', title: '', subtitle: '', imageUrl: '', ctaLabel: '', ctaHref: '', isActive: true, sortOrder: 0, startsAt: '', endsAt: '' })}>New banner</button></div>
      <Table rows={list.data?.items ?? []} onRow={(b) => setE({ ...b, subtitle: b.subtitle ?? '', imageUrl: b.imageUrl ?? '', ctaLabel: b.ctaLabel ?? '', ctaHref: b.ctaHref ?? '', startsAt: dtLocal(b.startsAt), endsAt: dtLocal(b.endsAt) })} empty="No banners."
        columns={[{ key: 'title', label: 'Title' }, { key: 'placement', label: 'Placement', mute: true }, { key: 'isActive', label: 'Status', render: (r) => <Pill tone={r.isActive ? 'ok' : 'mute'}>{r.isActive ? 'Live' : 'Off'}</Pill> }, { key: 'act', label: '', render: (r) => <button className="muted hover:text-danger" aria-label="Delete" onClick={(ev) => { ev.stopPropagation(); window.confirm('Delete this banner?') && del.mutate({ __id: r.id }); }}><Icon name="trash" size={16} /></button> }]} />
      <Modal open={Boolean(e)} onClose={() => setE(null)} title={e?.id ? 'Edit banner' : 'New banner'}>
        {e && <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); save.mutate({ placement: e.placement, title: e.title, subtitle: nn(e.subtitle), imageUrl: nn(e.imageUrl), ctaLabel: nn(e.ctaLabel), ctaHref: nn(e.ctaHref), isActive: e.isActive, sortOrder: Number(e.sortOrder || 0), startsAt: dtIso(e.startsAt), endsAt: dtIso(e.endsAt) }); }}>
          <Field label="Placement"><select className="input" value={e.placement} onChange={f('placement')}><option value="hero">Hero</option><option value="announcement">Announcement</option><option value="promo">Promo</option></select></Field>
          <Field label="Title"><input className="input" required minLength={2} value={e.title} onChange={f('title')} /></Field>
          <Field label="Subtitle"><input className="input" value={e.subtitle} onChange={f('subtitle')} /></Field>
          <div className="grid grid-cols-2 gap-4"><Field label="Button label"><input className="input" value={e.ctaLabel} onChange={f('ctaLabel')} /></Field><Field label="Button link" hint="/shop or https://…"><input className="input" value={e.ctaHref} onChange={f('ctaHref')} /></Field></div>
          <div>{e.imageUrl ? <p className="text-sm">{e.imageUrl} <button type="button" className="ml-2 text-danger underline" onClick={() => setE({ ...e, imageUrl: '' })}>Remove</button></p> : <Uploader onUploaded={(url) => setE((s) => ({ ...s, imageUrl: url }))} />}</div>
          <div className="grid grid-cols-2 gap-4"><Field label="Starts"><input className="input" type="datetime-local" value={e.startsAt} onChange={f('startsAt')} /></Field><Field label="Ends"><input className="input" type="datetime-local" value={e.endsAt} onChange={f('endsAt')} /></Field></div>
          <Check label="Active" checked={e.isActive} onChange={(v) => setE({ ...e, isActive: v })} />
          <button className="btn btn-gold" disabled={save.isPending}>Save banner</button>
        </form>}
      </Modal>
    </div>
  );
}

function Articles() {
  const list = useAdmin('articles', '/articles');
  const [e, setE] = useState(null);
  const save = useSave({ method: e?.id ? 'PUT' : 'POST', path: e?.id ? `/articles/${e.id}` : '/articles', ok: 'Article saved.', onDone: () => setE(null) });
  const del = useSave({ method: 'DELETE', path: (v) => `/articles/${v.__id}`, ok: 'Article deleted.' });
  const f = (k) => (ev) => setE({ ...e, [k]: ev.target.value });
  return (
    <div>
      <div className="mb-3 flex justify-end"><button className="btn btn-gold btn-sm" onClick={() => setE({ title: '', excerpt: '', body: '', coverUrl: '', category: '', status: 'DRAFT' })}>New article</button></div>
      <Table rows={list.data?.items ?? []} onRow={(a) => setE({ ...a, excerpt: a.excerpt ?? '', coverUrl: a.coverUrl ?? '', category: a.category ?? '' })} empty="No articles."
        columns={[{ key: 'title', label: 'Title' }, { key: 'category', label: 'Category', mute: true }, { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'PUBLISHED' ? 'ok' : 'warn'}>{r.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Pill> }, { key: 'publishedAt', label: 'Published', render: (r) => (r.publishedAt ? dateFmt(r.publishedAt) : '–'), mute: true }, { key: 'act', label: '', render: (r) => <button className="muted hover:text-danger" aria-label="Delete" onClick={(ev) => { ev.stopPropagation(); window.confirm('Delete this article?') && del.mutate({ __id: r.id }); }}><Icon name="trash" size={16} /></button> }]} />
      <Modal wide open={Boolean(e)} onClose={() => setE(null)} title={e?.id ? 'Edit article' : 'New article'}>
        {e && <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); save.mutate({ title: e.title, excerpt: nn(e.excerpt), body: e.body, coverUrl: nn(e.coverUrl), category: nn(e.category), status: e.status }); }}>
          <Field label="Title"><input className="input" required minLength={3} value={e.title} onChange={f('title')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Category"><input className="input" value={e.category} onChange={f('category')} /></Field><Field label="Status"><select className="input" value={e.status} onChange={f('status')}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select></Field></div>
          <Field label="Excerpt"><input className="input" maxLength={300} value={e.excerpt} onChange={f('excerpt')} /></Field>
          <Field label="Body" hint="Plain text. Leave a blank line between paragraphs."><textarea className="input !min-h-64" required minLength={20} value={e.body} onChange={f('body')} /></Field>
          <div>{e.coverUrl ? <p className="text-sm">{e.coverUrl} <button type="button" className="ml-2 text-danger underline" onClick={() => setE({ ...e, coverUrl: '' })}>Remove</button></p> : <Uploader label="Upload cover image" onUploaded={(url) => setE((s) => ({ ...s, coverUrl: url }))} />}</div>
          <button className="btn btn-gold" disabled={save.isPending}>Save article</button>
        </form>}
      </Modal>
    </div>
  );
}

function Subscribers() {
  const list = useAdmin('newsletter', '/newsletter');
  return (<div><p className="muted mb-3 text-sm">{list.data ? `${list.data.active} active subscribers` : ''}</p><Table query={list} rows={list.data?.items ?? []} empty="No subscribers yet." columns={[{ key: 'email', label: 'Email' }, { key: 'createdAt', label: 'Joined', render: (r) => dateFmt(r.createdAt), mute: true }, { key: 'unsubscribedAt', label: 'Status', render: (r) => <Pill tone={r.unsubscribedAt ? 'mute' : 'ok'}>{r.unsubscribedAt ? 'Unsubscribed' : 'Subscribed'}</Pill> }]} /></div>);
}

export function Content() {
  const [tab, setTab] = useState('banners');
  return (
    <div><PageHead title="Banners and journal" />
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ value: 'banners', label: 'Banners' }, { value: 'articles', label: 'Journal articles' }, { value: 'subs', label: 'Newsletter' }]} />
      {tab === 'banners' && <Banners />}{tab === 'articles' && <Articles />}{tab === 'subs' && <Subscribers />}
    </div>
  );
}

export function Support() {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const list = useAdmin('support', '/support', { status: status || undefined, type: type || undefined });
  const [e, setE] = useState(null);
  const save = useSave({ method: 'PATCH', path: (v) => `/support/${v.__id}`, ok: 'Request updated.', onDone: () => setE(null) });
  return (
    <div>
      <PageHead title="Support requests"><Select label="Status" value={status} onChange={setStatus} options={[['', 'All statuses'], ['OPEN', 'Open'], ['IN_PROGRESS', 'In progress'], ['RESOLVED', 'Resolved'], ['CLOSED', 'Closed']]} /><Select label="Type" value={type} onChange={setType} options={[['', 'All types'], ['CONTACT', 'Contact'], ['WARRANTY', 'Warranty'], ['SERVICE', 'Service'], ['ORDER_HELP', 'Order help']]} /></PageHead>
      <Table query={list} rows={list.data?.items ?? []} onRow={(r) => setE({ ...r, adminNote: r.adminNote ?? '' })} empty="No requests."
        columns={[{ key: 'reference', label: 'Ref' }, { key: 'type', label: 'Type', mute: true }, { key: 'subject', label: 'Subject', render: (r) => <>{r.subject}<span className="muted block text-[.78rem]">{r.name} · {r.email}</span></> }, { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'OPEN' ? 'warn' : r.status === 'IN_PROGRESS' ? 'gold' : 'ok'}>{r.status.replace('_', ' ')}</Pill> }, { key: 'createdAt', label: 'Received', render: (r) => dateTimeFmt(r.createdAt), mute: true }]} />
      <Modal open={Boolean(e)} onClose={() => setE(null)} title={`Request ${e?.reference ?? ''}`}>
        {e && <div className="space-y-4">
          <p className="text-sm"><strong>{e.subject}</strong><br /><span className="muted">{e.name} · <a className="text-champagne" href={`mailto:${e.email}`}>{e.email}</a>{e.phone && ` · ${e.phone}`}</span></p>
          <p className="whitespace-pre-wrap border-l-2 border-champagne/40 pl-3 text-sm">{e.message}</p>
          {e.data && <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">{Object.entries(e.data).map(([k, v]) => <><dt key={`k${k}`} className="muted">{k}</dt><dd key={`v${k}`}>{String(v)}</dd></>)}</dl>}
          <Field label="Status"><select className="input" value={e.status} onChange={(ev) => setE({ ...e, status: ev.target.value })}>{['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></Field>
          <Field label="Internal note"><textarea className="input" maxLength={2000} value={e.adminNote} onChange={(ev) => setE({ ...e, adminNote: ev.target.value })} /></Field>
          <button className="btn btn-gold" disabled={save.isPending} onClick={() => save.mutate({ __id: e.id, status: e.status, ...(e.adminNote ? { adminNote: e.adminNote } : {}) })}>Save</button>
        </div>}
      </Modal>
    </div>
  );
}
