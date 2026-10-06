import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabaseClient";

interface SavedAddress {
  id: number;
  label: string;
  line1: string;
  line2: string;
  phone: string;
}

const inputClass = "w-full h-10 px-3 border border-line bg-white text-[13.5px] focus:outline-none focus:border-ink";
const labelClass = "block text-[11.5px] uppercase tracking-wide mb-1 text-steel-500";

/** Odoo remains the only address store (spec #7/#54) — this page reads/writes exclusively through
 * customer-addresses, never a parallel Supabase-only address book. Edit/delete are deliberately
 * not built this pass (spec allows "archive/deactivate if Odoo semantics require it" — left as a
 * documented follow-up rather than risking a delete against a delivery address a historical order
 * still references). */
export default function AccountAddresses() {
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = () => {
    if (!supabase) return;
    supabase.functions.invoke<{ addresses: SavedAddress[] }>("customer-addresses", { method: "POST", body: { action: "list" } }).then(({ data }) => {
      setAddresses(data?.addresses ?? []);
    });
  };

  useEffect(load, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Addresses</h1>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn-outline !py-2 !text-[12.5px]">
            Add new address
          </button>
        )}
      </div>

      {adding && <NewAddressForm onDone={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />}

      {addresses === null && <p className="text-[13.5px] text-steel-500">Loading…</p>}
      {addresses !== null && addresses.length === 0 && !adding && <p className="text-[13.5px] text-steel-500">No saved addresses yet.</p>}
      {addresses !== null && addresses.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4 mt-2">
          {addresses.map((a) => (
            <div key={a.id} className="card-surface p-4">
              <div className="font-semibold text-[13.5px] mb-1">{a.label}</div>
              <div className="text-[13px] text-steel-500">{a.line1}{a.line2 ? `, ${a.line2}` : ""}</div>
              {a.phone && <div className="text-[12px] text-steel-500 mt-1">{a.phone}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewAddressForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke("customer-addresses", {
      body: { action: "add", address: { label, line1, line2, city, state, pincode } },
    });
    setSaving(false);
    if (invokeError || data?.error) {
      setError(data?.error ?? invokeError?.message ?? "Could not save this address");
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={submit} className="card-surface p-5 mb-6 grid sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <label className={labelClass}>Label (e.g. "Home", "Work")</label>
        <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>Address line 1</label>
        <input required className={inputClass} value={line1} onChange={(e) => setLine1(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>Address line 2</label>
        <input className={inputClass} value={line2} onChange={(e) => setLine2(e.target.value)} />
      </div>
      <div>
        <label className={labelClass}>City</label>
        <input required className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div>
        <label className={labelClass}>State</label>
        <input required className={inputClass} value={state} onChange={(e) => setState(e.target.value)} />
      </div>
      <div>
        <label className={labelClass}>PIN code</label>
        <input required className={inputClass} value={pincode} onChange={(e) => setPincode(e.target.value)} />
      </div>
      {error && <p className="sm:col-span-2 text-sale text-[12.5px]">{error}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button type="submit" disabled={saving} className="btn-dark !py-2 !text-[12.5px] disabled:opacity-50">{saving ? "Saving…" : "Save address"}</button>
        <button type="button" onClick={onCancel} className="btn-ghost !py-2 !text-[12.5px]">Cancel</button>
      </div>
    </form>
  );
}
