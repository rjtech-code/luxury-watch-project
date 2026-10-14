import { useState } from 'react';
import { post } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { toast } from '@/lib/store';

export function NewsletterForm({ id = 'nl', light }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await post('/api/newsletter', { email }); setDone(true); toast.ok('You are subscribed.'); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  if (done) return <p className="text-champagne" role="status">Thank you. You are on the list.</p>;
  return (
    <form onSubmit={submit} className={light ? 'on-light' : ''} noValidate>
      <label htmlFor={id} className="sr-only">Email address</label>
      <div className="flex">
        <input id={id} type="email" required autoComplete="email" placeholder="Your email address" value={email} onChange={(e) => setEmail(e.target.value)} className="input min-w-0 flex-1 border-r-0" />
        <button className={light ? 'btn btn-dark' : 'btn btn-gold'} disabled={busy}>{busy ? 'Subscribing' : 'Subscribe'}</button>
      </div>
    </form>
  );
}
