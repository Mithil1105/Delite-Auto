import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { CartProvider } from "./context/CartContext";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import { RouteTracker } from "./lib/analytics/RouteTracker";
import { RequireAuth } from "./components/RequireAuth";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import ProductDetail from "./pages/ProductDetail";
import About from "./pages/About";
import Brands from "./pages/Brands";
import Contact from "./pages/Contact";
import Cart from "./pages/Cart";
import CheckoutRedirect from "./pages/CheckoutRedirect";
// LEGACY/FALLBACK — no longer routed; see Documentations MD/odoo-native-checkout.md. Kept
// importable (not deleted) in case the Odoo-native handoff needs to be rolled back.
// import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AdminLogin from "./pages/AdminLogin";
import Terms from "./pages/Terms";
import RefundPolicy from "./pages/RefundPolicy";
import ShippingPolicy from "./pages/policies/ShippingPolicy";
import ReturnsPolicy from "./pages/policies/ReturnsPolicy";
import PrivacyPolicy from "./pages/policies/PrivacyPolicy";
import AccountLayout from "./pages/account/AccountLayout";
import AccountOverview from "./pages/account/AccountOverview";
import AccountOrders from "./pages/account/AccountOrders";
import AccountOrderDetail from "./pages/account/AccountOrderDetail";
import AccountReturns from "./pages/account/AccountReturns";
import AccountAddresses from "./pages/account/AccountAddresses";
import AccountProfile from "./pages/account/AccountProfile";
import NotFound from "./pages/NotFound";

import { AdminToastProvider } from "./admin/components/AdminToastProvider";
import { RequireAdminRole, RoleRoute } from "./admin/components/RequireAdminRole";
import { AdminLayout } from "./admin/layouts/AdminLayout";
import { AdminPlaceholder } from "./admin/components/AdminPlaceholder";
import Overview from "./admin/pages/Overview";
import Homepage from "./admin/pages/website/Homepage";
import HomeSectionEditor from "./admin/pages/website/HomeSectionEditor";
import HeroEditor from "./admin/pages/website/Hero";
import AnnouncementEditor from "./admin/pages/website/Announcement";
import PromotionsEditor from "./admin/pages/website/Promotions";
import NavigationEditor from "./admin/pages/website/Navigation";
import FooterEditor from "./admin/pages/website/Footer";
import SeoEditor from "./admin/pages/website/Seo";
import MediaLibrary from "./admin/pages/media/MediaLibrary";
import ProductBrowser from "./admin/pages/products/ProductBrowser";
import AdminOrders from "./admin/pages/orders/Orders";
import OrderDetail from "./admin/pages/orders/OrderDetail";
import Payments from "./admin/pages/payments/Payments";
import Integrations from "./admin/pages/system/Integrations";
import EmailDelivery from "./admin/pages/system/EmailDelivery";
import AdminReviews from "./admin/pages/reviews/Reviews";
import OdooStatus from "./admin/pages/odoo/OdooStatus";
import ActivityLog from "./admin/pages/settings/ActivityLog";
import AppearanceSettings from "./admin/pages/settings/Appearance";
import AdminUsers from "./admin/pages/settings/AdminUsers";
import Security from "./admin/pages/settings/Security";
import AdminContact from "./admin/pages/contact/Contact";
import FeaturedProducts from "./admin/pages/merchandising/Featured";
import TrendingProducts from "./admin/pages/merchandising/Trending";
import NewArrivalsProducts from "./admin/pages/merchandising/NewArrivals";
import HomepageCategories from "./admin/pages/merchandising/Categories";
// Analytics pages (and their charting library) load only when an admin opens them, so none of it
// ships in the storefront bundle.
const AnalyticsShell = lazy(() => import("./admin/analytics/AnalyticsShell").then((m) => ({ default: m.AnalyticsShell })));
const AnalyticsOverview = lazy(() => import("./admin/analytics/pages/Overview"));
const AnalyticsTraffic = lazy(() => import("./admin/analytics/pages/Traffic"));
const AnalyticsPages = lazy(() => import("./admin/analytics/pages/Pages"));
const AnalyticsProducts = lazy(() => import("./admin/analytics/pages/Products"));
const AnalyticsCarts = lazy(() => import("./admin/analytics/pages/Carts"));
const AnalyticsConversion = lazy(() => import("./admin/analytics/pages/Conversion"));
const AnalyticsSearch = lazy(() => import("./admin/analytics/pages/Search"));
const AnalyticsRecommendations = lazy(() => import("./admin/analytics/pages/Recommendations"));
const AnalyticsGeography = lazy(() => import("./admin/analytics/pages/Geography"));
const AnalyticsAcquisition = lazy(() => import("./admin/analytics/pages/Acquisition"));

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <CartProvider>
          <AdminToastProvider>
            <BrowserRouter>
              <RouteTracker />
              <Suspense fallback={<div className="p-10 text-[13.5px] text-steel-500" role="status">Loading…</div>}>
              <Routes>
                <Route path="admin/login" element={<AdminLogin />} />
                <Route
                  path="admin"
                  element={
                    <RequireAdminRole>
                      <AdminLayout />
                    </RequireAdminRole>
                  }
                >
                  <Route index element={<RoleRoute path="/admin"><Overview /></RoleRoute>} />

                  <Route path="website/homepage" element={<RoleRoute path="/admin/website/homepage"><Homepage /></RoleRoute>} />
                  <Route path="website/homepage/:sectionKey" element={<RoleRoute path="/admin/website/homepage"><HomeSectionEditor /></RoleRoute>} />
                  <Route path="website/hero" element={<RoleRoute path="/admin/website/hero"><HeroEditor /></RoleRoute>} />
                  <Route path="website/announcement" element={<RoleRoute path="/admin/website/announcement"><AnnouncementEditor /></RoleRoute>} />
                  <Route path="website/promotions" element={<RoleRoute path="/admin/website/promotions"><PromotionsEditor /></RoleRoute>} />
                  <Route path="website/navigation" element={<RoleRoute path="/admin/website/navigation"><NavigationEditor /></RoleRoute>} />
                  <Route path="website/footer" element={<RoleRoute path="/admin/website/footer"><FooterEditor /></RoleRoute>} />
                  <Route path="website/seo" element={<RoleRoute path="/admin/website/seo"><SeoEditor /></RoleRoute>} />

                  <Route path="media" element={<RoleRoute path="/admin/media"><MediaLibrary /></RoleRoute>} />

                  <Route path="merchandising/featured" element={<RoleRoute path="/admin/merchandising/featured"><FeaturedProducts /></RoleRoute>} />
                  <Route path="merchandising/trending" element={<RoleRoute path="/admin/merchandising/trending"><TrendingProducts /></RoleRoute>} />
                  <Route path="merchandising/new-arrivals" element={<RoleRoute path="/admin/merchandising/new-arrivals"><NewArrivalsProducts /></RoleRoute>} />
                  <Route path="merchandising/categories" element={<RoleRoute path="/admin/merchandising/categories"><HomepageCategories /></RoleRoute>} />
                  <Route path="merchandising/recommendations" element={<RoleRoute path="/admin/merchandising/recommendations"><AdminPlaceholder title="Recommendations" /></RoleRoute>} />

                  <Route path="products" element={<RoleRoute path="/admin/products"><ProductBrowser /></RoleRoute>} />
                  <Route path="orders" element={<RoleRoute path="/admin/orders"><AdminOrders /></RoleRoute>} />
                  <Route path="orders/:id" element={<RoleRoute path="/admin/orders"><OrderDetail /></RoleRoute>} />
                  <Route path="payments" element={<RoleRoute path="/admin/payments"><Payments /></RoleRoute>} />
                  <Route path="customers" element={<RoleRoute path="/admin/customers"><AdminPlaceholder title="Customers" /></RoleRoute>} />
                  {/* Old locations kept as redirects so existing bookmarks keep working. */}
                  <Route path="carts" element={<Navigate to="/admin/analytics/carts" replace />} />
                  <Route path="visitors" element={<Navigate to="/admin/analytics/traffic" replace />} />

                  <Route path="analytics/store" element={<Navigate to="/admin/analytics" replace />} />
                  <Route path="analytics" element={<AnalyticsShell />}>
                    <Route index element={<RoleRoute path="/admin/analytics"><AnalyticsOverview /></RoleRoute>} />
                    <Route path="traffic" element={<RoleRoute path="/admin/analytics/traffic"><AnalyticsTraffic /></RoleRoute>} />
                    <Route path="pages" element={<RoleRoute path="/admin/analytics/pages"><AnalyticsPages /></RoleRoute>} />
                    <Route path="products" element={<RoleRoute path="/admin/analytics/products"><AnalyticsProducts /></RoleRoute>} />
                    <Route path="carts" element={<RoleRoute path="/admin/analytics/carts"><AnalyticsCarts /></RoleRoute>} />
                    <Route path="conversion" element={<RoleRoute path="/admin/analytics/conversion"><AnalyticsConversion /></RoleRoute>} />
                    <Route path="search" element={<RoleRoute path="/admin/analytics/search"><AnalyticsSearch /></RoleRoute>} />
                    <Route path="recommendations" element={<RoleRoute path="/admin/analytics/recommendations"><AnalyticsRecommendations /></RoleRoute>} />
                    <Route path="geography" element={<RoleRoute path="/admin/analytics/geography"><AnalyticsGeography /></RoleRoute>} />
                    <Route path="acquisition" element={<RoleRoute path="/admin/analytics/acquisition"><AnalyticsAcquisition /></RoleRoute>} />
                  </Route>

                  <Route path="reviews" element={<RoleRoute path="/admin/reviews"><AdminReviews /></RoleRoute>} />
                  <Route path="contact" element={<RoleRoute path="/admin/contact"><AdminContact /></RoleRoute>} />

                  <Route path="system/integrations" element={<RoleRoute path="/admin/system/integrations"><Integrations /></RoleRoute>} />
                  {/* Folded into the new Payments page (filter by Odoo sync state) — old bookmarks redirect. */}
                  <Route path="system/odoo-sync" element={<Navigate to="/admin/payments" replace />} />
                  <Route path="system/email" element={<RoleRoute path="/admin/system/email"><EmailDelivery /></RoleRoute>} />
                  <Route path="odoo/status" element={<RoleRoute path="/admin/odoo/status"><OdooStatus /></RoleRoute>} />
                  <Route path="settings" element={<RoleRoute path="/admin/settings"><AppearanceSettings /></RoleRoute>} />
                  <Route path="settings/users" element={<RoleRoute path="/admin/settings/users"><AdminUsers /></RoleRoute>} />
                  <Route path="settings/security" element={<RoleRoute path="/admin/settings/security"><Security /></RoleRoute>} />
                  <Route path="settings/activity" element={<RoleRoute path="/admin/settings/activity"><ActivityLog /></RoleRoute>} />
                </Route>

                <Route element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="shop" element={<Shop />} />
                  <Route path="product/:slug" element={<ProductDetail />} />
                  <Route path="about" element={<About />} />
                  <Route path="brands" element={<Brands />} />
                  <Route path="contact" element={<Contact />} />
                  <Route path="cart" element={<Cart />} />
                  {/* Guest checkout (spec #10-11): no RequireAuth — Checkout.tsx itself branches on
                      whether a session exists. OrderConfirmation reads router state first (works for
                      a guest, who has no session to RLS-fetch the order back with). */}
                  <Route path="checkout" element={<CheckoutRedirect />} />
                  <Route path="order/:id" element={<OrderConfirmation />} />
                  <Route path="login" element={<Login />} />
                  <Route path="signup" element={<Signup />} />
                  <Route path="forgot-password" element={<ForgotPassword />} />
                  <Route path="reset-password" element={<ResetPassword />} />
                  <Route path="account" element={<RequireAuth><AccountLayout /></RequireAuth>}>
                    <Route index element={<AccountOverview />} />
                    <Route path="orders" element={<AccountOrders />} />
                    <Route path="orders/:id" element={<AccountOrderDetail />} />
                    <Route path="returns" element={<AccountReturns />} />
                    <Route path="addresses" element={<AccountAddresses />} />
                    <Route path="profile" element={<AccountProfile />} />
                  </Route>
                  <Route path="terms" element={<Terms />} />
                  <Route path="refund-policy" element={<RefundPolicy />} />
                  <Route path="policies/shipping" element={<ShippingPolicy />} />
                  <Route path="policies/returns" element={<ReturnsPolicy />} />
                  <Route path="policies/privacy" element={<PrivacyPolicy />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
              </Suspense>
            </BrowserRouter>
          </AdminToastProvider>
        </CartProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
