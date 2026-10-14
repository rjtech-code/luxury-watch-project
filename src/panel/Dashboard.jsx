import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { csvUrl } from '@/lib/api';
import { money, moneyCompact, plural } from '@/lib/format';
import { useCan } from '@/lib/hooks';
import { Icon } from '@/components/ui';
import { Panel, PageHead, Select, Table, useAdmin } from './kit';

// One hue for magnitude (champagne), muted ink for axes. Values are read from tooltips and the table view.
const INK = '#9b9283';
const GOLD = '#d2b57b';
const GRID = '#2b2722';

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400_000));

function useRange() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(iso(new Date()));
  const [granularity, setG] = useState('day');
  const [preset, setPreset] = useState('30');
  const choose = (v) => { setPreset(v); if (v !== 'custom') { setFrom(daysAgo(Number(v) - 1)); setTo(iso(new Date())); } };
  const ui = (
    <div className="flex flex-wrap items-center gap-2">
      <Select label="Period" value={preset} onChange={choose} options={[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months'], ['custom', 'Custom']]} />
      {preset === 'custom' && <><input className="input !min-h-10 !w-auto" type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /><input className="input !min-h-10 !w-auto" type="date" aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></>}
      <Select label="Group by" value={granularity} onChange={setG} options={[['day', 'By day'], ['week', 'By week'], ['month', 'By month']]} />
    </div>
  );
  return { query: { from, to, granularity }, ui };
}

function Tile({ label, value, sub, to }) {
  const body = <><p className="muted text-[.8rem]">{label}</p><p className="h-display mt-1 text-[1.9rem] leading-none tabular-nums">{value}</p>{sub && <p className="muted mt-2 text-[.78rem]">{sub}</p>}</>;
  const cls = 'block border rule bg-coal p-4';
  return to ? <Link to={to} className={`${cls} hover:border-champagne/50`}>{body}</Link> : <div className={cls}>{body}</div>;
}

const tipStyle = { background: '#1c1916', border: '1px solid #2b2722', borderRadius: 2, color: '#f5efe3', fontSize: 13 };
const short = (s, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Ranked({ title, rows, nameKey = 'name' }) {
  const [table, setTable] = useState(false);
  const data = rows.slice(0, 8).map((r) => ({ ...r, label: short(r[nameKey]), revenue: r.revenueMinor / 100 }));
  return (
    <Panel title={title}>
      {!rows.length ? <p className="muted py-10 text-center text-sm">No sales in this period.</p> : (
        <>
          <button className="muted mb-2 text-[.78rem] underline decoration-champagne/50 underline-offset-4" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show as table'}</button>
          {table ? (
            <table className="table-lux"><thead><tr><th>{title}</th><th className="text-right">Units</th><th className="text-right">Revenue</th></tr></thead><tbody>{rows.map((r) => <tr key={r[nameKey]}><td>{r[nameKey]}</td><td className="text-right tabular-nums">{r.units}</td><td className="text-right tabular-nums">{money(r.revenueMinor)}</td></tr>)}</tbody></table>
          ) : (
            <div role="img" aria-label={`${title}: ${data.map((d) => `${d.name} ${money(d.revenueMinor)}`).join(', ')}`} style={{ height: 28 * data.length + 40 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }} barCategoryGap={6}>
                  <CartesianGrid horizontal={false} stroke={GRID} />
                  <XAxis type="number" tickFormatter={(v) => moneyCompact(v * 100)} stroke={INK} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" width={130} stroke={INK} fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(210,181,123,.08)' }} contentStyle={tipStyle} formatter={(v, _n, p) => [`${money(v * 100)} · ${plural(p.payload.units, 'unit')}`, 'Revenue']} labelFormatter={(_l, p) => p?.[0]?.payload?.name} />
                  <Bar dataKey="revenue" fill={GOLD} radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

export function Dashboard({ scope }) {
  const { query, ui } = useRange();
  const can = useCan();
  const q = useAdmin('dashboard', '/dashboard', query);
  const [table, setTable] = useState(false);
  const d = q.data;
  const series = useMemo(() => (d?.series ?? []).map((s) => ({ ...s, net: s.netMinor / 100 })), [d]);
  const k = d?.kpis;
  return (
    <div>
      <PageHead title={scope === 'admin' ? 'Admin dashboard' : 'Sales dashboard'} sub="Sales count only paid orders (cash on delivery counts once delivered). Net = gross − refunds.">
        {ui}
        {can('reports.export') && <a className="btn btn-line btn-sm" href={csvUrl('/api/admin/reports/sales.csv', { from: query.from, to: query.to })}><Icon name="download" size={15} />Export CSV</a>}
      </PageHead>
      {q.error ? <p role="alert" className="border border-danger/50 bg-danger/10 p-4 text-sm">{q.error.message}</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Net sales" value={k ? money(k.netMinor) : '–'} sub={k && `Gross ${money(k.grossMinor)} · refunds ${money(k.refundsMinor)}`} />
            <Tile label="Paid orders" value={k?.orders ?? '–'} sub={k && `Average ${money(k.averageOrderMinor)}`} to="orders" />
            <Tile label="To fulfil" value={k?.pendingOrders ?? '–'} sub="Awaiting payment, processing or packed" to="orders?status=PROCESSING" />
            <Tile label="Open returns" value={k?.openReturnRequests ?? '–'} sub={k && `${k.cancelledOrders} cancelled orders`} to="returns" />
          </div>
          {k?.inventoryAlerts > 0 && can('inventory.read') && <Link to="inventory?alertsOnly=true" className="mt-3 flex items-center gap-2 border border-warn/40 bg-warn/10 p-3 text-sm"><Icon name="alert" size={17} className="text-warn" />{plural(k.inventoryAlerts, 'variant')} at or below the low-stock threshold</Link>}

          <Panel title="Net sales over time" className="mt-6">
            {!series.length ? <p className="muted py-12 text-center text-sm">No paid orders in this period yet.</p> : (
              <>
                <button className="muted mb-2 text-[.78rem] underline decoration-champagne/50 underline-offset-4" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show as table'}</button>
                {table ? (
                  <div className="max-h-80 overflow-auto"><table className="table-lux"><thead><tr><th>Period</th><th className="text-right">Orders</th><th className="text-right">Gross</th><th className="text-right">Refunds</th><th className="text-right">Net</th></tr></thead><tbody>{d.series.map((s) => <tr key={s.bucket}><td>{s.bucket}</td><td className="text-right">{s.orders}</td><td className="text-right tabular-nums">{money(s.grossMinor)}</td><td className="text-right tabular-nums">{money(s.refundsMinor)}</td><td className="text-right tabular-nums">{money(s.netMinor)}</td></tr>)}</tbody></table></div>
                ) : (
                  <div className="h-72" role="img" aria-label={`Net sales per ${query.granularity}, ${series.length} points, total ${money(k.netMinor)}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series} margin={{ left: 0, right: 12, top: 8 }}>
                        <CartesianGrid vertical={false} stroke={GRID} />
                        <XAxis dataKey="bucket" stroke={INK} fontSize={11} tickLine={false} axisLine={false} minTickGap={32} />
                        <YAxis tickFormatter={(v) => moneyCompact(v * 100)} stroke={INK} fontSize={11} tickLine={false} axisLine={false} width={64} />
                        <Tooltip contentStyle={tipStyle} cursor={{ stroke: INK, strokeDasharray: '3 3' }} formatter={(v, _n, p) => [`${money(v * 100)} · ${plural(p.payload.orders, 'order')}`, 'Net sales']} />
                        <Line type="monotone" dataKey="net" stroke={GOLD} strokeWidth={2} dot={series.length < 40 ? { r: 3, fill: GOLD, stroke: '#141210', strokeWidth: 2 } : false} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </Panel>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Ranked title="Top products" rows={d?.topProducts ?? []} />
            <Ranked title="Sales by brand" rows={d?.byBrand ?? []} />
            <Ranked title="Sales by category" rows={d?.byCategory ?? []} />
          </div>
        </>
      )}
    </div>
  );
}

export function Analytics() {
  const { query, ui } = useRange();
  const q = useAdmin('analytics', '/analytics', query);
  const d = q.data;
  return (
    <div>
      <PageHead title="Analytics" sub="Customers and product performance for the period.">{ui}</PageHead>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="New customer accounts" value={d?.newCustomers ?? '–'} />
        <Tile label="Customers with repeat purchases" value={d?.repeatPurchase ? `${d.repeatPurchase.repeatBuyers} of ${d.repeatPurchase.buyers}` : '–'} sub={d?.repeatPurchase?.rate != null ? `${Math.round(d.repeatPurchase.rate * 100)}% of signed-in buyers` : 'No signed-in buyers yet'} />
        <Tile label="Conversion funnel" value="Not tracked" sub="Needs storefront analytics events, which are not collected." />
      </div>
      <h2 className="mb-3 mt-8 text-xl">Product performance</h2>
      <Table query={q} rows={d?.productPerformance ?? []} empty="No paid orders in this period." columns={[{ key: 'name', label: 'Product' }, { key: 'orders', label: 'Orders', right: true }, { key: 'units', label: 'Units', right: true }, { key: 'revenueMinor', label: 'Revenue', right: true, render: (r) => money(r.revenueMinor) }]} />
    </div>
  );
}
