import { Component } from 'react';
import { Link, useRouteError } from 'react-router-dom';
import { Seo } from '@/lib/seo';
import { Icon } from '@/components/ui';

function Screen({ code, title, body, children, icon }) {
  return (
    <div className="wrap grid min-h-[60dvh] place-items-center py-20 text-center">
      <Seo title={title} noindex />
      <div className="max-w-lg">
        {code ? <p className="h-display text-[clamp(4rem,12vw,8rem)] leading-none text-champagne">{code}</p> : <Icon name={icon ?? 'alert'} size={44} className="mx-auto text-champagne" />}
        <h1 className="mt-4 text-[clamp(1.8rem,4vw,2.6rem)]">{title}</h1>
        <p className="muted mt-3">{body}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>
      </div>
    </div>
  );
}

export const NotFound = () => (
  <Screen code="404" title="This page isn't here" body="The link may be out of date, or the watch may no longer be listed.">
    <Link to="/" className="btn btn-gold">Back to home</Link>
    <Link to="/shop" className="btn btn-line">Browse watches</Link>
  </Screen>
);

export const Unauthorized = () => (
  <Screen icon="lock" title="You don't have access" body="This area is for staff accounts with the right permissions. If you think this is a mistake, contact an administrator.">
    <Link to="/" className="btn btn-gold">Back to home</Link>
    <Link to="/account" className="btn btn-line">My account</Link>
  </Screen>
);

export const ErrorScreen = ({ reset }) => (
  <Screen title="Something went wrong" body="An unexpected error occurred. You can try again, or head back to the home page.">
    {reset && <button className="btn btn-gold" onClick={reset}>Try again</button>}
    <a href="/" className="btn btn-line">Back to home</a>
  </Screen>
);

export const Maintenance = () => (
  <Screen icon="rotate" title="Back shortly" body="We're making some improvements and will be back soon. Orders already placed are not affected." />
);

export function RouteError() {
  const err = useRouteError();
  if (err?.status === 404) return <NotFound />;
  return <ErrorScreen />;
}

/** Catches render errors anywhere below it so a bug never leaves a blank page. */
export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { if (import.meta.env.DEV) console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorScreen reset={() => { this.setState({ error: null }); }} />;
  }
}
