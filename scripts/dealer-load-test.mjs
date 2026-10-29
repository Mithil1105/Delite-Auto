// scripts/dealer-load-test.mjs
//
// Read-only load smoke test for the dealer-portal Edge Function (spec §13 performance targets:
// catalogue/search p95 well under a second). It signs in as an existing dealer user and fires
// concurrent `catalog.list` / `me` calls. It NEVER places orders and never writes.
//
// Needs a real dealer user, so it only runs against an environment you control:
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=... DEALER_EMAIL=... DEALER_PASSWORD=... \
//   node scripts/dealer-load-test.mjs [--concurrency 10] [--requests 200]
//
// (The password is read from the environment and is never printed.)

const need = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "DEALER_EMAIL", "DEALER_PASSWORD"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const concurrency = arg("concurrency", 10);
const total = arg("requests", 200);
const base = process.env.SUPABASE_URL.replace(/\/$/, "");

const login = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: process.env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: process.env.DEALER_EMAIL, password: process.env.DEALER_PASSWORD }),
});
if (!login.ok) {
  console.error(`Sign-in failed (HTTP ${login.status}).`);
  process.exit(1);
}
const { access_token: token } = await login.json();

const call = async (action, payload = {}) => {
  const t0 = performance.now();
  const res = await fetch(`${base}/functions/v1/dealer-portal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  await res.arrayBuffer();
  return { ms: performance.now() - t0, status: res.status };
};

const plan = Array.from({ length: total }, (_, i) => (i % 5 === 0 ? ["me"] : ["catalog.list", { page: 1 + (i % 3), pageSize: 24 }]));
const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < plan.length) {
      const [action, payload] = plan[next++];
      results.push(await call(action, payload));
    }
  }),
);

const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(0);
const byStatus = results.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
console.log(JSON.stringify({ requests: results.length, concurrency, statuses: byStatus, p50_ms: Number(pct(50)), p95_ms: Number(pct(95)), p99_ms: Number(pct(99)), max_ms: Math.round(sorted[sorted.length - 1]) }, null, 2));
console.log("Note: 429 responses are the per-isolate rate limiter doing its job; lower --concurrency to measure latency only.");
