import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth, type AdminRole } from "../../../context/AuthContext";
import { useAdminToast } from "../../components/AdminToastProvider";

const ROLES: AdminRole[] = ["owner", "admin", "content", "merchandising", "support", "analytics"];

interface AdminUserRow {
  id: string;
  fullName: string | null;
  email: string | null;
  role: AdminRole;
  status: "active" | "revoked";
  createdAt: string;
  lastSignInAt: string | null;
  mfaEnabled: boolean | null;
}

/**
 * Real Admin Users management (replaces the /admin/settings/users placeholder — spec sections
 * 27-32). Every mutation goes through the admin-users-manage Edge Function, which re-verifies the
 * caller is a real owner server-side (never trusts this page's own owner-only route gate alone)
 * and enforces last-owner protection at the database layer regardless of what this UI allows.
 */
export default function AdminUsers() {
  const { user } = useAuth();
  const { showToast } = useAdminToast();
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminRole>("support");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke("admin-users-manage", { body: { action: "list" } });
    if (invokeError || data?.error) {
      setError(data?.error ?? "Could not load admin users");
      setRows([]);
      return;
    }
    setRows(data.users as AdminUserRow[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const call = async (body: Record<string, unknown>, successMessage: string) => {
    if (!supabase) return;
    setBusy(true);
    const { data, error: invokeError } = await supabase.functions.invoke("admin-users-manage", { body });
    setBusy(false);
    if (invokeError || data?.error) {
      showToast(data?.error ?? "Action failed");
      return false;
    }
    showToast(successMessage);
    await load();
    return true;
  };

  const onInvite = async () => {
    const ok = await call({ action: "invite", email: inviteEmail.trim(), fullName: inviteName.trim(), role: inviteRole }, "Invitation sent");
    if (ok) {
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("support");
    }
  };

  const onChangeRole = async (userId: string, role: AdminRole) => {
    await call({ action: "changeRole", userId, role }, "Role updated");
  };

  const onRevoke = async (userId: string) => {
    if (!window.confirm("Revoke admin access for this account? They'll keep their normal customer login — only admin access is removed.")) return;
    await call({ action: "revoke", userId }, "Admin access revoked");
  };

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="font-display uppercase text-[13.5px]">Admin Users</h2>
          <p className="text-[12px] text-steel-500 mt-1">Owner-only. Manage who has access to Delite Admin and at what role.</p>
        </div>
        <button type="button" onClick={() => setInviteOpen((v) => !v)} className="btn-dark !px-4 !py-2 text-[12.5px] inline-flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" /> Invite Admin
        </button>
      </div>

      {inviteOpen && (
        <div className="card-surface p-5 mb-6 grid sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-[11px] uppercase tracking-wide text-steel-500 mb-1">Email</label>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="w-full h-10 px-3 border border-line text-[13.5px]" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-steel-500 mb-1">Name</label>
            <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="w-full h-10 px-3 border border-line text-[13.5px]" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-steel-500 mb-1">Role</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as AdminRole)} className="w-full h-10 px-3 border border-line text-[13.5px] capitalize">
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-4">
            <button type="button" disabled={busy || !inviteEmail.trim()} onClick={onInvite} className="btn-dark !px-4 !py-2 text-[12.5px] disabled:opacity-50">
              Send Invitation
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[13px] text-sale mb-4">{error}</p>}

      <div className="border border-line overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-steel-50 text-left text-[11px] uppercase tracking-wide text-steel-500">
              <th className="p-3 font-semibold">Name</th>
              <th className="p-3 font-semibold">Email</th>
              <th className="p-3 font-semibold">Role</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3 font-semibold">Created</th>
              <th className="p-3 font-semibold">Last sign-in</th>
              <th className="p-3 font-semibold">MFA</th>
              <th className="p-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td colSpan={8} className="p-6 text-center text-steel-500">Loading…</td></tr>
            )}
            {rows?.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-steel-500">No admin accounts yet.</td></tr>
            )}
            {rows?.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                <td className="p-3 font-medium">{row.fullName ?? "—"}</td>
                <td className="p-3 text-steel-500">{row.email ?? "—"}</td>
                <td className="p-3">
                  <select
                    value={row.role}
                    disabled={busy || row.id === user?.id}
                    onChange={(e) => onChangeRole(row.id, e.target.value as AdminRole)}
                    className="border border-line h-8 px-2 text-[12.5px] capitalize disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </td>
                <td className="p-3">
                  <span className={row.status === "active" ? "text-emerald-600 font-semibold" : "text-steel-400"}>{row.status === "active" ? "Active" : "Revoked"}</span>
                </td>
                <td className="p-3 text-steel-500">{new Date(row.createdAt).toLocaleDateString()}</td>
                <td className="p-3 text-steel-500">{row.lastSignInAt ? new Date(row.lastSignInAt).toLocaleDateString() : "Never"}</td>
                <td className="p-3 text-steel-500">{row.mfaEnabled === null ? "Unknown" : row.mfaEnabled ? "Enabled" : "Not enabled"}</td>
                <td className="p-3">
                  {row.id !== user?.id && row.status === "active" && (
                    <button type="button" disabled={busy} onClick={() => onRevoke(row.id)} className="text-[12px] font-semibold text-sale hover:underline disabled:opacity-50">
                      Revoke
                    </button>
                  )}
                  {row.id === user?.id && <span className="text-[12px] text-steel-400">You</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
