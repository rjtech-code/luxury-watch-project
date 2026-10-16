# Time Luxe: luxury watch e-commerce platform

React (JSX, Vite) storefront and admin panels, with a Node.js (Express) API on MongoDB. The design blends the three supplied collages (Time Luxe, Timehaven, Timeless). The catalogue is the supplied `server/data/watches.json`: 14 brands, 59 collections, 109 models.

> **Honest state of the data.** The JSON has no prices, photos, specs or stock. The app never invents them for real models: unknown specs show "Not specified", a watch without a price shows "Price on request" and cannot be added to a cart, and a watch without photos shows a labelled line illustration. For development there is an optional demo script that adds placeholder prices and stock, flagged as demo data and announced by a banner on the storefront. Remove it before launch.

## Folder structure

```
luxury-watch-project/
├── src/  public/  test/       the website (React + Vite)
├── index.html  vite.config.js
├── package.json               website packages + the commands below
└── server/                    the backend
    ├── src/                   API (Express + MongoDB)
    ├── data/                  watch catalogue (watches.json) and product photos
    ├── scripts/               starts a local MongoDB
    ├── test/                  API tests
    ├── uploads/               uploaded and catalogue images
    └── .env                   settings and secrets
```

## Quick start

Requirements: Node 20+ and MongoDB 7+ running as a replica set (transactions need one; MongoDB Atlas already is).

```bash
npm install                                 # installs the website and the server together
cp server/.env.example server/.env          # set MONGODB_URI and JWT_SECRET (>= 32 random chars)
npm run db:start                            # local MongoDB in server/.mongo-data (needs `mongod` on PATH); skip if you use Atlas
npm run db:seed                             # collections, indexes, brands, collections, models, settings
npm run db:photos                           # attach the freely licensed product photos
npm run db:demo                             # OPTIONAL, dev only: placeholder prices and stock
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='A-strong-Passw0rd' npm run admin:create
npm run dev                                 # website http://localhost:5173, API http://localhost:4000
```

| Command | What it does |
|---|---|
| `npm run dev` | Website and server together, with hot reload (the website forwards `/api` and `/uploads` to the server) |
| `npm run dev:web` / `npm run dev:server` | Only one of them |
| `npm run build` | Production build of the website into `dist/` |
| `npm start` | Run the server in production |
| `npm test` | API tests (66, against a real MongoDB `luxwatch_test` database) plus website tests |
| `npm run db:start` / `db:stop` | Start or stop the local development MongoDB |
| `npm run db:seed` | Collections, indexes and catalogue import (safe to re-run) |
| `npm run db:photos` | Attach the photos in `server/data/photos` |
| `npm run db:demo` | Placeholder prices and stock for development (`npm run db:demo-reset --prefix server` removes them) |

Create the first **SUPER_ADMIN** only with the `admin:create` command. There is no signup route or API field that can create one.

## Deploying to Vercel

The website and the API deploy together as **one Vercel project**, on one domain. That keeps the login cookies first-party (browsers block cookies from a different domain) and lets `/uploads` work.

- `vercel.json` builds the website into `dist/` and sends `/api/*`, `/uploads/*`, `/sitemap.xml` and `/robots.txt` to `api/index.js`, which runs the Express API as a serverless function.
- Catalogue photos are served from `server/data/photos` (in the repository), so they work without any upload step.

Steps:
1. Import the GitHub repository in Vercel. Leave the root directory as the repository root; the framework is detected as Vite.
2. Add these environment variables (Project, Settings, Environment Variables):
   | Variable | Value |
   |---|---|
   | `MONGODB_URI` | Your Atlas URI, without `replicaSet=...` |
   | `JWT_SECRET` | A long random string (at least 32 characters) |
   | `NODE_ENV` | `production` |
   | `WEB_ORIGIN` and `SITE_URL` | Your site address, e.g. `https://your-app.vercel.app` |
   Do **not** set `VITE_API_URL` (the website and API share the domain).
3. In MongoDB Atlas, Network Access, allow `0.0.0.0/0` (Vercel has no fixed IP addresses).
4. Deploy. Seed the database once from your computer (`npm run db:seed`, `npm run db:photos`, `npm run admin:create`) with `MONGODB_URI` pointing at Atlas.

Limits on Vercel: files uploaded in the admin are stored in `/tmp` and disappear; use object storage (Vercel Blob, S3) for permanent uploads. The 5-minute job that releases stock from unpaid online orders only runs on a long-running server (`npm start`), not on Vercel.

If the API must live on another domain instead, set `CROSS_SITE_COOKIES=true` on the server and `VITE_API_URL` on the website; browsers that block third-party cookies (Safari, some Chrome settings) will still refuse to stay signed in, so one domain is strongly recommended.

## Environment variables (`server/.env`)

| Variable | Purpose |
|---|---|
| `MONGODB_URI`, `JWT_SECRET` | Required. `MONGODB_URI` includes the database name, e.g. `mongodb://127.0.0.1:27017/luxwatch?replicaSet=rs0` or an Atlas `mongodb+srv://` URI. Tests use `TEST_MONGODB_URI` (default `.../luxwatch_test`). |
| `NODE_ENV`, `PORT`, `WEB_ORIGIN`, `SITE_URL` | Runtime, CORS origin, and public URL used in the sitemap and emails. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Online payments. Empty means online payment is disabled and hidden. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email. Empty means emails are written to the server log. |
| `VITE_API_URL` (web) | Only if the API is on a different origin from the web app. |

Secrets exist only on the server. The browser receives the public Razorpay key id only inside an order response.

## Pages and features

**Storefront**: sticky header with mega menus (brands, collections, occasions), search with suggestions and recent searches, cart drawer, announcement bar, footer, and a long home page (hero with a live-time dial, featured watch, categories, brands, collections, best sellers, new arrivals, men's and women's, occasions, limited editions, lazy-loaded 3D, craftsmanship, buying guide, journal, reviews, newsletter, trust bar). Sections with no data hide themselves.
**Catalogue**: Shop, Men's, Women's, Smart, New arrivals, Best sellers, Limited editions, Category, Occasion, Brands, Brand, Collections, Collection and Search pages. All share one listing with URL-based filters (brand, collection, category, gender, movement, occasion, price, case size, water resistance, materials, dial colour, availability), active-filter chips, sort, grid/list view, pagination, mobile filter drawer and quick view. A filter appears only when real products carry that attribute.
**Product page**: gallery with zoom, variants, stock state, restock alerts, specifications with "Not specified", warranty/shipping/returns, 3D tab, reviews with a verified-purchase badge, related and recently viewed, share, wishlist, compare, JSON-LD.
**Also**: wishlist (guest in the browser, merged into the account on login), compare (up to 4), 3D showcase.
**Checkout**: cart with coupons, guest or signed-in checkout, delivery options, gift wrap, Razorpay or cash on delivery (only methods that are enabled and configured are offered), idempotency key, confirmation page that polls for payment status, and order tracking by order number plus verified email or phone.
**Accounts**: sign up, sign in, forgot/reset password, email verification, and a customer area (overview, orders with cancel and return, wishlist, addresses, reviews, notifications, support requests, profile and email preferences, password).
**Manager panel (`/manager`)** and **Super-admin panel (`/admin`)**: sales dashboard (KPIs, net sales chart, top products, brands and categories, table views, CSV export), analytics, orders (status updates, shipments, refunds for super admin only), returns, inventory, products with photo and GLB upload, brands, collections, categories, customers, managers with per-permission control, coupons, review moderation, banners, journal articles, newsletter list, support inbox, settings (business details, tax, delivery, gift wrap, policies, loyalty, payment methods), integrations status, and an audit log. Navigation hides what a role cannot use, and the server enforces every check.
**Content and system pages**: About, Craftsmanship, Contact, FAQ, Shipping, Returns, Warranty and registration, Service request, Privacy, Terms, Journal and articles, 404, unauthorized, error boundary and maintenance. The legal pages are general templates and need review by the owner.
**SEO and quality**: per-page titles, descriptions, canonical URLs and robots, JSON-LD for products and articles, `sitemap.xml` and `robots.txt` from the API, semantic markup, keyboard focus handling in dialogs, visible focus rings, reduced-motion support, responsive layouts checked at 390 px and 1360 px.

## Architecture

```
server/    Express 4 (ESM), MongoDB Node driver, zod validation, pino logging
  src/routes     auth, catalog, cart, checkout (+payments, webhook), account, public, admin-sales, admin-manage
  src/services   cart, orders (stock and payment state machine), razorpay, settings
  src/lib        pricing (integer paise), permissions, audit, mailer, session, catalogue importer
  src/db         client (model wrapper + transactions), models (collections, defaults, indexes), migrate, seed, create-admin, demo-enrich
  test           pricing, importer, security, orders and payments, catalogue and reporting
(root)     React 19, Vite, Tailwind v4, react-router, TanStack Query, zustand, framer-motion, three/R3F, recharts
  src/pages      storefront pages     src/panel   manager and admin screens     src/components   shared UI
```

Key decisions:

- **Money** is integer paise end to end. Prices, tax, shipping and discounts are computed on the server; the browser only displays them. GST is reported inside tax-inclusive totals.
- **Stock** is reserved atomically at checkout, committed when payment is confirmed (or for COD), and released on cancel or after 30 minutes without payment (a 5-minute sweep).
- **Payments**: the checkout signature is verified, then re-confirmed with the Razorpay API, and the amount is checked. The webhook is verified over the raw body and is idempotent through the `payment_events` collection.
- **Auth**: argon2id hashes, short-lived access cookie plus rotating refresh tokens (reuse revokes the whole family), httpOnly SameSite cookies, a CSRF header on writes, rate limits on auth and public forms, and account lockout after repeated failures. Role and status are re-read from the database on every request.
- **Roles**: CUSTOMER, MANAGER and SUPER_ADMIN. Managers get default permissions (products and orders read, order update, sales, exports, inventory read, support) that a super admin can change per person. Refunds, role changes and permission edits are super-admin only.
- **Revenue definitions**: gross = paid orders (COD counts once delivered); net = gross − refunds; cancelled orders never count.
- **Uploads** are checked by file signature (JPEG, PNG, WebP, GLB), not by name or declared type.

## Database

MongoDB collections (defined with their defaults and indexes in `server/src/db/models.js`): users, addresses, refresh_tokens, email_tokens, permissions, role_permissions, user_permissions, audit_logs, brands, collections, categories, products, product_variants, product_images, inventory, carts, cart_items, coupons, orders, order_items, order_status_history, payments, payment_events, shipments, returns, loyalty_ledger, wishlist_items, reviews, notifications, restock_subscriptions, newsletter_subscribers, support_requests, articles, banners, site_settings.

Every document has a UUID `id` (or a natural key such as `key`, `variantId` or `eventId`); unique indexes take the place of primary keys and unique constraints. Checkout, payment, cancellation and stock changes run in multi-document transactions, with conditional updates so stock can never be oversold. `npm run db:migrate` (also run when the API starts) creates any missing collection or index. Take a backup (`mongodump`) before changing production data.

## 3D models and photos

**Homepage hero**: a 3D chronograph on a display pedestal that turns like a showroom turntable and can be dragged all the way round. Its hands show the current time and tick every second.

**3D viewer**: each watch can have its own GLB (Admin, Products). Until it does, the viewer picks a realistic **representative** model of a similar style from 14 free models (chronographs, steel-bracelet, leather dress, square sports, digital and pocket watches), always labelled "not this exact watch" and credited. Two branded models (Longines Presence, a Patek Philippe dress watch) are only used for their own brand. Smartwatches keep the generic drawn watch. Files and licences: `public/models/CREDITS.md`.

**Product photos**: 108 freely licensed photos (CC0, public domain, CC BY, CC BY-SA, from Wikimedia Commons) of 76 of the 109 models are in `server/data/photos/`, listed with author and licence in `server/data/photos.json`. `npm run db:photos` attaches them (it never touches a watch that has admin-uploaded photos). The product page shows each photo's credit, as the licences require. The other 33 models had no usable free photo and still show the illustration.

**Brand images (homepage)**: one photo per brand from the set above, background removed and colour graded to the site theme, in `public/brands/`, credited under "Photo credits" on the homepage (`src/lib/brandImages.js`).

Photos found through image search engines are usually the brands' own or photographers' copyrighted images, so they are not used. For launch, ask each brand or your distributor for official product imagery and upload it in the admin.

## Integration status

| Item | Status |
|---|---|
| Razorpay | Fully implemented and tested with signed test payloads; **not live** until you set the three keys, enable it in Settings, and add the webhook (`/api/payments/webhook`, events payment.captured, order.paid, payment.failed, refund.processed). I could not run a real Razorpay checkout without your credentials. |
| Email | Implemented through SMTP; **not sending** until SMTP is configured (emails go to the log). |
| Cash on delivery | Works; off by default. Turn it on in Admin, Settings, Payments. |

## Still needed from you

- Real **prices, stock, photographs** and specifications for each watch (Admin, Products). Until then the shop shows placeholders and "Not specified".
- **GLB 3D models** of the actual watches. Until then visitors see a labelled representative model (or the generic watch for smartwatches).
- Business **name, email, phone and address** (Admin, Settings), a **logo**, and reviewed **legal text** (privacy, terms, returns, warranty).
- A production **object store and CDN** for uploads (local disk is used now), SMTP credentials, Razorpay keys, and hosting with HTTPS.
- Occasion groupings are an editorial mapping of categories (the data has no occasion field). You can tag products with occasions in the admin.
- Brand names are used only to identify products. The site makes no claim of authenticity or affiliation; add authorised-dealer wording only if it is true.
- Storefront analytics (conversion funnel) is not collected, so that tile says "Not tracked".

## Security notes

No secrets in the frontend; `.env` is git-ignored; SUPER_ADMIN cannot be created or edited through the API; uploads are signature-checked; all inputs are validated with strict zod schemas; order lookups need the order number plus the matching email or phone and return the same error for both failure cases. Run `npm audit` and keep dependencies current before launch.
