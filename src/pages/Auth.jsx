import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { post } from '@/lib/api';
import { errMsg, useAuthActions, useMe } from '@/lib/hooks';
import { Seo } from '@/lib/seo';
import { Field, Spinner } from '@/components/ui';

const PW_HINT = 'At least 10 characters with an upper-case letter, a lower-case letter and a number.';

function Shell({ title, sub, children, footer }) {
  return (
    <div className="wrap grid min-h-[70dvh] place-items-center py-14">
      <Seo title={title} noindex />
      <div className="w-full max-w-md border rule bg-coal p-7 sm:p-9">
        <h1 className="text-[2rem]">{title}</h1>
        {sub && <p className="muted mt-2 text-[.92rem]">{sub}</p>}
        <div className="mt-6">{children}</div>
        {footer && <p className="muted mt-6 text-center text-[.88rem]">{footer}</p>}
      </div>
    </div>
  );
}
const Err = ({ e }) => e ? <p role="alert" className="mb-4 border border-danger/50 bg-danger/10 px-3 py-2 text-sm">{errMsg(e)}</p> : null;
const roleHome = (u) => (u.role === 'SUPER_ADMIN' ? '/admin' : u.role === 'MANAGER' ? '/manager' : '/account');

export function Login() {
  const { data: me } = useMe();
  const { login } = useAuthActions();
  const nav = useNavigate();
  const { state } = useLocation();
  const [f, setF] = useState({ email: '', password: '' });
  if (me) return <Navigate to={state?.from ?? roleHome(me)} replace />;
  return (
    <Shell title="Sign in" footer={<>New here? <Link to="/signup" state={state} className="text-champagne underline">Create an account</Link></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); login.mutate(f, { onSuccess: (r) => nav(state?.from ?? roleHome(r.user), { replace: true }) }); }}>
        <Err e={login.error} />
        <Field label="Email"><input className="input" type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password"><input className="input" type="password" required autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <div className="text-right text-[.86rem]"><Link to="/forgot-password" className="text-champagne hover:underline">Forgot password?</Link></div>
        <button className="btn btn-gold w-full" disabled={login.isPending}>{login.isPending ? <Spinner className="size-4" /> : 'Sign in'}</button>
      </form>
    </Shell>
  );
}

export function Signup() {
  const { data: me } = useMe();
  const { signup } = useAuthActions();
  const nav = useNavigate();
  const { state } = useLocation();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  if (me) return <Navigate to={state?.from ?? '/account'} replace />;
  return (
    <Shell title="Create account" sub="Track orders, save addresses and keep a wishlist." footer={<>Already have an account? <Link to="/login" state={state} className="text-champagne underline">Sign in</Link></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); signup.mutate({ ...f, phone: f.phone || undefined }, { onSuccess: () => nav(state?.from ?? '/account', { replace: true }) }); }}>
        <Err e={signup.error} />
        <Field label="Full name"><input className="input" required minLength={2} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone (optional)"><input className="input" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Password" hint={PW_HINT}><input className="input" type="password" required minLength={10} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <button className="btn btn-gold w-full" disabled={signup.isPending}>{signup.isPending ? <Spinner className="size-4" /> : 'Create account'}</button>
      </form>
    </Shell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const m = useMutation({ mutationFn: () => post('/api/auth/forgot-password', { email }) });
  return (
    <Shell title="Reset password" sub="Enter your email and we will send a reset link if an account exists." footer={<Link to="/login" className="text-champagne underline">Back to sign in</Link>}>
      {m.isSuccess ? <p role="status">If an account exists for that address, a reset link is on its way. It expires in 30 minutes.</p> : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <Err e={m.error} />
          <Field label="Email"><input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <button className="btn btn-gold w-full" disabled={m.isPending}>Send reset link</button>
        </form>
      )}
    </Shell>
  );
}

export function Reset() {
  const [sp] = useSearchParams();
  const token = sp.get('token') ?? '';
  const [password, setPassword] = useState('');
  const m = useMutation({ mutationFn: () => post('/api/auth/reset-password', { token, password }) });
  return (
    <Shell title="Choose a new password" footer={<Link to="/login" className="text-champagne underline">Sign in</Link>}>
      {!token ? <p role="alert">This reset link is missing its token. Request a new one from <Link to="/forgot-password" className="underline">forgot password</Link>.</p>
        : m.isSuccess ? <p role="status">Your password has been changed. You can now <Link to="/login" className="text-champagne underline">sign in</Link>.</p> : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <Err e={m.error} />
          <Field label="New password" hint={PW_HINT}><input className="input" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <button className="btn btn-gold w-full" disabled={m.isPending}>Update password</button>
        </form>
      )}
    </Shell>
  );
}

export function VerifyEmail() {
  const [sp] = useSearchParams();
  const token = sp.get('token');
  const m = useMutation({ mutationFn: () => post('/api/auth/verify-email', { token }) });
  useEffect(() => { if (token) m.mutate(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Shell title="Verify email">
      {!token ? <p role="alert">This link is missing its token.</p> : m.isPending || m.isIdle ? <Spinner className="size-6" /> : m.isSuccess ? <p role="status">Your email address is verified. <Link to="/account" className="text-champagne underline">Go to your account</Link>.</p> : <Err e={m.error} />}
    </Shell>
  );
}
