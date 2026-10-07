import { useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";

/**
 * Records one admin_activity_log row per meaningful action (spec: admin login, draft saved,
 * homepage published, media uploaded/removed, review moderated, role changed). RLS requires
 * actor_id to match the caller, so this can only ever log the CURRENT user's own actions — never
 * impersonate another admin's entry. Never logs secrets; metadata is caller-supplied and should
 * stay to safe, small identifiers (ids/labels), never credential-shaped values.
 */
export function useActivityLog() {
  const { user } = useAuth();

  const logActivity = useCallback(
    async (action: string, targetType?: string, targetId?: string, metadata?: Record<string, unknown>) => {
      if (!supabase || !user) return;
      await supabase.from("admin_activity_log").insert({
        actor_id: user.id,
        action,
        target_type: targetType ?? null,
        target_id: targetId ?? null,
        metadata: metadata ?? null,
      });
    },
    [user]
  );

  return { logActivity };
}
