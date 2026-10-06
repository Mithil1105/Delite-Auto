import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { formatINR } from "../../../lib/format";
import { useAdminToast } from "../../components/AdminToastProvider";
import { Panel, KeyValue, Badge } from "../../analytics/ui";

interface OrderRow {
  id: string;
  user_id: string;
  odoo_sale_order_id: number | null;
  odoo_order_name: string | null;
  status: string;
  subtotal: number;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  payment_method: "online" | "cod";
  payment_status: string;
  payment_attempt_id: string | null;
  created_at: string;
}

interface AttemptRow {
  id: string;
  status: string;
  odoo_sync_pending: boolean;
  odoo_sync_status: string;
  last_sync_error_safe: string | null;
  checkout_snapshot: { resolvedLines: { odooVariantId: number; qty: number }[] } | null;
}

interface EmailRow {
  id: string;
  email_type: string;
  status: "queued" | "sent" | "failed";
  created_at: string;
}

/** Read-only order detail — identity/customer/shipping/payment/Odoo/email status, plus the two
 * legitimate recovery actions (retry Odoo sync when genuinely pending, retry email when genuinely
 * failed). No fulfilment mutation of any kind (no ship/deliver/stock/price/refund) — see spec
 * section 25 and Documentations MD/delite-production-operations.md. */
export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useAdminToast();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [attempt, setAttempt] = useState<AttemptRow | null>(null);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [opening, setOpening] = useState(false);
  const [retryingOdoo, setRetryingOdoo] = useState(false);
  const [retryingEmail, setRetryingEmail] = useState<string | null>(null);

  const load = async () => {
    if (!supabase || !id) return;
    const { data: orderRow } = await supabase
      .from("orders")
      .select("id, user_id, odoo_sale_order_id, odoo_order_name, status, subtotal, shipping_name, shipping_phone, shipping_address, payment_method, payment_status, payment_attempt_id, created_at")
      .eq("id", id)
      .maybeSingle();
    setOrder((orderRow as OrderRow | null) ?? null);

    if (orderRow?.payment_attempt_id) {
      const { data: attemptRow } = await supabase
        .from("payment_attempts")
        .select("id, status, odoo_sync_pending, odoo_sync_status, last_sync_error_safe, checkout_snapshot")
        .eq("id", orderRow.payment_attempt_id)
        .maybeSingle();
      setAttempt((attemptRow as AttemptRow | null) ?? null);
    }

    const { data: emailRows } = await supabase
      .from("email_log")
      .select("id, email_type, status, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false });
    setEmails((emailRows as EmailRow[] | null) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openInOdoo = async () => {
    if (!supabase || !order?.odoo_sale_order_id) return;
    setOpening(true);
    const { data, error } = await supabase.functions.invoke<{ url?: string }>("admin-odoo-link", { body: { model: "sale.order", id: order.odoo_sale_order_id } });
    setOpening(false);
    if (error || !data?.url) return;
    window.open(data.url, "_blank", "noopener,noreferrer");
  };

  const retryOdoo = async () => {
    if (!supabase || !attempt) return;
    setRetryingOdoo(true);
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("admin-retry-odoo-order-sync", { body: { paymentAttemptId: attempt.id } });
    setRetryingOdoo(false);
    if (error || data?.error) showToast(data?.error ?? "Retry failed — still pending", "error");
    else showToast("Odoo sync succeeded");
    await load();
  };

  const retryEmail = async (emailId: string) => {
    if (!supabase) return;
    setRetryingEmail(emailId);
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("admin-retry-email", { body: { emailLogId: emailId } });
    setRetryingEmail(null);
    if (error || data?.error) showToast(data?.error ?? "Retry failed", "error");
    else showToast("Email sent");
    await load();
  };

  if (!order) {
    return (
      <div className="p-6 lg:p-10">
        <button type="button" onClick={() => navigate("/admin/orders")} className="text-[12.5px] font-semibold text-brand-700 hover:underline mb-4">← Back to Orders</button>
        <p className="text-[13.5px] text-steel-500">Loading…</p>
      </div>
    );
  }

  const latestFailedEmail = emails.find((e) => e.status === "failed");

  return (
    <div className="p-6 lg:p-10 max-w-3xl space-y-5">
      <button type="button" onClick={() => navigate("/admin/orders")} className="text-[12.5px] font-semibold text-brand-700 hover:underline">← Back to Orders</button>

      <Panel
        title={order.odoo_order_name ?? order.id.slice(0, 8)}
        subtitle={`Placed ${new Date(order.created_at).toLocaleString()}`}
        actions={
          order.odoo_sale_order_id ? (
            <button type="button" disabled={opening} onClick={openInOdoo} className="btn-outline !px-3 !py-1.5 text-[12.5px] inline-flex items-center gap-1.5 disabled:opacity-50">
              Open in Odoo <ExternalLink className="w-3.5 h-3.5" />
            </button>
          ) : undefined
        }
      >
        <KeyValue
          rows={[
            ["Order status", order.status],
            ["Customer", order.shipping_name],
            ["Shipping phone", order.shipping_phone],
            ["Shipping address", order.shipping_address],
            ["Observed total", formatINR(order.subtotal)],
            ["Payment method", order.payment_method.toUpperCase()],
            ["Payment status", <Badge key="ps" tone={order.payment_status === "paid" ? "good" : order.payment_status === "failed" ? "bad" : "neutral"}>{order.payment_status}</Badge>],
            ["Odoo order", order.odoo_order_name ?? "Not yet created"],
          ]}
        />
      </Panel>

      {attempt && (
        <Panel title="Odoo sync">
          <KeyValue
            rows={[
              ["Sync status", <Badge key="ss" tone={attempt.odoo_sync_status === "failed" ? "bad" : attempt.odoo_sync_status === "syncing" ? "warn" : "good"}>{attempt.odoo_sync_status}</Badge>],
              ...(attempt.last_sync_error_safe ? ([["Last error", attempt.last_sync_error_safe]] as [string, string][]) : []),
            ]}
          />
          {attempt.odoo_sync_pending && (
            <button type="button" disabled={retryingOdoo} onClick={retryOdoo} className="btn-outline !px-3 !py-1.5 text-[12.5px] mt-3 disabled:opacity-50">
              {retryingOdoo ? "Retrying…" : "Retry Odoo sync"}
            </button>
          )}
        </Panel>
      )}

      <Panel title="Email confirmation">
        {emails.length === 0 && <p className="text-[13px] text-steel-500">No email activity recorded for this order.</p>}
        {emails.map((e) => (
          <div key={e.id} className="flex items-center justify-between py-2 border-b border-line last:border-b-0 text-[13px]">
            <span>{e.email_type}</span>
            <div className="flex items-center gap-2">
              <Badge tone={e.status === "sent" ? "good" : e.status === "failed" ? "bad" : "neutral"}>{e.status}</Badge>
              {e.status === "failed" && (
                <button type="button" disabled={retryingEmail === e.id} onClick={() => retryEmail(e.id)} className="btn-outline !px-2.5 !py-1 text-[12px] disabled:opacity-50">
                  {retryingEmail === e.id ? "Retrying…" : "Retry"}
                </button>
              )}
            </div>
          </div>
        ))}
        {latestFailedEmail && <p className="text-[11.5px] text-steel-500 mt-2">Retry re-sends via the original order-confirmation template — never a free-form email.</p>}
      </Panel>
    </div>
  );
}
