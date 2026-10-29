import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DealerAuthProvider } from "./DealerAuth";
import { DealerShell } from "./DealerShell";
import { dealerBasename } from "./lib/media";
import { DealerNotFound, ForgotPassword, Landing, Login, PublicContact, SetPassword } from "./pages/public";
import { PageSkeleton } from "./ui";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Catalog = lazy(() => import("./pages/Catalog").then((m) => ({ default: m.Catalog })));
const ProductDetail = lazy(() => import("./pages/Catalog").then((m) => ({ default: m.ProductDetail })));
const Cart = lazy(() => import("./pages/Cart").then((m) => ({ default: m.Cart })));
const Checkout = lazy(() => import("./pages/Cart").then((m) => ({ default: m.Checkout })));
const Orders = lazy(() => import("./pages/Orders").then((m) => ({ default: m.Orders })));
const OrderDetail = lazy(() => import("./pages/Orders").then((m) => ({ default: m.OrderDetail })));
const Account = lazy(() => import("./pages/Account").then((m) => ({ default: m.Account })));
const Support = lazy(() => import("./pages/Account").then((m) => ({ default: m.Support })));

/**
 * The dealer portal SPA — a separate entry (dealer.html) from the B2C storefront, so none of its code
 * ships in the storefront bundle. Unknown/forbidden paths fall through to a safe 404; every
 * authenticated route sits behind DealerShell, which redirects to /login with a validated returnTo.
 */
export default function DealerApp() {
  return (
    <BrowserRouter basename={dealerBasename() || "/"}>
      <DealerAuthProvider>
        <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
          <Routes>
            <Route index element={<Landing />} />
            <Route path="login" element={<Login />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="invite/accept" element={<SetPassword mode="invite" />} />
            <Route path="reset-password" element={<SetPassword mode="reset" />} />
            <Route path="support-public" element={<PublicContact />} />
            <Route element={<DealerShell />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="catalog" element={<Catalog />} />
              <Route path="catalog/:templateId" element={<ProductDetail />} />
              <Route path="cart" element={<Cart />} />
              <Route path="checkout" element={<Checkout />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="account" element={<Account />} />
              <Route path="support" element={<Support />} />
            </Route>
            <Route path="*" element={<DealerNotFound />} />
          </Routes>
        </Suspense>
      </DealerAuthProvider>
    </BrowserRouter>
  );
}
