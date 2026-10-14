import { useState } from 'react';
import { dateFmt } from '@/lib/format';
import { Field, Modal } from '@/components/ui';
import { Check, PageHead, Panel, Pill, SearchBox, Select, Table, useAdmin, useSave } from './kit';

export function Customers() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdmin('customers', '/users', { role: 'CUSTOMER', q: q || undefined, page });
  const upd = useSave({ method: 'PATCH', path: (v) => `/users/${v.__id}`, ok: 'Account updated.' });
  return (
    <div>
      <PageHead title="Customers" sub="Customer accounts. Guest checkouts appear in orders only."><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or email" /></PageHead>
      <Table query={list} rows={list.data?.items ?? []} page={page} onPage={setPage} empty="No customers yet."
        columns={[
          { key: 'name', label: 'Name', render: (r) => <>{r.name}<span className="muted block text-[.78rem]">{r.email}</span></> },
          { key: 'createdAt', label: 'Joined', render: (r) => dateFmt(r.createdAt), mute: true },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'ACTIVE' ? 'ok' : 'danger'}>{r.status}</Pill> },
          { key: 'act', label: '', render: (r) => <span className="flex gap-2">
            <button className="btn btn-line btn-sm" onClick={() => upd.mutate({ __id: r.id, status: r.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>{r.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button>
            <button className="btn btn-line btn-sm" onClick={() => window.confirm(`Make ${r.name} a manager? They will get default manager permissions.`) && upd.mutate({ __id: r.id, role: 'MANAGER' })}>Make manager</button></span> },
        ]} />
    </div>
  );
}

function PermissionEditor({ user, onClose }) {
  const perms = useAdmin('permissions', '/permissions');
  const granted = useAdmin('granted', `/users/${user.id}/permissions`);
  const [sel, setSel] = useState(null);
  const save = useSave({ method: 'PUT', path: `/users/${user.id}/permissions`, ok: 'Permissions saved.', onDone: onClose });
  const defaults = perms.data?.managerDefaults ?? [];
  const current = sel ?? (granted.data ? (granted.data.granted.length ? granted.data.granted : defaults) : []);
  const toggle = (k, on) => setSel(on ? [...new Set([...current, k])] : current.filter((x) => x !== k));
  return (
    <Modal open onClose={onClose} title={`Permissions: ${user.name}`}>
      <p className="muted mb-4 text-sm">A manager with no custom selection gets the default manager set. Refunds and role changes are always super-admin only.</p>
      <div className="space-y-2">{(perms.data?.permissions ?? []).map((p) => <div key={p.key}><Check label={<span>{p.description ?? p.key}<span className="muted ml-2 text-[.76rem]">{p.key}</span></span>} checked={current.includes(p.key)} onChange={(v) => toggle(p.key, v)} /></div>)}</div>
      <div className="mt-5 flex gap-3"><button className="btn btn-gold" disabled={save.isPending} onClick={() => save.mutate({ keys: current })}>Save permissions</button><button className="btn btn-line" onClick={() => setSel(defaults)}>Reset to defaults</button></div>
    </Modal>
  );
}

export function Managers() {
  const list = useAdmin('managers', '/users', { role: 'MANAGER' });
  const admins = useAdmin('admins', '/users', { role: 'SUPER_ADMIN' });
  const [add, setAdd] = useState(null);
  const [perm, setPerm] = useState(null);
  const create = useSave({ method: 'POST', path: '/users/managers', ok: 'Manager created.', onDone: () => setAdd(null) });
  const upd = useSave({ method: 'PATCH', path: (v) => `/users/${v.__id}`, ok: 'Account updated.' });
  return (
    <div>
      <PageHead title="Managers and roles" sub="Managers see the sales dashboard and whatever else you grant. Super-admin accounts can only be created from the server command line."><button className="btn btn-gold btn-sm" onClick={() => setAdd({ name: '', email: '', password: '' })}>Add manager</button></PageHead>
      <Table query={list} rows={list.data?.items ?? []} empty="No managers yet."
        columns={[
          { key: 'name', label: 'Name', render: (r) => <>{r.name}<span className="muted block text-[.78rem]">{r.email}</span></> },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'ACTIVE' ? 'ok' : 'danger'}>{r.status}</Pill> },
          { key: 'act', label: '', render: (r) => <span className="flex flex-wrap gap-2"><button className="btn btn-line btn-sm" onClick={() => setPerm(r)}>Permissions</button><button className="btn btn-line btn-sm" onClick={() => upd.mutate({ __id: r.id, status: r.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>{r.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button><button className="btn btn-danger btn-sm" onClick={() => window.confirm('Demote to customer? Their permissions are removed.') && upd.mutate({ __id: r.id, role: 'CUSTOMER' })}>Remove role</button></span> },
        ]} />
      <h2 className="mb-3 mt-10 text-xl">Super administrators</h2>
      <Table rows={admins.data?.items ?? []} columns={[{ key: 'name', label: 'Name' }, { key: 'email', label: 'Email', mute: true }, { key: 'createdAt', label: 'Since', render: (r) => dateFmt(r.createdAt), mute: true }]} />
      <Modal open={Boolean(add)} onClose={() => setAdd(null)} title="Add manager">
        {add && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(add); }}>
          <Field label="Name"><input className="input" required minLength={2} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" required value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} /></Field>
          <Field label="Temporary password" hint="At least 10 characters with upper-case, lower-case and a number. Share it securely and ask them to change it."><input className="input" type="password" required minLength={10} autoComplete="new-password" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} /></Field>
          <button className="btn btn-gold" disabled={create.isPending}>Create manager</button>
        </form>}
      </Modal>
      {perm && <PermissionEditor user={perm} onClose={() => setPerm(null)} />}
    </div>
  );
}
