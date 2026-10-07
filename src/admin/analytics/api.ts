import { supabase } from "../../lib/supabaseClient";

/**
 * Typed wrappers over the admin_analytics_* Postgres functions. The browser never aggregates raw
 * events (spec: no 500,000 rows in React) — every number here is computed in the database, and
 * every function enforces the caller's admin role server-side (42501 -> "no permission").
 */

export interface RpcFilters {
  audience: "all" | "logged_in" | "anonymous";
  device?: string;
  country?: string;
  region?: string;
  source?: string;
  include_internal: boolean;
  include_test: boolean;
}

export class AnalyticsPermissionError extends Error {
  constructor() {
    super("You don't have permission to view this analytics report.");
    this.name = "AnalyticsPermissionError";
  }
}

export async function analyticsRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (error.code === "42501") throw new AnalyticsPermissionError();
    throw new Error(error.message);
  }
  return data as T;
}

// ---- response shapes (only what the UI reads) -------------------------------------------------
export interface Overview {
  sessions: number; unique_visitors: number; logged_in_users: number; new_visitors: number; returning_visitors: number;
  logged_in_sessions: number; page_views: number; product_views: number; add_to_carts: number; removes: number;
  checkout_starts: number; wishlist_adds: number; searches: number; zero_result_searches: number;
  product_view_sessions: number; add_sessions: number; cart_view_sessions: number; checkout_sessions: number; purchase_sessions: number;
  orders: number; revenue: number;
  avg_engaged_per_session: number | null; avg_engaged_per_visitor: number | null; median_engaged_per_session: number | null;
  engaged_sessions: number; low_engagement_sessions: number; pages_per_session: number | null;
  products_viewed_per_session: number | null; median_secs_to_first_product: number | null; median_secs_to_first_add: number | null;
  wishlist_sessions: number;
  abandoned_carts: number; abandoned_value: number; converted_carts: number; recovered_carts: number; active_carts: number;
  first_tracked_at: string | null;
}
export interface SeriesPoint { bucket: string; visitors: number; sessions: number; page_views: number; orders: number; revenue: number }
export interface FunnelStep { key: string; label: string; sessions: number; visitors: number }
export interface Funnel {
  steps: FunnelStep[];
  checkout: { started: number; completed_client: number; failed: number; purchased: number; step_views: Record<string, number> };
}
export interface PageRow {
  path: string; page_type: string; views: number; unique_visitors: number; avg_engaged: number; median_engaged: number;
  avg_scroll: number; entrances: number; exits: number; add_to_carts: number;
}
export interface Labelled { label: string; n: number }
export interface PageDetail {
  path: string;
  totals: { views: number; unique_visitors: number; avg_engaged: number; median_engaged: number; avg_scroll: number; entrances: number; exits: number };
  daily: { day: string; views: number }[];
  scroll: { b0: number; b25: number; b50: number; b75: number; b90: number };
  sources: Labelled[]; devices: Labelled[]; next_pages: Labelled[]; previous_pages: Labelled[];
  geography: { country: string; region: string; city: string; n: number }[];
}
export interface LandingRow { path: string; sessions: number; visitors: number; avg_engaged: number; low_engagement: number; add_sessions: number; purchase_sessions: number; revenue: number }
export interface ExitRow { path: string; exits: number; after_purchase: number }
export interface LandingExit { landing: LandingRow[]; exits: ExitRow[]; total_sessions: number }
export interface SegmentRow {
  label: string; sessions: number; visitors: number; avg_engaged: number; add_sessions: number; checkout_sessions: number;
  purchase_sessions: number; orders: number; revenue: number; utm_source?: string | null; utm_medium?: string | null;
}
export interface GeoRow { label: string; parent: string; country_code: string | null; sessions: number; visitors: number; page_views: number; add_sessions: number; purchase_sessions: number; orders: number; revenue: number }
export interface Audience {
  segments: { anon_sessions: number; anon_purchase_sessions: number; user_sessions: number; user_purchase_sessions: number;
    new_sessions: number; new_purchase_sessions: number; returning_sessions: number; returning_purchase_sessions: number };
  purchasers: number; avg_sessions_to_purchase: number | null; avg_days_to_purchase: number | null; repeat_purchasers: number;
}
export interface Identity { kind: "anonymous" | "customer"; user_id?: string; name?: string | null; email?: string | null; phone?: string | null; revealed?: boolean }
export interface RecentSession {
  session_id: string; started_at: string; last_activity_at: string; country_name: string | null; region: string | null; city: string | null;
  device_type: string | null; browser_family: string | null; source_channel: string; page_view_count: number; engaged_seconds: number;
  is_test: boolean; last_path: string | null; cart_value: number | null; cart_items: number | null; identity: Identity;
}
export interface ProductRow {
  odoo_template_id: number; views: number; unique_viewers: number; view_sessions: number; adds: number; units_added: number; add_sessions: number;
  removes: number; wishlist_adds: number; checkout_carts: number; abandoned_carts: number; abandoned_value: number;
  orders: number; units_sold: number; revenue: number; rec_impressions: number; rec_clicks: number; rec_adds: number;
}
export interface ProductDetail {
  odoo_template_id: number;
  funnel: { view_sessions: number; views: number; unique_viewers: number; add_sessions: number; adds: number; removes: number; checkout_carts: number; abandoned_carts: number; carts: number; orders: number; revenue: number; units: number };
  pdp: { avg_engaged: number | null; median_engaged: number | null; avg_scroll: number | null; page_views: number } | null;
  sources: Labelled[]; devices: Labelled[]; geography: { country: string; region: string; city: string; n: number }[];
  recommendations: { surface: string; strategy: string; impressions: number; clicks: number; adds: number }[];
  co_carted: { odoo_template_id: number; carts: number }[];
  daily: { day: string; views: number; adds: number }[];
}
export interface CartsSummary {
  created: number;
  kpis: { active: number; abandoned: number; converted: number; recovered: number; abandoned_value: number; avg_cart_value: number | null;
    avg_abandoned_value: number | null; avg_items: number | null; abandoned_after_checkout: number; age_30m_6h: number; age_6h_24h: number; age_1d_3d: number; age_3d_plus: number };
  daily: { day: string; abandoned: number; abandoned_value: number; converted: number }[];
}
export interface CartRow {
  cart_id: string; status: string; recovered: boolean; last_activity_at: string; abandoned_at: string | null; converted_at: string | null;
  minutes_since: number; item_count: number; cart_value: number; checkout_started: boolean; visitor_id: string; identity: Identity;
  country_name: string | null; region: string | null; city: string | null; device_type: string | null; source_channel: string | null;
  session_engaged_seconds: number | null; session_page_views: number | null; last_path: string | null;
  items: { odoo_template_id: number; quantity: number; unit_price: number }[];
}
export interface TimelineItem { at: string; kind: string; label: string | null; engaged: number | null; template_id: number | null; qty: number | null; value: number | null; scroll?: number | null; session_id?: string }
export interface SessionLite {
  id: string; started_at: string; landing_path: string; source_channel: string; referrer_domain: string | null; utm_campaign: string | null;
  device_type: string | null; browser_family: string | null; country_name: string | null; region: string | null; city: string | null;
  engaged_seconds: number; page_view_count: number;
}
export interface CartDetail {
  cart: { id: string; status: string; recovered: boolean; created_at: string; last_activity_at: string; checkout_started_at: string | null; converted_at: string | null;
    abandoned_at: string | null; returned_at: string | null; current_item_count: number; observed_cart_value: number; user_id: string | null };
  visitor_id: string; identity: Identity;
  items: { odoo_template_id: number; odoo_variant_id: number; quantity: number; observed_unit_price: number; observed_line_value: number; removed: boolean }[];
  sessions: SessionLite[]; timeline: TimelineItem[];
}
export interface CartPairs {
  carted_together: { a: number; b: number; carts: number }[];
  purchased_together: { a: number; b: number; orders: number }[];
  carts_with_items: number; orders: number; min_support: number;
}
export interface SearchRow {
  query: string; display: string; searches: number; unique_searchers: number; zero_results: number; clicks: number; adds: number; purchases: number; last_searched_at: string;
}
export interface Searches {
  kpis: { searches: number; unique_searchers: number; zero_results: number; clicks: number; adds: number; purchases: number };
  queries: SearchRow[];
}
export interface SearchDetail {
  query: string; searches: number; zero_results: number; median_secs_to_click: number | null;
  clicked_products: { odoo_template_id: number; n: number }[]; added_products: { odoo_template_id: number; n: number }[];
}
export interface RecRow { label: string; surface: string | null; impressions: number; clicks: number; adds: number }
export interface SessionJourney {
  session: { id: string; visitor_id: string; started_at: string; last_activity_at: string; landing_path: string; source_channel: string; referrer_domain: string | null;
    utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; device_type: string | null; browser_family: string | null; os_family: string | null;
    country_name: string | null; region: string | null; city: string | null; engaged_seconds: number; page_view_count: number; event_count: number;
    is_test: boolean; is_internal: boolean; is_returning_visitor: boolean };
  identity: Identity; timeline: TimelineItem[];
  carts: { id: string; status: string; current_item_count: number; observed_cart_value: number; checkout_started_at: string | null; converted_at: string | null }[];
}
export interface CustomerJourney {
  identity: Identity;
  sessions: { id: string; started_at: string; device_type: string | null; city: string | null; source_channel: string; page_view_count: number; engaged_seconds: number }[];
  timeline: TimelineItem[]; orders: { n: number; revenue: number; first_at: string | null; last_at: string | null };
}
export interface Insight { code: string; severity: "info" | "warning" | "positive"; params: Record<string, number | string> }
export interface Health {
  first_tracked_at: string | null; last_session_at: string | null; sessions_total: number; sessions_24h: number;
  geo_resolved_pct: number | null; test_sessions: number; internal_sessions: number;
}
