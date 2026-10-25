// Generates (and optionally applies) demo reviews for every product in the live Odoo catalog.
// See Documentations MD/seed-demo-reviews.md.
//
//   node scripts/seed-demo-reviews.mjs                 -> fetch catalog, write SQL, print summary
//   node scripts/seed-demo-reviews.mjs --apply         -> also run the SQL on the linked project
//   node scripts/seed-demo-reviews.mjs --ids 12,15,40  -> skip the catalog fetch, use these template ids
//   node scripts/seed-demo-reviews.mjs --out path.sql  -> where to write the SQL (default: ./seed-demo-reviews.sql)
//
// Re-running is safe: the SQL deletes all `is_seed` rows first, and generation is deterministic
// (seeded PRNG), so the same product list always yields the same reviews.
// Remove everything: delete from public.product_reviews where is_seed;

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PROJECT_REF = "zafjmlwbolgdattfdgch";
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

// ---------- deterministic PRNG ----------
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261016);
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- product ids ----------
async function loadTemplateIds() {
  if (opt("--ids")) return opt("--ids").split(",").map((s) => Number(s.trim())).filter(Boolean);
  const env = readFileSync(".env.local", "utf8");
  const url = env.match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim().replace(/\/$/, "");
  const key = env.match(/^VITE_SUPABASE_PUBLISHABLE_KEY=(.+)$/m)[1].trim();
  const ids = new Set();
  let page = 1, totalPages = 1;
  while (page <= totalPages) {
    const res = await fetch(`${url}/functions/v1/catalog-products?page=${page}&pageSize=60`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`catalog-products page ${page} failed: ${res.status} ${await res.text()} (Odoo unreachable? retry later or pass --ids)`);
    const data = await res.json();
    totalPages = data.totalPages;
    for (const item of data.items) if (item.websitePublished !== false) ids.add(item.odooTemplateId);
    page++;
  }
  return [...ids];
}

// ---------- review text ----------
const FIRST = ["Rahul", "Amit", "Priya", "Neha", "Vikram", "Karan", "Sneha", "Rohit", "Pooja", "Ankit", "Jignesh", "Hardik", "Kinjal", "Darshan", "Mehul", "Nirav", "Bhavesh", "Hiral", "Chirag", "Dipti", "Sanjay", "Rakesh", "Suresh", "Manish", "Divya", "Aarti", "Nikhil", "Yash", "Harsh", "Meet", "Parth", "Riddhi", "Kunal", "Sachin", "Tejas", "Vivek", "Anjali", "Ritu", "Mohit", "Deepak", "Arjun", "Isha", "Faizan", "Imran", "Salman", "Zoya", "Gurpreet", "Harpreet", "Jatin", "Pratik"];
const LAST = ["Patel", "Shah", "Mehta", "Desai", "Sharma", "Verma", "Gupta", "Joshi", "Trivedi", "Parmar", "Solanki", "Thakkar", "Modi", "Bhatt", "Jain", "Singh", "Kapoor", "Khan", "Pandya", "Raval", "Vyas", "Chauhan", "Rathod", "Gohil", "Dave", "Nair", "Reddy", "Iyer", "Kumar", "Agarwal"];

const T = {
  5: {
    titles: ["Worth every rupee", "Perfect fit", "Excellent quality", "Very happy with this", "Great product", "Highly recommended", "Superb finish", "Paisa vasool", "Looks premium", "Totally satisfied", "Solid build quality", "Exactly as described", "Top notch", "Best purchase this year", "Brilliant", "Five stars, no doubt"],
    open: ["Got this installed last week and I'm really impressed.", "Ordered it after reading a few reviews and it did not disappoint.", "Bought this for my car and the quality is far better than I expected.", "Been using it for a couple of weeks now and zero complaints.", "Honestly one of the best accessories I have bought for my vehicle.", "Delivery was quick and the packing was neat.", "Was a bit sceptical ordering online but this turned out great.", "Fitted it the same day and it looks like it came from the factory.", "Third purchase from Delite and again no issues.", "Gifted this to my brother and he loves it too.", "My mechanic also appreciated the quality when he saw it.", "Replaced my old one with this and the difference is huge."],
    mid: ["The material feels sturdy and the finish is really clean.", "Fitment was spot on, no gaps or adjustments needed.", "Looks much more premium in person than in the photos.", "Installation was easy and took hardly any time.", "Build quality is solid, nothing feels cheap or flimsy.", "Colour matches exactly what was shown on the website.", "It has held up well through heat and a few heavy rains already.", "The stitching and edges are neat, you can see the attention to detail.", "Performance is noticeably better than the one I had earlier.", "Price is very reasonable for this level of quality.", "Support team also answered my questions quickly before I ordered.", "No rattling, no smell, no loose parts."],
    close: ["Totally worth the money, will buy again.", "Highly recommended to anyone looking for this.", "Definitely recommend it to friends and family.", "Happy customer, thank you Delite!", "Will order more accessories from here.", "Five stars from me.", "Great value, go for it without worrying.", "Thanks to the team for the smooth experience."],
  },
  4: {
    titles: ["Good product", "Pretty good overall", "Happy with it", "Good value", "Looks good", "Decent quality, good fit", "Nice, one small niggle", "Almost perfect", "Good buy", "Solid choice"],
    open: ["Overall a good product and I am mostly satisfied.", "Received it on time and the packing was fine.", "Using it for about two weeks now and it works well.", "Ordered based on the reviews and it is mostly as expected.", "Good purchase for the price I paid.", "Installed it over the weekend and it looks good.", "Decent product, does what it is supposed to do."],
    mid: ["Quality is good, though a couple of small finishing details could be better.", "Fitment is nice but needed a little adjustment to sit properly.", "Looks good and feels sturdy, the colour is slightly different from the photo.", "Installation took a bit longer than I expected but the result is fine.", "Material feels good for the price, not super premium but solid.", "Works well, only minor thing is the instruction sheet was not very clear.", "Everything is good, I just wish the packaging was a little better.", "Gives a nice upgrade to the look, small gap on one corner but not noticeable."],
    close: ["Would still recommend it.", "Good value for money overall.", "Happy with the purchase, four stars.", "Will consider buying again.", "Nothing major to complain about.", "Worth buying at this price."],
  },
  3.5: {
    titles: ["Okay for the price", "Average, does the job", "Good but not perfect", "Could be better", "Fine, with some issues", "Decent, expected a bit more", "Mixed feelings", "Acceptable"],
    open: ["It is an okay product but I expected a little more.", "Delivery took longer than promised but the product arrived safely.", "Mixed experience with this one.", "Does the job but there is room for improvement.", "Bought it on a friend's suggestion, it is fine but not amazing.", "Product is decent for the price, nothing extraordinary."],
    mid: ["The fit needed some adjustment and took me a while to set right.", "Finish is average, a few rough edges that I had to clean up.", "Colour looks a bit different than the photos on the website.", "Quality is acceptable but I have seen better at this price range.", "Works fine, but the material feels thinner than I expected.", "Installation instructions were unclear so I needed help from my mechanic.", "Packaging was slightly damaged, thankfully the product was okay."],
    close: ["Okay for the price, but not perfect.", "Three and a half stars from me.", "Fine for now, let's see how it lasts.", "Would have given more stars with better finishing.", "Decent purchase but don't expect too much.", "Average overall, hope the quality improves."],
  },
};

// Deliberately ungrammatical closers for the ~2% "grammar error" reviews.
const GRAMMAR_ERRORS = [
  "Product is good quality and fitting are perfect.", "I am using since 2 months and it work very good.", "Delivery was fast and the packing were good.", "Not disappointed me at all, it have a nice finishing.", "This are the best one I bought till now.", "Me and my friend both bought it, quality is more better than expected.", "Its looking very nice and the price are also fair.", "I recieved the item in 3 days, working fine no any problem.",
];

// ~10% of reviews get light punctuation sloppiness.
const SLOPPY = [
  (s) => s.replace(/[.!]$/, ""),
  (s) => s.charAt(0).toLowerCase() + s.slice(1),
  (s) => s.replace(". ", ".. "),
  (s) => s.replace(", ", " "),
  (s) => s.replace(". ", " ,"),
  (s) => s.replace(/\.$/, "!!"),
  (s) => s.replace(". ", "  "),
  (s) => s.replace(",", ",,"),
];

function buildReview(rating, usedKeys) {
  const t = T[rating];
  for (let attempt = 0; attempt < 30; attempt++) {
    const open = pick(t.open), mid = pick(t.mid);
    let close = pick(t.close);
    const grammar = rand() < 0.02;
    if (grammar) close = pick(GRAMMAR_ERRORS);
    let body = rand() < 0.2 ? `${open} ${close}` : `${open} ${mid} ${close}`;
    let title = pick(t.titles);
    const key = open + mid + close;
    if (usedKeys.has(key) && !grammar) continue;
    usedKeys.add(key);
    if (!grammar && rand() < 0.1) {
      body = pick(SLOPPY)(body);
      if (rand() < 0.4) title = title.charAt(0).toLowerCase() + title.slice(1).replace(/$/, "");
    }
    return { title, body };
  }
  const t2 = pick(t.titles);
  return { title: t2, body: `${pick(t.open)} ${pick(t.close)}` };
}

// ---------- counts per product ----------
function tierCounts(ids) {
  const shuffled = shuffle(ids);
  const n = shuffled.length;
  const nHigh = n >= 4 ? Math.max(1, Math.round(n * 0.05)) : 0;
  const nLow = Math.round(n * 0.3);
  return shuffled.map((id, i) => {
    if (i < nHigh) return [id, int(120, 130)];
    if (i < nHigh + nLow) return [id, int(40, 60)];
    return [id, int(70, 90)];
  });
}

const sq = (s) => `'${s.replace(/'/g, "''")}'`;
const DAY = 86400000;

async function main() {
  const ids = await loadTemplateIds();
  if (ids.length === 0) throw new Error("No products found");
  const plan = tierCounts(ids);
  const rows = [];
  const dist = { 5: 0, 4: 0, 3.5: 0 };
  const now = Date.now();

  for (const [templateId, count] of plan) {
    const n5 = Math.round(count * 0.7), n4 = Math.round(count * 0.2);
    const ratings = shuffle([...Array(n5).fill(5), ...Array(n4).fill(4), ...Array(count - n5 - n4).fill(3.5)]);
    const used = new Set();
    for (const rating of ratings) {
      const { title, body } = buildReview(rating, used);
      const name = rand() < 0.15 ? pick(FIRST) : `${pick(FIRST)} ${rand() < 0.5 ? pick(LAST) : pick(LAST).charAt(0) + "."}`;
      const created = new Date(now - int(1, 365) * DAY - int(0, DAY - 1)).toISOString();
      rows.push(`(${templateId}, ${rating.toFixed(1)}, ${sq(title)}, ${sq(body)}, ${sq(name)}, ${rand() < 0.6}, ${sq(created)})`);
      dist[rating]++;
    }
  }

  const chunks = [];
  for (let i = 0; i < rows.length; i += 400) {
    chunks.push(
      `insert into public.product_reviews (odoo_template_id, rating, title, body, reviewer_name, verified_purchase, created_at, is_seed)\n` +
        `select v.odoo_template_id::int, v.rating::numeric(2,1), v.title, v.body, v.reviewer_name, v.verified_purchase::boolean, v.created_at::timestamptz, true\n` +
        `from (values\n${rows.slice(i, i + 400).join(",\n")}\n) as v(odoo_template_id, rating, title, body, reviewer_name, verified_purchase, created_at);`
    );
  }
  const sql = [
    "-- Generated by scripts/seed-demo-reviews.mjs — demo reviews, flagged is_seed. Safe to re-run.",
    "begin;",
    "delete from public.product_reviews where is_seed;",
    ...chunks,
    // The BEFORE INSERT trigger forces every insert to 'pending'; approve the seed rows afterwards.
    "update public.product_reviews set status = 'approved' where is_seed and status = 'pending';",
    "commit;",
  ].join("\n");

  const out = opt("--out") ?? "seed-demo-reviews.sql";
  writeFileSync(out, sql);

  const total = rows.length;
  const tiers = { "40-60": 0, "70-90": 0, "120-130": 0 };
  for (const [, c] of plan) tiers[c <= 60 ? "40-60" : c <= 90 ? "70-90" : "120-130"]++;
  console.log(`products: ${ids.length}  reviews: ${total}  -> ${out}`);
  console.log("products per count tier:", tiers);
  console.log("rating split:", Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, `${((v / total) * 100).toFixed(1)}%`])));

  if (flag("--apply")) {
    // The Management API rejects a single 6 MB request (413), so send one small statement at a time.
    const statements = [
      "delete from public.product_reviews where is_seed;",
      ...chunks,
      "update public.product_reviews set status = 'approved' where is_seed and status = 'pending';",
    ];
    const part = out.replace(/\.sql$/, "") + ".part.sql";
    statements.forEach((stmt, i) => {
      writeFileSync(part, stmt);
      execFileSync("npx", ["supabase", "db", "query", "--linked", "--project-ref", PROJECT_REF, "--file", part], { stdio: "ignore", shell: true });
      console.log(`applied ${i + 1}/${statements.length}`);
    });
    console.log("done.");
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
