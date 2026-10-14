import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { dateFmt } from '@/lib/format';
import { get, post } from '@/lib/api';
import { errMsg, useMe, useSite } from '@/lib/hooks';
import { Seo } from '@/lib/seo';
import { Breadcrumbs, Disclosure, ErrorState, Field, Skeleton } from '@/components/ui';
import { WatchArt } from '@/components/WatchArt';
import { NotFound } from './System';

function Page({ title, intro, path, children, narrow = true }) {
  return (
    <>
      <Seo title={title} description={intro} path={path} />
      <div className="wrap py-12 md:py-16">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: title }]} className="mb-5" />
        <h1 className="text-[clamp(2.2rem,5vw,3.8rem)]">{title}</h1>
        {intro && <p className="muted mt-3 max-w-2xl text-[1.05rem]">{intro}</p>}
        <div className={narrow ? 'prose-lux mt-8 max-w-3xl' : 'mt-8'}>{children}</div>
      </div>
    </>
  );
}

const Review = () => <p className="muted mt-10 border-t rule pt-4 text-[.82rem]">This page is a general template. The store owner should review it, with legal advice where needed, before launch.</p>;

export function About() {
  const { data: site } = useSite();
  const name = site?.brand?.name ?? 'Time Luxe';
  return (
    <Page title="About us" intro={`${name} is an online watch store.`} path="/about">
      <p>We help people find a watch they will enjoy wearing: browse by brand, collection or occasion, compare models side by side and read the details before you buy.</p>
      <h2>How we work</h2>
      <ul>
        <li>Specifications are shown only where they have been supplied. Anything else is marked “Not specified” rather than guessed.</li>
        <li>Prices, delivery costs and taxes are calculated on our servers and confirmed before you pay.</li>
        <li>Card details are handled by our payment provider and never touch our servers.</li>
      </ul>
      <p>Brand names on this site identify the watches offered. {name} is an independent retailer and is not affiliated with, or endorsed by, the manufacturers unless stated on a product page.</p>
      <p><Link to="/contact">Contact us</Link> with any question.</p>
    </Page>
  );
}

export function Craftsmanship() {
  const items = [
    ['Movements', 'The movement is the engine of a watch. Mechanical movements store energy in a spring and release it through hundreds of tiny parts; automatics wind themselves from the motion of your wrist. Quartz movements use a battery and a vibrating crystal, and are very accurate and low-maintenance. Smartwatches add sensors and software.'],
    ['Cases and crystals', 'Cases are commonly stainless steel, titanium, ceramic or precious metals, each with a different weight and feel. Sapphire crystal is highly scratch-resistant; mineral glass is more affordable.'],
    ['Dials and hands', 'Finishing is where watchmakers show their hand: sunburst, guilloché, enamel, lacquer. Look at how crisply the indices and hands are finished and how legible they are.'],
    ['Water resistance', 'A rating in metres is a laboratory pressure test, not a depth guide for swimming. Where a model name states a rating, we show it; otherwise we mark it as not specified.'],
    ['Servicing', 'Mechanical watches benefit from a service every several years. Ask the maker or your service centre for the interval that applies to your model.'],
  ];
  return (
    <Page title="Craftsmanship" intro="What to look for when you hold a watch. General guidance, not claims about any single maker." path="/craftsmanship" narrow={false}>
      <div className="grid items-start gap-10 lg:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-6">{items.map(([t, d]) => <section key={t} className="border-t rule pt-5"><h2 className="text-2xl">{t}</h2><p className="muted mt-2 max-w-prose">{d}</p></section>)}</div>
        <WatchArt kind="complication" seed="craft" className="mx-auto w-full max-w-sm" label="Line illustration of a watch dial" />
      </div>
    </Page>
  );
}

function ContactForm({ endpoint = '/api/support/contact', extra, fields, subjectDefault = '', cta = 'Send message', intro }) {
  const { data: me } = useMe();
  const [f, setF] = useState({ name: '', email: '', phone: '', subject: subjectDefault, message: '' });
  const [d, setD] = useState(Object.fromEntries((fields ?? []).map((x) => [x.key, ''])));
  const m = useMutation({
    mutationFn: () => post(endpoint, { name: f.name || me?.name, email: f.email || me?.email, ...(f.phone ? { phone: f.phone } : {}), subject: f.subject, message: f.message, ...(fields ? { data: Object.fromEntries(Object.entries(d).filter(([, v]) => v)) } : {}) }),
  });
  if (m.isSuccess) return <div role="status" className="border border-champagne/40 p-6"><p className="text-xl">Thank you, we have your request.</p><p className="muted mt-2">Your reference is <strong className="text-ivory">{m.data.reference}</strong>. A confirmation has been sent to your email.</p></div>;
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      {intro}
      {m.error && <p role="alert" className="border border-danger/50 bg-danger/10 px-3 py-2 text-sm sm:col-span-2">{errMsg(m.error)}</p>}
      <Field label="Name"><input className="input" required minLength={2} value={f.name || me?.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
      <Field label="Email"><input className="input" type="email" required value={f.email || me?.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
      <Field label="Phone (optional)"><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></Field>
      <Field label="Subject"><input className="input" required minLength={3} maxLength={120} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
      {(fields ?? []).map((x) => <Field key={x.key} label={x.label}>{x.options ? <select className="input" required={x.required} value={d[x.key]} onChange={(e) => setD({ ...d, [x.key]: e.target.value })}><option value="">Select…</option>{x.options.map((o) => <option key={o}>{o}</option>)}</select> : <input className="input" type={x.type ?? 'text'} required={x.required} value={d[x.key]} onChange={(e) => setD({ ...d, [x.key]: e.target.value })} />}</Field>)}
      <Field label="Message" className="sm:col-span-2"><textarea className="input" required minLength={10} maxLength={3000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
      <div className="sm:col-span-2"><button className="btn btn-gold" disabled={m.isPending}>{m.isPending ? 'Sending…' : cta}</button></div>
    </form>
  );
}

export function Contact() {
  const { data: site } = useSite();
  const b = site?.brand ?? {};
  const details = [['Email', b.email, `mailto:${b.email}`], ['Phone', b.phone, `tel:${b.phone}`], ['Address', b.address]].filter(([, v]) => v);
  return (
    <Page title="Contact us" intro="Questions about a watch, an order or an enquiry? Send us a message." path="/contact" narrow={false}>
      <div className="grid gap-12 lg:grid-cols-[1fr_20rem]">
        <ContactForm />
        <aside>
          <h2 className="text-xl">Other ways to reach us</h2>
          {details.length ? <dl className="mt-3 space-y-3 text-[.92rem]">{details.map(([k, v, href]) => <div key={k}><dt className="muted">{k}</dt><dd>{href ? <a href={href} className="hover:text-champagne">{v}</a> : v}</dd></div>)}</dl> : <p className="muted mt-3 text-[.92rem]">Use the form and we will reply by email.</p>}
          <p className="muted mt-6 text-[.9rem]">Already ordered? <Link to="/track-order" className="text-champagne underline">Track your order</Link>.</p>
        </aside>
      </div>
    </Page>
  );
}

export function Faq() {
  const { data: site } = useSite();
  const days = site?.returnWindowDays ?? 7;
  const qa = [
    ['How do I pay?', 'At checkout you can pay online through Razorpay (cards, UPI, netbanking, wallets) when it is enabled, or by cash on delivery when the store offers it. Only the methods currently available are shown.'],
    ['Are prices final?', 'The price you see at checkout, including delivery and any taxes shown, is the amount charged. Prices are always calculated on our servers.'],
    ['Why does a watch say “Price on request”?', 'We have not listed a price for it. Use the enquiry button on its page and we will reply with availability and pricing.'],
    ['Why is a specification “Not specified”?', 'We only publish details that have been supplied. If something matters to you, ask us before you buy.'],
    ['How do I track my order?', 'Use the Track order page with your order number and the email or phone used at checkout, or sign in to see your orders.'],
    ['Can I cancel an order?', 'Yes, until it has been packed. Use Track order or your account. Online payments for cancelled orders are refunded to the original method.'],
    ['What is your return policy?', `Unworn watches in original condition can be returned within ${days} days of delivery. See the returns page for details.`],
    ['Do I need an account?', 'No. You can check out as a guest. An account lets you save addresses, keep a wishlist across devices and review watches.'],
  ];
  return <Page title="Frequently asked questions" path="/faq">{qa.map(([q, a]) => <Disclosure key={q} title={q}>{a}</Disclosure>)}</Page>;
}

export function Shipping() {
  const { data } = useQuery({ queryKey: ['checkout-options'], queryFn: () => get('/api/checkout/options'), staleTime: 60_000 });
  return (
    <Page title="Shipping" intro="How and when your watch reaches you." path="/shipping">
      <p>Every order is packed securely and shipped with tracking. We currently deliver within India.</p>
      <h2>Delivery options</h2>
      {data ? <ul>{data.delivery.map((d) => <li key={d.key}><strong>{d.label}</strong>: {d.feeMinor ? `₹${d.feeMinor / 100}` : 'free'}{d.etaDays ? `, estimated ${d.etaDays} business days` : ''}{d.freeAboveMinor ? `, free on orders above ₹${d.freeAboveMinor / 100}` : ''}.</li>)}</ul> : <Skeleton className="h-20" />}
      <p>Estimates start once your order is packed. Delays can occur with carriers; your tracking link always shows the latest status.</p>
      <h2>Checking your parcel</h2>
      <p>Please check the packaging on delivery and tell us straight away if it is damaged.</p>
      <Review />
    </Page>
  );
}

export function Returns() {
  const { data: site } = useSite();
  const days = site?.returnWindowDays ?? 7;
  return (
    <Page title="Returns and refunds" path="/returns">
      <h2>Returning a watch</h2>
      <p>You can return a watch within {days} days of delivery if it is unworn, undamaged and complete with its packaging, papers and accessories. Start a return from your account or contact us with your order number.</p>
      <h2>Refunds</h2>
      <p>Once we receive and inspect the watch, we refund the amount paid to the original payment method. Banks can take several working days to show the credit.</p>
      <h2>Cancelling before dispatch</h2>
      <p>You can cancel an order until it has been packed from Track order or your account.</p>
      <h2>Faulty or damaged items</h2>
      <p>Contact us promptly and we will arrange a repair, replacement or refund as appropriate.</p>
      <Review />
    </Page>
  );
}

export function Warranty() {
  const { data: site } = useSite();
  return (
    <Page title="Warranty" intro="Warranty terms depend on the maker and the model." path="/warranty" narrow={false}>
      <div className="prose-lux max-w-3xl">
        <p>{site?.warrantyNote || 'Warranty terms are listed on each watch page where they have been supplied. If a page does not state them, ask us before you buy.'}</p>
        <p>Keep your invoice and any warranty card that comes with the watch.</p>
      </div>
      <h2 id="register" className="mb-4 mt-12 text-2xl">Register your purchase</h2>
      <p className="muted mb-6 max-w-2xl">Tell us about your watch so we can find your order if you need support later.</p>
      <ContactForm endpoint="/api/support/warranty" subjectDefault="Warranty registration" cta="Register" fields={[{ key: 'brand', label: 'Brand', required: true }, { key: 'model', label: 'Model', required: true }, { key: 'serialNumber', label: 'Serial number', required: true }, { key: 'purchaseDate', label: 'Purchase date', type: 'date', required: true }, { key: 'orderNumber', label: 'Order number (optional)' }]} />
    </Page>
  );
}

export function Service() {
  return (
    <Page title="Service request" intro="Ask for a service, repair or battery change." path="/service" narrow={false}>
      <ContactForm endpoint="/api/support/service" subjectDefault="Service request" cta="Request service" fields={[{ key: 'brand', label: 'Brand', required: true }, { key: 'model', label: 'Model', required: true }, { key: 'issue', label: 'Type of service', required: true, options: ['Full service', 'Repair', 'Battery change', 'Strap or bracelet', 'Other'] }, { key: 'serialNumber', label: 'Serial number (optional)' }]} />
    </Page>
  );
}

export function Privacy() {
  const { data: site } = useSite();
  return (
    <Page title="Privacy policy" path="/privacy">
      <h2>What we collect</h2>
      <p>Details you give us: name, email, phone, delivery address, order history and messages. Technical data needed to keep the site secure, such as session cookies.</p>
      <h2>How we use it</h2>
      <p>To process and deliver orders, take payments, respond to enquiries, prevent fraud and, if you opt in, send news. We do not sell your personal data.</p>
      <h2>Payments</h2>
      <p>Card and UPI details are entered with our payment provider and are never stored on our servers.</p>
      <h2>Cookies</h2>
      <p>We use essential cookies to keep you signed in and to remember your cart. Your wishlist and recently viewed watches can be kept in your browser.</p>
      <h2>Your choices</h2>
      <p>You can update or ask us to delete your account data{site?.brand?.email ? <> by writing to <a href={`mailto:${site.brand.email}`}>{site.brand.email}</a></> : <> through our <Link to="/contact">contact page</Link></>}. You can unsubscribe from news at any time.</p>
      <Review />
    </Page>
  );
}

export function Terms() {
  const { data: site } = useSite();
  return (
    <Page title="Terms of sale" path="/terms">
      <h2>Orders</h2>
      <p>An order is accepted when we confirm it. We may cancel an order if an item is unavailable or a price is shown in error, and will refund any payment taken.</p>
      <h2>Prices and payment</h2>
      <p>Prices are in Indian rupees and include taxes where shown at checkout. Payment is taken when you place an order unless you choose cash on delivery.</p>
      <h2>Returns</h2>
      <p>Returns are accepted within {site?.returnWindowDays ?? 7} days as set out in the <Link to="/returns">returns policy</Link>.</p>
      <h2>Brand names</h2>
      <p>Brand names are used to identify products. We are an independent retailer and are not affiliated with manufacturers unless stated.</p>
      <Review />
    </Page>
  );
}

export function JournalIndex() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['articles'], queryFn: () => get('/api/articles') });
  return (
    <Page title="Journal" intro="Guides and notes on choosing and caring for a watch." path="/journal" narrow={false}>
      {error ? <ErrorState error={error} retry={refetch} /> : isLoading ? <Skeleton className="h-64" /> : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((a) => (
            <article key={a.slug} className="group"><Link to={`/journal/${a.slug}`}>
              {a.coverUrl ? <img src={a.coverUrl} alt="" loading="lazy" className="aspect-[3/2] w-full object-cover" /> : <div className="grid aspect-[3/2] place-items-center border rule bg-coal"><WatchArt kind="dress" seed={a.slug} className="size-1/2" label="" /></div>}
              <p className="muted mt-4 text-[.8rem]">{[a.category, dateFmt(a.publishedAt)].filter(Boolean).join(' · ')}</p>
              <h2 className="mt-1 text-2xl group-hover:text-champagne">{a.title}</h2><p className="muted mt-2 text-[.92rem]">{a.excerpt}</p></Link></article>
          ))}
        </div>
      )}
    </Page>
  );
}

export function Article() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['article', slug], queryFn: () => get(`/api/articles/${slug}`), retry: false });
  if (error?.status === 404) return <NotFound />;
  if (isLoading) return <div className="wrap py-16"><Skeleton className="h-64" /></div>;
  if (error) return <ErrorState error={error} />;
  const a = data.article;
  return (
    <>
      <Seo title={a.title} description={a.excerpt} image={a.coverUrl} path={`/journal/${slug}`} jsonLd={{ '@context': 'https://schema.org', '@type': 'Article', headline: a.title, datePublished: a.publishedAt }} />
      <article className="wrap py-12">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Journal', to: '/journal' }, { label: a.title }]} className="mb-5" />
        <p className="muted">{[a.category, dateFmt(a.publishedAt)].filter(Boolean).join(' · ')}</p>
        <h1 className="mt-2 max-w-3xl text-[clamp(2.2rem,5vw,3.6rem)]">{a.title}</h1>
        {a.coverUrl && <img src={a.coverUrl} alt="" className="mt-8 aspect-[2/1] w-full max-w-4xl object-cover" />}
        <div className="prose-lux mt-8">{a.body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
        <Link to="/journal" className="btn btn-line mt-10">More articles</Link>
      </article>
    </>
  );
}
