import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import Home from './pages/Home';
import { BestSellers, Category, Limited, Mens, NewArrivals, Occasion, OccasionIndex, Search, Shop, Smart, Womens } from './pages/Listing';
import { BrandDetail, Brands, CollectionDetail, Collections } from './pages/Brands';
import Product from './pages/Product';
import { Compare, Showcase, Wishlist } from './pages/Lists';
import { Maintenance as MaintenancePage, NotFound, Unauthorized } from './pages/System';

const lz = (f, name) => lazy(() => f().then((m) => ({ default: m[name] ?? m.default })));
const Cart = lz(() => import('./pages/Cart'), 'CartPage');
const Checkout = lz(() => import('./pages/Checkout'), 'Checkout');
const OrderDone = lz(() => import('./pages/Checkout'), 'OrderConfirmation');
const TrackOrder = lz(() => import('./pages/Checkout'), 'TrackOrder');
const Auth = (n) => lz(() => import('./pages/Auth'), n);
const Login = Auth('Login'); const Signup = Auth('Signup'); const Forgot = Auth('Forgot'); const Reset = Auth('Reset'); const Verify = Auth('VerifyEmail');
const Account = lz(() => import('./pages/Account'), 'AccountRoutes');
const Static = (n) => lz(() => import('./pages/Static'), n);
const About = Static('About'); const Craft = Static('Craftsmanship'); const Contact = Static('Contact'); const Faq = Static('Faq');
const Shipping = Static('Shipping'); const Returns = Static('Returns'); const Warranty = Static('Warranty'); const Service = Static('Service');
const Privacy = Static('Privacy'); const Terms = Static('Terms'); const JournalIndex = Static('JournalIndex'); const Article = Static('Article');
const Panel = lz(() => import('./panel/Panel'), 'PanelRoutes');

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const Fallback = () => <div className="grid min-h-[50dvh] place-items-center"><Spinner className="size-8 text-champagne" /></div>;

export default function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <ScrollTop />
      <Routes>
        <Route path="/admin/*" element={<Panel scope="admin" />} />
        <Route path="/manager/*" element={<Panel scope="manager" />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="shop" element={<Shop />} />
          <Route path="search" element={<Search />} />
          <Route path="mens-watches" element={<Mens />} />
          <Route path="womens-watches" element={<Womens />} />
          <Route path="smart-watches" element={<Smart />} />
          <Route path="new-arrivals" element={<NewArrivals />} />
          <Route path="best-sellers" element={<BestSellers />} />
          <Route path="limited-editions" element={<Limited />} />
          <Route path="category/:slug" element={<Category />} />
          <Route path="occasion" element={<OccasionIndex />} />
          <Route path="occasion/:key" element={<Occasion />} />
          <Route path="brands" element={<Brands />} />
          <Route path="brands/:slug" element={<BrandDetail />} />
          <Route path="collections" element={<Collections />} />
          <Route path="collections/:slug" element={<CollectionDetail />} />
          <Route path="watches/:slug" element={<Product />} />
          <Route path="compare" element={<Compare />} />
          <Route path="wishlist" element={<Wishlist />} />
          <Route path="showcase" element={<Showcase />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="order/:orderNumber" element={<OrderDone />} />
          <Route path="track-order" element={<TrackOrder />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route path="forgot-password" element={<Forgot />} />
          <Route path="reset-password" element={<Reset />} />
          <Route path="verify-email" element={<Verify />} />
          <Route path="account/*" element={<Account />} />
          <Route path="about" element={<About />} />
          <Route path="craftsmanship" element={<Craft />} />
          <Route path="contact" element={<Contact />} />
          <Route path="faq" element={<Faq />} />
          <Route path="shipping" element={<Shipping />} />
          <Route path="returns" element={<Returns />} />
          <Route path="warranty" element={<Warranty />} />
          <Route path="service" element={<Service />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="journal" element={<JournalIndex />} />
          <Route path="journal/:slug" element={<Article />} />
          <Route path="unauthorized" element={<Unauthorized />} />
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
