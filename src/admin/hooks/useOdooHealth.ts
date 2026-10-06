import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export interface OdooHealth {
  configured: boolean;
  reachable: boolean;
  legacyRpcAuthenticated: boolean;
  odooServerVersion?: string;
  json2Authenticated?: boolean;
  error?: string;
}

/** Real status only — calls the existing odoo-health Edge Function (never invented/decorative). */
export function useOdooHealth() {
  const [health, setHealth] = useState<OdooHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke<OdooHealth>("odoo-health", { method: "POST" });
    if (!error && data) setHealth(data);
    else setHealth({ configured: false, reachable: false, legacyRpcAuthenticated: false, error: error?.message });
    setCheckedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { health, loading, checkedAt, refresh };
}
