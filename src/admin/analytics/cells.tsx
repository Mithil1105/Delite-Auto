import { useAuth } from "../../context/AuthContext";
import { useProductInfo } from "./hooks";
import type { Identity } from "./api";
import { Badge } from "./ui";
import { shortId } from "./format";

/** Product name + image resolved LIVE from Odoo by id (analytics only stores the stable id). */
export function ProductCell({ id, info }: { id: number; info: ReturnType<typeof useProductInfo> }) {
  const p = info.get(id);
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-9 h-9 shrink-0 bg-steel-50 overflow-hidden">{p?.image && <img src={p.image} alt="" className="w-full h-full object-cover" loading="lazy" />}</div>
      <div className="min-w-0">
        <div className="font-medium truncate max-w-[240px]" title={p?.name}>
          {p ? p.name : p === null ? <span className="text-steel-500">Product #{id} (no longer in catalog)</span> : info.loading ? <span className="text-steel-300">Loading…</span> : `Product #${id}`}
        </div>
        <div className="text-[11px] text-steel-500">Odoo #{id}{p?.sku ? ` · ${p.sku}` : ""}</div>
      </div>
    </div>
  );
}

/** Who a session/cart belongs to. Names/emails are shown only when the server revealed them for this admin's role. */
export function IdentityLabel({ identity, visitorId }: { identity: Identity; visitorId?: string }) {
  if (identity.kind === "customer") {
    return (
      <div className="min-w-0">
        <div className="font-medium truncate">{identity.name || identity.email || "Signed-in customer"}</div>
        <div className="text-[11px] text-steel-500 truncate">{identity.name ? identity.email : identity.revealed ? "" : "Details restricted for your role"}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="font-medium">Anonymous visitor</div>
      {visitorId && <div className="text-[11px] text-steel-500 font-mono">{shortId(visitorId)}</div>}
    </div>
  );
}

export function LocationText({ country, region, city }: { country?: string | null; region?: string | null; city?: string | null }) {
  const parts = [city, region, country].filter(Boolean);
  return <span>{parts.length ? parts.join(", ") : <span className="text-steel-500">Unknown</span>}</span>;
}

export function DeviceBadge({ device }: { device: string | null | undefined }) {
  return <Badge>{device ?? "unknown"}</Badge>;
}

/** True when the signed-in admin's role may see person-level customer journeys (owner/admin/support). */
export function useCanSeeCustomers(): boolean {
  const { adminRole } = useAuth();
  return adminRole === "owner" || adminRole === "admin" || adminRole === "support";
}
