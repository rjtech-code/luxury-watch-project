import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MOVEMENT_LABEL, money } from '@/lib/format';
import { useCan } from '@/lib/hooks';
import { Field, Icon, Modal, Tabs } from '@/components/ui';
import { Check, PageHead, Panel, Pill, SearchBox, Select, Table, Uploader, num, rupees, toMinor, useAdmin, useSave } from './kit';

const nn = (v) => (v === '' || v == null ? null : v);

export function Products() {
  const nav = useNavigate();
  const can = useCan();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdmin('products', '/products', { q: q || undefined, status: status || undefined, page });
  return (
    <div>
      <PageHead title="Products">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or brand" />
        <Select label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['', 'All'], ['ACTIVE', 'Active'], ['DRAFT', 'Draft'], ['ARCHIVED', 'Archived']]} />
        {can('products.write') && <Link to="new" className="btn btn-gold btn-sm"><Icon name="plus" size={15} />New product</Link>}
      </PageHead>
      <Table query={list} rows={list.data?.items ?? []} page={page} onPage={setPage} onRow={(r) => nav(r.id)}
        columns={[
          { key: 'name', label: 'Product', render: (r) => <><span className="font-semibold">{r.name}</span><span className="muted block text-[.78rem]">{r.brand}</span></> },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'ACTIVE' ? 'ok' : r.status === 'DRAFT' ? 'warn' : 'mute'}>{r.status}</Pill> },
          { key: 'priceMinor', label: 'Price', right: true, render: (r) => (r.priceMinor == null ? <span className="muted">On request</span> : <>{money(r.priceMinor)}{r.isDemoData && <Pill tone="warn"> demo</Pill>}</>) },
          { key: 'imageCount', label: 'Photos', right: true },
        ]} />
      <p className="muted mt-3 text-[.8rem]">{list.data?.total ?? ''} products. “demo” marks development placeholder prices; replace them with real prices before launch.</p>
    </div>
  );
}

const BLANK = { name: '', brandId: '', collectionId: '', categoryId: '', description: '', status: 'DRAFT', price: '', compareAt: '', gender: '', movement: '', isSmartwatch: false, caseMaterial: '', caseDiameterMm: '', dialColor: '', strapMaterial: '', waterResistanceM: '', occasions: '', warrantyInfo: '', modelUrl: '', isFeatured: false, isLimitedEdition: false, images: [], specs: [], sku: '', initialStock: '0' };

export function ProductEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const nav = useNavigate();
  const can = useCan();
  const brands = useAdmin('brands', '/brands');
  const collections = useAdmin('collections', '/collections');
  const cats = useAdmin('categories', '/categories');
  const detail = useAdmin('product', `/products/${id}`, null, { enabled: !isNew });
  const [f, setF] = useState(BLANK);
  const [loaded, setLoaded] = useState(isNew);
  useEffect(() => {
    const p = detail.data?.product;
    if (!p || loaded) return;
    setF({ ...BLANK, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ''])), price: rupees(p.priceMinor), compareAt: rupees(p.compareAtMinor), occasions: (p.occasions ?? []).join(', '), specs: Object.entries(p.specs ?? {}), images: p.images.map((i) => ({ url: i.url, alt: i.alt ?? '' })), isSmartwatch: p.isSmartwatch, isFeatured: p.isFeatured, isLimitedEdition: p.isLimitedEdition });
    setLoaded(true);
  }, [detail.data, loaded]);
  const save = useSave({ method: isNew ? 'POST' : 'PUT', path: isNew ? '/products' : `/products/${id}`, ok: 'Product saved.', onDone: (r) => isNew && nav(`../${r.product.id}`, { relative: 'path' }) });
  const archive = useSave({ method: 'DELETE', path: `/products/${id}`, ok: 'Product archived.', onDone: () => nav('..', { relative: 'path' }) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const ro = !can('products.write');

  const submit = (e) => {
    e.preventDefault();
    const body = {
      name: f.name, brandId: f.brandId, collectionId: nn(f.collectionId), categoryId: nn(f.categoryId), description: nn(f.description), status: f.status,
      priceMinor: toMinor(f.price), compareAtMinor: toMinor(f.compareAt), gender: nn(f.gender), movement: nn(f.movement), isSmartwatch: f.isSmartwatch,
      caseMaterial: nn(f.caseMaterial), caseDiameterMm: num(f.caseDiameterMm), dialColor: nn(f.dialColor), strapMaterial: nn(f.strapMaterial), waterResistanceM: num(f.waterResistanceM),
      occasions: f.occasions.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean), specs: Object.fromEntries(f.specs.filter(([k, v]) => k.trim() && v.trim())),
      warrantyInfo: nn(f.warrantyInfo), modelUrl: nn(f.modelUrl), isFeatured: f.isFeatured, isLimitedEdition: f.isLimitedEdition,
      images: f.images.map((i) => ({ url: i.url, ...(i.alt ? { alt: i.alt } : {}) })),
      ...(isNew ? { sku: f.sku, initialStock: Number(f.initialStock || 0) } : {}),
    };
    save.mutate(body);
  };

  if (!isNew && detail.isLoading) return <p className="muted">Loading…</p>;
  if (!isNew && detail.error) return <p role="alert">{detail.error.message}</p>;
  const brandCols = (collections.data?.items ?? []).filter((c) => !f.brandId || c.brandId === f.brandId);
  const p = detail.data?.product;
  return (
    <form onSubmit={submit}>
      <Link to=".." relative="path" className="muted mb-3 inline-block text-sm hover:text-champagne">← Products</Link>
      <PageHead title={isNew ? 'New product' : f.name || 'Product'} sub={p?.isDemoData ? 'Development placeholder price. Enter a real price to replace it.' : undefined}>
        {!isNew && <a className="btn btn-line btn-sm" href={`/watches/${p.slug}`} target="_blank" rel="noreferrer">View on site</a>}
        {!ro && <button className="btn btn-gold btn-sm" disabled={save.isPending}>Save</button>}
      </PageHead>
      <fieldset disabled={ro} className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Panel title="Basics"><div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><input className="input" required minLength={2} value={f.name} onChange={set('name')} /></Field>
            <Field label="Brand"><select className="input" required value={f.brandId} onChange={set('brandId')}><option value="">Select…</option>{(brands.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="Collection"><select className="input" value={f.collectionId} onChange={set('collectionId')}><option value="">None</option>{brandCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Category"><select className="input" value={f.categoryId} onChange={set('categoryId')}><option value="">None</option>{(cats.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Status"><select className="input" value={f.status} onChange={set('status')}><option value="DRAFT">Draft (hidden)</option><option value="ACTIVE">Active (visible)</option><option value="ARCHIVED">Archived</option></select></Field>
            <Field label="Description" className="sm:col-span-2"><textarea className="input" maxLength={5000} value={f.description} onChange={set('description')} /></Field>
          </div></Panel>
          <Panel title="Specifications" ><p className="muted mb-3 text-sm">Leave a field empty if it is unknown: the shop shows “Not specified”.</p><div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gender"><select className="input" value={f.gender} onChange={set('gender')}><option value="">Not specified</option><option value="MEN">Men</option><option value="WOMEN">Women</option><option value="UNISEX">Unisex</option></select></Field>
            <Field label="Movement"><select className="input" value={f.movement} onChange={set('movement')}><option value="">Not specified</option>{Object.entries(MOVEMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Case material"><input className="input" value={f.caseMaterial} onChange={set('caseMaterial')} /></Field>
            <Field label="Case diameter (mm)"><input className="input" type="number" step="0.1" min="20" max="60" value={f.caseDiameterMm} onChange={set('caseDiameterMm')} /></Field>
            <Field label="Dial colour"><input className="input" value={f.dialColor} onChange={set('dialColor')} /></Field>
            <Field label="Strap / bracelet"><input className="input" value={f.strapMaterial} onChange={set('strapMaterial')} /></Field>
            <Field label="Water resistance (m)"><input className="input" type="number" min="0" value={f.waterResistanceM} onChange={set('waterResistanceM')} /></Field>
            <Field label="Occasions (comma separated)" hint="e.g. formal, business, sport, travel, everyday"><input className="input" value={f.occasions} onChange={set('occasions')} /></Field>
            <div className="sm:col-span-2"><p className="label">Other specifications</p>
              {f.specs.map(([k, v], i) => <div key={i} className="mb-2 flex gap-2"><input className="input" aria-label="Name" placeholder="e.g. Power reserve" value={k} onChange={(e) => setF({ ...f, specs: f.specs.map((s, n) => (n === i ? [e.target.value, s[1]] : s)) })} /><input className="input" aria-label="Value" placeholder="e.g. 70 hours" value={v} onChange={(e) => setF({ ...f, specs: f.specs.map((s, n) => (n === i ? [s[0], e.target.value] : s)) })} /><button type="button" className="muted px-2 hover:text-danger" aria-label="Remove" onClick={() => setF({ ...f, specs: f.specs.filter((_, n) => n !== i) })}><Icon name="close" size={16} /></button></div>)}
              <button type="button" className="btn btn-line btn-sm" onClick={() => setF({ ...f, specs: [...f.specs, ['', '']] })}><Icon name="plus" size={14} />Add row</button></div>
            <Field label="Warranty information" className="sm:col-span-2"><textarea className="input !min-h-20" maxLength={1000} value={f.warrantyInfo} onChange={set('warrantyInfo')} /></Field>
          </div></Panel>
          <Panel title="Photos and 3D model">
            <ul className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-4">{f.images.map((im, i) => <li key={im.url + i} className="space-y-1"><div className="relative aspect-square border rule bg-ink"><img src={im.url} alt="" className="size-full object-contain" /><button type="button" className="absolute right-1 top-1 grid size-6 place-items-center bg-ink/80 hover:text-danger" aria-label="Remove image" onClick={() => setF({ ...f, images: f.images.filter((_, n) => n !== i) })}><Icon name="close" size={13} /></button></div><input className="input !min-h-8 !text-xs" placeholder="Alt text" value={im.alt} onChange={(e) => setF({ ...f, images: f.images.map((x, n) => (n === i ? { ...x, alt: e.target.value } : x)) })} /></li>)}</ul>
            {f.images.length < 12 && <Uploader onUploaded={(url) => setF((s) => ({ ...s, images: [...s.images, { url, alt: '' }] }))} />}
            <div className="mt-5 border-t rule pt-4"><p className="label">3D model (.glb)</p>{f.modelUrl ? <p className="text-sm">{f.modelUrl} <button type="button" className="ml-2 text-danger underline" onClick={() => setF({ ...f, modelUrl: '' })}>Remove</button></p> : <Uploader accept=".glb,model/gltf-binary" label="Upload GLB" onUploaded={(url) => setF((s) => ({ ...s, modelUrl: url }))} />}
              <p className="hint">Only upload a model of this exact watch. Without one, visitors see a labelled generic 3D watch.</p></div>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Price (₹)"><div className="grid gap-4">
            <Field label="Price" hint="Leave empty for “Price on request” (cannot be added to cart)."><input className="input" type="number" step="0.01" min="1" value={f.price} onChange={set('price')} /></Field>
            <Field label="Compare-at price (optional)"><input className="input" type="number" step="0.01" min="1" value={f.compareAt} onChange={set('compareAt')} /></Field>
          </div></Panel>
          {isNew ? <Panel title="Inventory"><div className="grid gap-4"><Field label="SKU"><input className="input" required minLength={3} pattern="[A-Za-z0-9._\-]+" value={f.sku} onChange={set('sku')} /></Field><Field label="Opening stock"><input className="input" type="number" min="0" value={f.initialStock} onChange={set('initialStock')} /></Field></div></Panel>
            : <Panel title="Variants"><ul className="space-y-2 text-sm">{p.variants.map((v) => <li key={v.id} className="flex justify-between"><span>{v.label} <span className="muted">{v.sku}</span></span><span>{(v.onHand ?? 0) - (v.reserved ?? 0)} available</span></li>)}</ul><Link to="../../inventory" relative="path" className="mt-3 inline-block text-sm text-champagne">Adjust stock</Link></Panel>}
          <Panel title="Flags"><div className="space-y-3"><Check label="Smartwatch" checked={f.isSmartwatch} onChange={(v) => setF({ ...f, isSmartwatch: v })} /><Check label="Featured on homepage" checked={f.isFeatured} onChange={(v) => setF({ ...f, isFeatured: v })} /><Check label="Limited edition" checked={f.isLimitedEdition} onChange={(v) => setF({ ...f, isLimitedEdition: v })} /></div></Panel>
          {!isNew && !ro && <button type="button" className="btn btn-danger w-full" onClick={() => window.confirm('Archive this product? It disappears from the shop.') && archive.mutate({})}>Archive product</button>}
        </div>
      </fieldset>
    </form>
  );
}

function Crud({ title, path, items, cols, blank, fields, toBody, fromRow }) {
  const [edit, setEdit] = useState(null);
  const save = useSave({ method: edit?.id ? 'PUT' : 'POST', path: edit?.id ? `${path}/${edit.id}` : path, onDone: () => setEdit(null) });
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <div>
      <div className="mb-3 flex justify-end"><button className="btn btn-gold btn-sm" onClick={() => setEdit(blank)}><Icon name="plus" size={15} />New {title}</button></div>
      <Table rows={items} columns={cols} onRow={(r) => setEdit(fromRow(r))} />
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${title}` : `New ${title}`}>
        {edit && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(toBody(edit)); }}>{fields(edit, set, setEdit)}<button className="btn btn-gold" disabled={save.isPending}>Save</button></form>}
      </Modal>
    </div>
  );
}

export function Taxonomy() {
  const [tab, setTab] = useState('brands');
  const brands = useAdmin('brands', '/brands');
  const collections = useAdmin('collections', '/collections');
  const cats = useAdmin('categories', '/categories');
  const bn = Object.fromEntries((brands.data?.items ?? []).map((b) => [b.id, b.name]));
  const txt = (label, k, set, e, extra = {}) => <Field label={label}><input className="input" value={e[k] ?? ''} onChange={set(k)} {...extra} /></Field>;
  return (
    <div>
      <PageHead title="Brands, collections and categories" />
      <Tabs value={tab} onChange={setTab} className="mb-6" tabs={[{ value: 'brands', label: 'Brands' }, { value: 'collections', label: 'Collections' }, { value: 'categories', label: 'Categories' }]} />
      {tab === 'brands' && <Crud title="brand" path="/brands" items={brands.data?.items ?? []} blank={{ name: '', isActive: true, sortOrder: 0 }} fromRow={(r) => ({ ...r, founded: r.founded ?? '' })}
        cols={[{ key: 'name', label: 'Brand' }, { key: 'country', label: 'Country', mute: true }, { key: 'segment', label: 'Segment', mute: true }, { key: 'isActive', label: 'Status', render: (r) => <Pill tone={r.isActive ? 'ok' : 'mute'}>{r.isActive ? 'Active' : 'Hidden'}</Pill> }]}
        toBody={(e) => ({ name: e.name, country: nn(e.country), founded: num(e.founded), parentCompany: nn(e.parentCompany), segment: nn(e.segment), introduction: nn(e.introduction), history: nn(e.history), logoUrl: nn(e.logoUrl), heroImageUrl: nn(e.heroImageUrl), isActive: Boolean(e.isActive), sortOrder: Number(e.sortOrder || 0) })}
        fields={(e, set) => <>{txt('Name', 'name', set, e, { required: true })}{txt('Country', 'country', set, e)}{txt('Founded (year)', 'founded', set, e, { type: 'number' })}{txt('Parent company', 'parentCompany', set, e)}{txt('Segment', 'segment', set, e)}<Field label="Introduction"><textarea className="input" value={e.introduction ?? ''} onChange={set('introduction')} /></Field><Check label="Visible in the shop" checked={Boolean(e.isActive)} onChange={(v) => set('isActive')({ target: { type: 'checkbox', checked: v } })} />{txt('Sort order', 'sortOrder', set, e, { type: 'number' })}</>} />}
      {tab === 'collections' && <Crud title="collection" path="/collections" items={collections.data?.items ?? []} blank={{ name: '', brandId: '', sortOrder: 0 }} fromRow={(r) => r}
        cols={[{ key: 'name', label: 'Collection' }, { key: 'brandId', label: 'Brand', render: (r) => bn[r.brandId] }, { key: 'typeLabel', label: 'Type', mute: true }]}
        toBody={(e) => ({ name: e.name, brandId: e.brandId, categoryId: nn(e.categoryId), typeLabel: nn(e.typeLabel), description: nn(e.description), imageUrl: nn(e.imageUrl), isFeatured: Boolean(e.isFeatured), sortOrder: Number(e.sortOrder || 0) })}
        fields={(e, set) => <>{txt('Name', 'name', set, e, { required: true })}<Field label="Brand"><select className="input" required value={e.brandId} onChange={set('brandId')}><option value="">Select…</option>{(brands.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><Field label="Category"><select className="input" value={e.categoryId ?? ''} onChange={set('categoryId')}><option value="">None</option>{(cats.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>{txt('Type label', 'typeLabel', set, e)}<Field label="Description"><textarea className="input" value={e.description ?? ''} onChange={set('description')} /></Field></>} />}
      {tab === 'categories' && <Crud title="category" path="/categories" items={cats.data?.items ?? []} blank={{ name: '', sortOrder: 0 }} fromRow={(r) => r}
        cols={[{ key: 'name', label: 'Category' }, { key: 'description', label: 'Description', mute: true }]}
        toBody={(e) => ({ name: e.name, description: nn(e.description), imageUrl: nn(e.imageUrl), sortOrder: Number(e.sortOrder || 0) })}
        fields={(e, set) => <>{txt('Name', 'name', set, e, { required: true })}<Field label="Description"><textarea className="input" value={e.description ?? ''} onChange={set('description')} /></Field>{txt('Sort order', 'sortOrder', set, e, { type: 'number' })}</>} />}
    </div>
  );
}

export function Inventory() {
  const can = useCan();
  const [sp] = useSearchParams();
  const [q, setQ] = useState('');
  const [alertsOnly, setAlerts] = useState(sp.get('alertsOnly') === 'true');
  const [page, setPage] = useState(1);
  const list = useAdmin('inventory', '/inventory', { q: q || undefined, alertsOnly: alertsOnly || undefined, page });
  const [edit, setEdit] = useState(null);
  const save = useSave({ method: 'PATCH', path: (v) => `/inventory/${v.__id}`, ok: 'Stock updated.', onDone: () => setEdit(null) });
  return (
    <div>
      <PageHead title="Inventory"><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Product or SKU" /><Check label="Low stock only" checked={alertsOnly} onChange={(v) => { setAlerts(v); setPage(1); }} /></PageHead>
      <Table query={list} rows={(list.data?.items ?? []).map((r) => ({ ...r, id: r.variantId }))} page={page} onPage={setPage}
        columns={[
          { key: 'product', label: 'Product', render: (r) => <>{r.product}<span className="muted block text-[.78rem]">{r.brand} · {r.sku}</span></> },
          { key: 'onHand', label: 'On hand', right: true }, { key: 'reserved', label: 'Reserved', right: true },
          { key: 'available', label: 'Available', right: true, render: (r) => <span className={r.low ? 'text-warn' : ''}>{r.available}</span> },
          { key: 'threshold', label: 'Alert at', right: true, mute: true },
          { key: 'act', label: '', render: (r) => can('inventory.write') && <button className="btn btn-line btn-sm" onClick={() => setEdit({ id: r.variantId, name: r.product, onHand: String(r.onHand), threshold: String(r.threshold), reserved: r.reserved })}>Adjust</button> },
        ]} />
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={`Adjust stock: ${edit?.name ?? ''}`}>
        {edit && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ __id: edit.id, onHand: Number(edit.onHand), lowStockThreshold: Number(edit.threshold) }); }}>
          <Field label="Units on hand" hint={`${edit.reserved} reserved by open orders.`}><input className="input" type="number" min={edit.reserved} required value={edit.onHand} onChange={(e) => setEdit({ ...edit, onHand: e.target.value })} /></Field>
          <Field label="Low-stock alert at"><input className="input" type="number" min="0" required value={edit.threshold} onChange={(e) => setEdit({ ...edit, threshold: e.target.value })} /></Field>
          <button className="btn btn-gold" disabled={save.isPending}>Save</button>
        </form>}
      </Modal>
    </div>
  );
}
