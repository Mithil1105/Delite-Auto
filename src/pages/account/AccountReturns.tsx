import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";

interface ReturnRequestRow {
  id: string;
  order_id: string;
  odoo_sale_order_id: number;
  quantity: number;
  type: "return" | "exchange";
  reason: string;
  status: "requested" | "approved" | "rejected" | "completed";
  created_at: string;
}

const STATUS_LABEL: Record<ReturnRequestRow["status"], string> = {
  requested: "Requested",
  approved: "Approved — processing",
  rejected: "Rejected",
  completed: "Completed",
};

const STATUS_TONE: Record<ReturnRequestRow["status"], string> = {
  requested: "bg-steel-50 text-steel-700",
  approved: "bg-blue-50 text-blue-700",
  rejected: "bg-red-50 text-sale",
  completed: "bg-green-50 text-green-700",
};

/**
 * A Supabase `return_requests` row is a REQUEST only — never shown as "Returned"/"Refunded"/
 * "Exchange complete" (spec #41). Status stays honest to what's actually recorded; "Requested"
 * until an operator updates it after processing the real Odoo return.
 */
export default function AccountReturns() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ReturnRequestRow[] | null>(null);

  useEffect(() => {
    if (!supabase || !user) return;
    let cancelled = false;
    supabase
      .from("return_requests")
      .select("id, order_id, odoo_sale_order_id, quantity, type, reason, status, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setRequests((data as ReturnRequestRow[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Returns & Exchanges</h1>
      <p className="text-[13px] text-steel-500 mb-6">Start a request from an eligible item on your Order Detail page.</p>

      {requests === null && <p className="text-[13.5px] text-steel-500">Loading…</p>}
      {requests !== null && requests.length === 0 && <p className="text-[13.5px] text-steel-500">No return or exchange requests yet.</p>}
      {requests !== null && requests.length > 0 && (
        <div className="card-surface divide-y divide-line">
          {requests.map((r) => (
            <div key={r.id} className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-[13.5px] capitalize">{r.type} · {r.reason.replace(/_/g, " ")}</div>
                <div className="text-[12px] text-steel-500">Qty {r.quantity} · Requested {new Date(r.created_at).toLocaleDateString()}</div>
              </div>
              <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
