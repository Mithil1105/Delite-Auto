import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useActivityLog } from "../../hooks/useActivityLog";

type Status = "new" | "in_progress" | "resolved" | "archived";

interface Enquiry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: Status;
  created_at: string;
}

const STATUS_LABEL: Record<Status, string> = { new: "New", in_progress: "In Progress", resolved: "Resolved", archived: "Archived" };

/**
 * Real Contact Enquiries inbox (replaces the /admin/contact placeholder). Deliberately not a full
 * CRM (spec #38) — list, filter by status, a detail view, and a status transition. Rows come only
 * from real submissions via the contact-submit Edge Function (see Documentations MD/
 * delite-contact-and-admin-media.md) — never synthetic.
 */
export default function AdminContact() {
  const { logActivity } = useActivityLog();
  const [rows, setRows] = useState<Enquiry[] | null>(null);
  const [filter, setFilter] = useState<Status | "all">("new");
  const [selected, setSelected] = useState<Enquiry | null>(null);

  const load = async () => {
    if (!supabase) return;
    let query = supabase.from("contact_enquiries").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter !== "all") query = query.eq("status", filter);
    const { data } = await query;
    setRows((data as Enquiry[] | null) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const setStatus = async (row: Enquiry, status: Status) => {
    if (!supabase) return;
    await supabase.from("contact_enquiries").update({ status, updated_at: new Date().toISOString() }).eq("id", row.id);
    await logActivity("contact.status_changed", "contact_enquiry", row.id, { status });
    setSelected(null);
    await load();
  };

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-display uppercase text-[13.5px]">Contact Enquiries</h2>
        <div className="flex gap-2">
          {(["new", "in_progress", "resolved", "archived", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border ${filter === s ? "bg-ink text-white border-ink" : "border-line text-steel-600 hover:border-ink"}`}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-line overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-steel-50 text-left text-[11px] uppercase tracking-wide text-steel-500">
              <th className="p-3 font-semibold">Name</th>
              <th className="p-3 font-semibold">Email</th>
              <th className="p-3 font-semibold">Subject</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3 font-semibold">Received</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td colSpan={5} className="p-6 text-center text-steel-500">Loading…</td></tr>
            )}
            {rows?.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-steel-500">No enquiries.</td></tr>
            )}
            {rows?.map((row) => (
              <tr key={row.id} onClick={() => setSelected(row)} className="border-b border-line last:border-b-0 hover:bg-steel-50/50 cursor-pointer">
                <td className="p-3 font-medium">{row.name}</td>
                <td className="p-3 text-steel-500">{row.email}</td>
                <td className="p-3 text-steel-500 line-clamp-1">{row.subject ?? "—"}</td>
                <td className="p-3">{STATUS_LABEL[row.status]}</td>
                <td className="p-3 text-steel-500">{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[15px] mb-1">{selected.subject || "No subject"}</h3>
            <p className="text-[12.5px] text-steel-500 mb-4">
              {selected.name} · {selected.email}{selected.phone ? ` · ${selected.phone}` : ""}
            </p>
            <p className="text-[13.5px] whitespace-pre-wrap mb-6">{selected.message}</p>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => setStatus(selected, "in_progress")} className="btn-ghost !px-3 !py-1.5 text-[12.5px]">Mark In Progress</button>
              <button type="button" onClick={() => setStatus(selected, "resolved")} className="btn-ghost !px-3 !py-1.5 text-[12.5px]">Mark Resolved</button>
              <button type="button" onClick={() => setStatus(selected, "archived")} className="btn-ghost !px-3 !py-1.5 text-[12.5px]">Archive</button>
              <button type="button" onClick={() => setSelected(null)} className="btn-ghost !px-3 !py-1.5 text-[12.5px] ml-auto">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
