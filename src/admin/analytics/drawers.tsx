import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type {
  CartDetail, CustomerJourney, PageDetail, ProductDetail, SearchDetail, SessionJourney, TimelineItem,
} from "./api";
import { usePeriodArgs, useProductInfo, useRpc } from "./hooks";
import { Async, Badge, Drawer, ErrorBlock, KeyValue, Panel } from "./ui";
import { IdentityLabel, LocationText, ProductCell, useCanSeeCustomers } from "./cells";
import { FunnelBars, RankedBars, SERIES_COLORS } from "./charts";
import { fmtDuration, fmtMoney, fmtNumber, fmtPercent, shortId } from "./format";
import { STORE_TZ, formatBucket } from "./dateRange";
import { analyticsRpc } from "./api";
import { useAuth } from "../../context/AuthContext";

const dayTick = (d: string) => formatBucket(`${d}T00:00:00`, "day");

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: STORE_TZ });
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: STORE_TZ });

// ---------------------------------------------------------------------------------------------
// Timeline: a readable, chronological journey — never raw JSON.
// ---------------------------------------------------------------------------------------------
function describe(item: TimelineItem, name: (id: number) => string): { text: string; tone: "neutral" | "good" | "warn" | "info" } {
  const p = item.template_id ? name(item.template_id) : "";
  const label = item.label ?? "";
  switch (item.kind) {
    case "page_view": return { text: `Viewed ${label}${item.engaged ? ` · ${fmtDuration(item.engaged)} on page` : ""}${item.scroll ? ` · scrolled ${item.scroll}%` : ""}`, tone: "neutral" };
    case "product_view": return { text: `Viewed product ${p}`, tone: "neutral" };
    case "search_submitted": return { text: `Searched “${label}”`, tone: "info" };
    case "search_zero_results": return { text: `Search “${label}” found nothing`, tone: "warn" };
    case "search_result_click": return { text: `Clicked search result ${p}`, tone: "info" };
    case "add_to_cart": return { text: `Added ${p} × ${item.qty ?? 1}${item.value ? ` (${fmtMoney(item.value)})` : ""}`, tone: "good" };
    case "remove_from_cart": return { text: `Removed ${p}`, tone: "warn" };
    case "cart_quantity_changed": return { text: `Changed quantity of ${p} to ${item.qty}`, tone: "neutral" };
    case "cart_viewed": return { text: "Viewed cart", tone: "info" };
    case "checkout_started": return { text: `Started checkout${item.value ? ` (${fmtMoney(item.value)})` : ""}`, tone: "good" };
    case "checkout_step_viewed": return { text: "Checkout step viewed", tone: "neutral" };
    case "checkout_failed": return { text: "Checkout failed", tone: "warn" };
    case "checkout_completed": return { text: "Checkout completed (browser)", tone: "good" };
    case "purchase": return { text: `Purchased ${fmtMoney(item.value)}`, tone: "good" };
    case "wishlist_add": return { text: `Saved ${p} to wishlist`, tone: "neutral" };
    case "wishlist_remove": return { text: `Removed ${p} from wishlist`, tone: "neutral" };
    case "recommendation_impression": return { text: `Saw recommendation ${p} (${label})`, tone: "neutral" };
    case "recommendation_click": return { text: `Clicked recommendation ${p} (${label})`, tone: "info" };
    case "recommendation_add_to_cart": return { text: `Added recommended ${p} (${label})`, tone: "good" };
    case "navigation_click": return { text: `Clicked navigation: ${label}`, tone: "neutral" };
    case "promotion_click": return { text: `Clicked promotion: ${label}`, tone: "info" };
    case "promotion_impression": return { text: `Saw promotion: ${label}`, tone: "neutral" };
    case "category_view": return { text: "Viewed a category", tone: "neutral" };
    case "brand_view": return { text: "Viewed a brand", tone: "neutral" };
    case "contact_started": return { text: "Started the contact form", tone: "neutral" };
    case "contact_submitted": return { text: "Submitted the contact form", tone: "good" };
    default: return { text: item.kind.replace(/_/g, " "), tone: "neutral" };
  }
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  const ids = useMemo(() => items.map((i) => i.template_id).filter((x): x is number => !!x), [items]);
  const info = useProductInfo(ids);
  const name = (id: number) => info.get(id)?.name ?? `#${id}`;
  if (items.length === 0) return <p className="text-[12.5px] text-steel-500">No recorded activity.</p>;
  const first = new Date(items[0].at).getTime();
  return (
    <ol className="relative border-l border-line ml-1.5 space-y-2.5" data-testid="timeline">
      {items.map((it, i) => {
        const d = describe(it, name);
        const offset = Math.round((new Date(it.at).getTime() - first) / 1000);
        return (
          <li key={i} className="pl-4 relative">
            <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${d.tone === "good" ? "bg-badge-new" : d.tone === "warn" ? "bg-accent" : d.tone === "info" ? "bg-brand-500" : "bg-steel-300"}`} aria-hidden />
            <div className="flex items-baseline gap-2 text-[12.5px]">
              <span className="font-mono text-[11px] text-steel-500 shrink-0">{time(it.at)}</span>
              <span className="min-w-0 break-words">{d.text}</span>
              {i > 0 && <span className="text-[10.5px] text-steel-300 shrink-0">+{fmtDuration(offset)}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Owner/admin can mark a visitor as staff/internal so their traffic drops out of reports. */
function InternalToggle({ visitorId, internal }: { visitorId: string; internal: boolean }) {
  const { adminRole } = useAuth();
  const [state, setState] = useState<{ value: boolean; busy: boolean; error: string | null }>({ value: internal, busy: false, error: null });
  if (adminRole !== "owner" && adminRole !== "admin") return null;
  const flip = async () => {
    const next = !state.value;
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      await analyticsRpc("admin_analytics_set_internal_visitor", { p_visitor: visitorId, p_internal: next, p_note: null });
      setState({ value: next, busy: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, busy: false, error: e instanceof Error ? e.message : "Couldn't update." }));
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <button type="button" onClick={flip} disabled={state.busy} className="btn-ghost !px-3 !py-1.5 disabled:opacity-50">
        {state.value ? "Unmark as internal visitor" : "Mark visitor as internal (staff/test)"}
      </button>
      <span className="text-steel-500">{state.value ? "This visitor's sessions are excluded from reports by default." : "Excludes all of this visitor's sessions from reports by default."}</span>
      {state.error && <span role="alert" className="text-accent-700">{state.error}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Session journey (anonymous or signed-in) — also reachable for logged-in customers.
// ---------------------------------------------------------------------------------------------
export function SessionJourneyDrawer({ sessionId, onClose, onCustomer }: { sessionId: string | null; onClose: () => void; onCustomer?: (userId: string) => void }) {
  const args = useMemo(() => (sessionId ? { p_session_id: sessionId } : null), [sessionId]);
  const state = useRpc<SessionJourney | null>("admin_analytics_session_journey", args);
  const canSeeCustomers = useCanSeeCustomers();
  return (
    <Drawer open={!!sessionId} onClose={onClose} title="Session journey" subtitle={sessionId ? `Session ${shortId(sessionId)}` : undefined}>
      <Async state={state} rows={5}>
        {(d) => d === null ? <ErrorBlock message="This session no longer exists." /> : (
          <>
            <Panel title="Who & where">
              <div className="space-y-3">
                <IdentityLabel identity={d.identity} visitorId={d.session.visitor_id} />
                {d.identity.kind === "customer" && d.identity.user_id && canSeeCustomers && onCustomer && (
                  <button type="button" className="btn-outline !px-3 !py-1.5" onClick={() => onCustomer(d.identity.user_id!)}>View customer journey</button>
                )}
                <KeyValue rows={[
                  ["Location", <LocationText country={d.session.country_name} region={d.session.region} city={d.session.city} />],
                  ["Device", `${d.session.device_type ?? "unknown"} · ${d.session.browser_family ?? "?"} · ${d.session.os_family ?? "?"}`],
                  ["Traffic source", `${d.session.source_channel}${d.session.utm_campaign ? ` · ${d.session.utm_campaign}` : ""}${d.session.referrer_domain ? ` (${d.session.referrer_domain})` : ""}`],
                  ["Landing page", d.session.landing_path],
                  ["Started", dateTime(d.session.started_at)],
                  ["Pages / events", `${d.session.page_view_count} / ${d.session.event_count}`],
                  ["Engaged time", fmtDuration(d.session.engaged_seconds)],
                  ["Visitor", d.session.is_returning_visitor ? "Returning" : "New"],
                ]} />
                <div className="flex gap-2">{d.session.is_test && <Badge tone="warn">Test traffic</Badge>}{d.session.is_internal && <Badge tone="warn">Internal</Badge>}</div>
                <InternalToggle key={d.session.visitor_id} visitorId={d.session.visitor_id} internal={d.session.is_internal} />
              </div>
            </Panel>
            {d.carts.length > 0 && (
              <Panel title="Carts">
                <ul className="text-[13px] space-y-1">
                  {d.carts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <span>{c.current_item_count} item(s) · {fmtMoney(c.observed_cart_value)}</span>
                      <Badge tone={c.status === "converted" ? "good" : c.status === "abandoned" ? "warn" : "neutral"}>{c.status}</Badge>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            <Panel title="Timeline" subtitle="Chronological, times in IST">
              <Timeline items={d.timeline} />
            </Panel>
          </>
        )}
      </Async>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------
// Customer journey (owner / admin / support only)
// ---------------------------------------------------------------------------------------------
export function CustomerJourneyDrawer({ userId, onClose, onSession }: { userId: string | null; onClose: () => void; onSession?: (id: string) => void }) {
  const args = useMemo(() => (userId ? { p_user_id: userId } : null), [userId]);
  const state = useRpc<CustomerJourney>("admin_analytics_customer_journey", args);
  return (
    <Drawer open={!!userId} onClose={onClose} title="Customer journey" subtitle="Operational use only — limited to owner, admin and support">
      <Async state={state} rows={5}>
        {(d) => (
          <>
            <Panel title="Customer">
              <IdentityLabel identity={d.identity} />
              <div className="mt-3"><KeyValue rows={[
                ["Orders (tracked)", `${d.orders.n} · ${fmtMoney(d.orders.revenue)}`],
                ["First order", d.orders.first_at ? dateTime(d.orders.first_at) : "—"],
                ["Latest order", d.orders.last_at ? dateTime(d.orders.last_at) : "—"],
                ["Sessions shown", String(d.sessions.length)],
              ]} /></div>
            </Panel>
            <Panel title="Recent sessions">
              <ul className="text-[13px] divide-y divide-line">
                {d.sessions.map((s) => (
                  <li key={s.id} className="py-2 flex items-center justify-between gap-3">
                    <span>{dateTime(s.started_at)} · {s.device_type ?? "?"} · {s.city ?? "unknown"} · {s.source_channel}</span>
                    <span className="flex items-center gap-2 shrink-0 text-steel-500">{s.page_view_count} pages · {fmtDuration(s.engaged_seconds)}
                      {onSession && <button type="button" className="text-brand-500 font-semibold hover:underline" onClick={() => onSession(s.id)}>Open</button>}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Activity (most recent 300)" subtitle="Chronological, times in IST"><Timeline items={[...d.timeline].reverse()} /></Panel>
          </>
        )}
      </Async>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------
// Cart detail (abandoned cart drill-down)
// ---------------------------------------------------------------------------------------------
export function CartDetailDrawer({ cartId, onClose, onSession }: { cartId: string | null; onClose: () => void; onSession?: (id: string) => void }) {
  const args = useMemo(() => (cartId ? { p_cart_id: cartId } : null), [cartId]);
  const state = useRpc<CartDetail | null>("admin_analytics_cart_detail", args);
  const ids = useMemo(() => state.data?.items.map((i) => i.odoo_template_id) ?? [], [state.data]);
  const info = useProductInfo(ids);
  return (
    <Drawer open={!!cartId} onClose={onClose} title="Cart detail" subtitle={cartId ? `Cart ${shortId(cartId)}` : undefined}>
      <Async state={state} rows={5}>
        {(d) => {
          if (d === null) return <ErrorBlock message="This cart no longer exists." />;
          const t = d.timeline;
          const count = (k: string) => t.filter((x) => x.kind === k).length;
          const pages = t.filter((x) => x.kind === "page_view");
          const last = pages.at(-1);
          const engaged = d.sessions.reduce((n, s) => n + Number(s.engaged_seconds), 0);
          const first = d.sessions[0];
          const active = d.items.filter((i) => !i.removed);
          const removed = d.items.filter((i) => i.removed);
          return (
            <>
              <Panel title="Customer">
                <IdentityLabel identity={d.identity} visitorId={d.visitor_id} />
                <div className="mt-3 flex gap-2">
                  <Badge tone={d.cart.status === "converted" ? "good" : d.cart.status === "abandoned" ? "warn" : "neutral"}>{d.cart.status}</Badge>
                  {d.cart.recovered && <Badge tone="good">Recovered</Badge>}
                  {d.cart.checkout_started_at && <Badge tone="info">Reached checkout</Badge>}
                </div>
              </Panel>
              <Panel title="Cart contents" subtitle="Observed prices at the time — historical, not current pricing">
                <ul className="divide-y divide-line">
                  {active.map((i) => (
                    <li key={`${i.odoo_template_id}:${i.odoo_variant_id}`} className="py-2.5 flex items-center justify-between gap-3">
                      <ProductCell id={i.odoo_template_id} info={info} />
                      <div className="text-right text-[12.5px] shrink-0">
                        <div>{i.quantity} × {fmtMoney(i.observed_unit_price)}{i.odoo_variant_id ? <span className="text-steel-500"> · variant {i.odoo_variant_id}</span> : null}</div>
                        <div className="font-semibold">{fmtMoney(i.observed_line_value)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between pt-3 border-t border-line font-semibold text-[13.5px]"><span>Observed cart value</span><span>{fmtMoney(d.cart.observed_cart_value)}</span></div>
                {removed.length > 0 && <p className="text-[12px] text-steel-500 mt-2">{removed.length} item(s) were removed before the cart went quiet.</p>}
              </Panel>
              <Panel title="Journey summary">
                <KeyValue rows={[
                  ["Landing page", first?.landing_path ?? "—"],
                  ["Traffic source", first ? `${first.source_channel}${first.utm_campaign ? ` · ${first.utm_campaign}` : ""}` : "—"],
                  ["Location", first ? <LocationText country={first.country_name} region={first.region} city={first.city} /> : "—"],
                  ["Device", first ? `${first.device_type ?? "?"} · ${first.browser_family ?? "?"}` : "—"],
                  ["Pages visited", String(pages.length)],
                  ["Products viewed", String(count("product_view"))],
                  ["Searches", String(count("search_submitted"))],
                  ["Adds / removes", `${count("add_to_cart")} / ${count("remove_from_cart")}`],
                  ["Cart viewed", count("cart_viewed") > 0 ? "Yes" : "No"],
                  ["Checkout started", d.cart.checkout_started_at ? dateTime(d.cart.checkout_started_at) : "No"],
                  ["Last page", last?.label ?? "—"],
                  ["Last activity", dateTime(d.cart.last_activity_at)],
                  ["Engaged time", fmtDuration(engaged)],
                ]} />
                {d.sessions.length > 0 && onSession && (
                  <div className="mt-3 flex flex-wrap gap-2">{d.sessions.map((s) => <button key={s.id} type="button" className="text-[12px] font-semibold text-brand-500 hover:underline" onClick={() => onSession(s.id)}>Open session {shortId(s.id)}</button>)}</div>
                )}
              </Panel>
              <Panel title="Timeline" subtitle="Chronological, times in IST"><Timeline items={t} /></Panel>
            </>
          );
        }}
      </Async>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------
// Page detail
// ---------------------------------------------------------------------------------------------
export function PageDetailDrawer({ path, onClose }: { path: string | null; onClose: () => void }) {
  const base = usePeriodArgs();
  const args = useMemo(() => (path ? { ...base, p_path: path } : null), [base, path]);
  const state = useRpc<PageDetail>("admin_analytics_page_detail", args);
  const productId = path?.match(/--(\d+)$/)?.[1];
  const info = useProductInfo(productId ? [Number(productId)] : []);
  return (
    <Drawer open={!!path} onClose={onClose} title={path ?? ""} subtitle={productId ? info.get(Number(productId))?.name ?? "Product page" : "Page analytics"}>
      <Async state={state} rows={5}>
        {(d) => (
          <>
            <Panel title="Summary">
              <KeyValue rows={[
                ["Views", fmtNumber(d.totals.views)], ["Unique visitors", fmtNumber(d.totals.unique_visitors)],
                ["Average engaged time", fmtDuration(d.totals.avg_engaged)], ["Median engaged time", fmtDuration(d.totals.median_engaged)],
                ["Average scroll depth", `${d.totals.avg_scroll ?? 0}%`],
                ["Entrances", fmtNumber(d.totals.entrances)], ["Exits", `${fmtNumber(d.totals.exits)} (${fmtPercent(d.totals.exits, d.totals.views)} exit rate)`],
              ]} />
            </Panel>
            <Panel title="Views over time" subtitle="Per day, IST">
              <div style={{ height: 180 }} role="img" aria-label="Daily views">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d.daily} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#e3e7e8" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={dayTick} tick={{ fill: "#56707c", fontSize: 11 }} axisLine={{ stroke: "#e3e7e8" }} tickLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} width={32} tick={{ fill: "#56707c", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Line type="linear" dataKey="views" name="Views" stroke={SERIES_COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Scroll depth" subtitle="Share of views by deepest point reached">
              <RankedBars format={(n) => `${fmtNumber(n)} (${fmtPercent(n, d.totals.views)})`} rows={[
                { label: "Under 25%", value: d.scroll.b0 }, { label: "25–49%", value: d.scroll.b25 }, { label: "50–74%", value: d.scroll.b50 },
                { label: "75–89%", value: d.scroll.b75 }, { label: "90%+", value: d.scroll.b90 },
              ]} />
            </Panel>
            <div className="grid sm:grid-cols-2 gap-5">
              <Panel title="Previous pages"><RankedBars rows={d.previous_pages.map((r) => ({ label: r.label, value: r.n }))} /></Panel>
              <Panel title="Next pages"><RankedBars rows={d.next_pages.map((r) => ({ label: r.label, value: r.n }))} /></Panel>
              <Panel title="Traffic sources"><RankedBars rows={d.sources.map((r) => ({ label: r.label, value: r.n }))} /></Panel>
              <Panel title="Devices"><RankedBars rows={d.devices.map((r) => ({ label: r.label, value: r.n }))} /></Panel>
            </div>
            <Panel title="Top locations"><RankedBars rows={d.geography.map((g) => ({ label: `${g.city}, ${g.region}`, sub: g.country, value: g.n }))} /></Panel>
            {productId && <ProductMetrics templateId={Number(productId)} />}
          </>
        )}
      </Async>
    </Drawer>
  );
}

/** Product conversion block reused under a PDP's page detail. */
function ProductMetrics({ templateId }: { templateId: number }) {
  const base = usePeriodArgs();
  const args = useMemo(() => ({ ...base, p_template_id: templateId }), [base, templateId]);
  const state = useRpc<ProductDetail>("admin_analytics_product_detail", args);
  return <Panel title="Product conversion"><Async state={state} rows={3}>{(p) => <ProductFunnel d={p} />}</Async></Panel>;
}

function ProductFunnel({ d }: { d: ProductDetail }) {
  return (
    <FunnelBars steps={[
      { label: "Viewed (sessions)", value: d.funnel.view_sessions },
      { label: "Added to cart (sessions)", value: d.funnel.add_sessions },
      { label: "In a cart that reached checkout", value: d.funnel.checkout_carts },
      { label: "Purchased (orders)", value: d.funnel.orders },
    ]} />
  );
}

// ---------------------------------------------------------------------------------------------
// Product detail
// ---------------------------------------------------------------------------------------------
export function ProductDetailDrawer({ templateId, onClose }: { templateId: number | null; onClose: () => void }) {
  const base = usePeriodArgs();
  const args = useMemo(() => (templateId ? { ...base, p_template_id: templateId } : null), [base, templateId]);
  const state = useRpc<ProductDetail>("admin_analytics_product_detail", args);
  const coIds = useMemo(() => [templateId ?? 0, ...(state.data?.co_carted.map((c) => c.odoo_template_id) ?? [])].filter(Boolean), [templateId, state.data]);
  const info = useProductInfo(coIds);
  return (
    <Drawer open={!!templateId} onClose={onClose} title={templateId ? info.get(templateId)?.name ?? `Product #${templateId}` : ""} subtitle="Live product identity from Odoo · analytics by Odoo id">
      <Async state={state} rows={5}>
        {(d) => (
          <>
            <Panel title="Funnel" subtitle="Distinct sessions / carts / orders in this period">
              <ProductFunnel d={d} />
              <div className="mt-4"><KeyValue rows={[
                ["Views / unique viewers", `${fmtNumber(d.funnel.views)} / ${fmtNumber(d.funnel.unique_viewers)}`],
                ["Adds / removes", `${fmtNumber(d.funnel.adds)} / ${fmtNumber(d.funnel.removes)}`],
                ["Abandoned carts containing it", fmtNumber(d.funnel.abandoned_carts)],
                ["Observed revenue", fmtMoney(d.funnel.revenue)],
              ]} /></div>
            </Panel>
            {d.pdp && <Panel title="Product page engagement"><KeyValue rows={[
              ["Page views", fmtNumber(d.pdp.page_views)], ["Average engaged time", fmtDuration(d.pdp.avg_engaged)],
              ["Median engaged time", fmtDuration(d.pdp.median_engaged)], ["Average scroll depth", `${d.pdp.avg_scroll ?? 0}%`],
            ]} /></Panel>}
            <Panel title="Views & adds over time">
              <div style={{ height: 180 }} role="img" aria-label="Daily views and adds to cart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d.daily} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#e3e7e8" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={dayTick} tick={{ fill: "#56707c", fontSize: 11 }} axisLine={{ stroke: "#e3e7e8" }} tickLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} width={32} tick={{ fill: "#56707c", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Line type="linear" dataKey="views" name="Views" stroke={SERIES_COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line dataKey="adds" name="Adds to cart" stroke={SERIES_COLORS[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <div className="grid sm:grid-cols-2 gap-5">
              <Panel title="Traffic sources"><RankedBars rows={d.sources.map((r) => ({ label: r.label, value: r.n }))} /></Panel>
              <Panel title="Devices"><RankedBars rows={d.devices.map((r) => ({ label: r.label, value: r.n }))} /></Panel>
            </div>
            <Panel title="Top locations"><RankedBars rows={d.geography.map((g) => ({ label: `${g.city}, ${g.region}`, sub: g.country, value: g.n }))} /></Panel>
            <Panel title="Recommendation performance">
              {d.recommendations.length === 0 ? <p className="text-[12.5px] text-steel-500">No recommendation activity for this product.</p> : (
                <table className="w-full text-[12.5px]"><thead><tr className="text-left text-[11px] uppercase text-steel-500 border-b border-line"><th className="py-1.5">Surface · strategy</th><th className="text-right">Impr.</th><th className="text-right">Clicks</th><th className="text-right">CTR</th><th className="text-right">Adds</th></tr></thead>
                  <tbody>{d.recommendations.map((r) => (
                    <tr key={r.surface + r.strategy} className="border-b border-line last:border-0"><td className="py-1.5">{r.surface} · {r.strategy}</td><td className="text-right tabular-nums">{r.impressions}</td><td className="text-right tabular-nums">{r.clicks}</td><td className="text-right tabular-nums">{fmtPercent(r.clicks, r.impressions)}</td><td className="text-right tabular-nums">{r.adds}</td></tr>))}</tbody></table>
              )}
            </Panel>
            <Panel title="Frequently carted with" subtitle="Carts that also contain this product (carted together — not a purchase claim)">
              {d.co_carted.length === 0 ? <p className="text-[12.5px] text-steel-500">No other products shared a cart with this one yet.</p> : (
                <ul className="divide-y divide-line">{d.co_carted.map((c) => (
                  <li key={c.odoo_template_id} className="py-2 flex items-center justify-between gap-3"><ProductCell id={c.odoo_template_id} info={info} /><span className="text-[12.5px] tabular-nums shrink-0">{c.carts} cart(s)</span></li>))}</ul>
              )}
            </Panel>
          </>
        )}
      </Async>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------
// Search query detail
// ---------------------------------------------------------------------------------------------
export function QueryDetailDrawer({ query, onClose }: { query: string | null; onClose: () => void }) {
  const base = usePeriodArgs();
  const args = useMemo(() => (query ? { ...base, p_query_norm: query } : null), [base, query]);
  const state = useRpc<SearchDetail>("admin_analytics_search_detail", args);
  const ids = useMemo(() => [...(state.data?.clicked_products ?? []), ...(state.data?.added_products ?? [])].map((p) => p.odoo_template_id), [state.data]);
  const info = useProductInfo(ids);
  const [tab, setTab] = useState<"clicked" | "added">("clicked");
  return (
    <Drawer open={!!query} onClose={onClose} title={query ? `“${query}”` : ""} subtitle="Search query detail">
      <Async state={state} rows={4}>
        {(d) => {
          const rows = tab === "clicked" ? d.clicked_products : d.added_products;
          return (
            <>
              <Panel title="Summary"><KeyValue rows={[
                ["Searches", fmtNumber(d.searches)], ["Returned no results", `${fmtNumber(d.zero_results)} (${fmtPercent(d.zero_results, d.searches)})`],
                ["Median time to click", d.median_secs_to_click !== null ? `${d.median_secs_to_click}s` : "—"],
              ]} /></Panel>
              <Panel title="After this search" actions={
                <div role="tablist" className="inline-flex border border-line text-[12px]">
                  {(["clicked", "added"] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-2.5 py-1 font-semibold ${tab === k ? "bg-ink text-white" : "text-steel-700"}`}>{k === "clicked" ? "Clicked" : "Added to cart"}</button>)}
                </div>}>
                {rows.length === 0 ? <p className="text-[12.5px] text-steel-500">Nothing recorded yet.</p> : (
                  <ul className="divide-y divide-line">{rows.map((r) => <li key={r.odoo_template_id} className="py-2 flex items-center justify-between gap-3"><ProductCell id={r.odoo_template_id} info={info} /><span className="text-[12.5px] tabular-nums">{r.n}×</span></li>)}</ul>
                )}
              </Panel>
            </>
          );
        }}
      </Async>
    </Drawer>
  );
}

