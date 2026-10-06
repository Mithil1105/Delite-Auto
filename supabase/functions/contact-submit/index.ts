// supabase/functions/contact-submit/index.ts
//
// POST /functions/v1/contact-submit — real backing for the public Contact form (previously fully
// decorative — see Documentations MD/delite-contact-and-admin-media.md). Public/anon-callable, but
// `contact_enquiries` itself has no client INSERT policy at all (RLS can't rate-limit) — this
// function is the only writer, service-role, with a real per-IP rate limiter (same in-memory
// per-warm-isolate pattern already used by analytics-track).

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendContactNotification } from "../_shared/email/index.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_SUBMISSIONS_PER_WINDOW = 3;
const WINDOW_MS = 60_000;
const buckets = new Map<string, { n: number; t: number }>();
function limited(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.t > WINDOW_MS) {
    if (buckets.size > 5000) buckets.clear();
    buckets.set(key, { n: 1, t: now });
    return false;
  }
  b.n += 1;
  return b.n > MAX_SUBMISSIONS_PER_WINDOW;
}

interface ContactBody {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  // Honeypot — a real user never fills this (hidden via CSS in the form); a filled value means a
  // bot submitted the form. Silently accepted-but-dropped, never told it was rejected.
  website?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limited(ip)) return json({ error: "Too many submissions — please try again shortly" }, 429);

  let body: ContactBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  if (body.website) return json({ ok: true }, 200); // honeypot tripped — pretend success, drop silently

  const validationError = validateBody(body);
  if (validationError) return json({ error: validationError }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Contact service not configured" }, 500);
  const db = createClient(supabaseUrl, serviceRoleKey);

  // Best-effort identity — an anon visitor has no session; a signed-in customer's message is
  // still linked to their account when the Authorization header carries a real session token.
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data } = await db.auth.getUser(jwt);
    userId = data.user?.id ?? null;
  }

  const { data: enquiry, error } = await db
    .from("contact_enquiries")
    .insert({
      user_id: userId,
      name: body.name.trim(),
      email: body.email.trim(),
      phone: body.phone?.trim() || null,
      subject: body.subject?.trim() || null,
      message: body.message.trim(),
    })
    .select("id, created_at")
    .single();
  if (error) {
    console.error("[contact-submit] insert failed", error.message);
    return json({ error: "Could not submit your message — please try again" }, 502);
  }

  // Internal notification — best-effort only. The enquiry is already durably saved above; a
  // notification-email failure must never turn a successful submission into an error response.
  try {
    if (enquiry) {
      await sendContactNotification({
        enquiryId: enquiry.id,
        name: body.name.trim(),
        email: body.email.trim(),
        phone: body.phone?.trim() || null,
        subject: body.subject?.trim() || null,
        message: body.message.trim(),
        createdAt: enquiry.created_at,
      });
    }
  } catch (notifyErr) {
    console.error("[contact-submit] notification email failed", notifyErr instanceof Error ? notifyErr.message : notifyErr);
  }

  return json({ ok: true }, 200);
});

function validateBody(body: ContactBody): string | null {
  if (!body.name?.trim()) return "Name is required";
  if (!body.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return "A valid email is required";
  if (!body.message?.trim()) return "Message is required";
  if (body.name.length > 200 || body.email.length > 200 || body.message.length > 5000) return "Input too long";
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
