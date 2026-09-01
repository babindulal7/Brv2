#!/usr/bin/env node
/**
 * booqable-cost-audit.mjs — sizes the D1 backfill job. READ-ONLY (GET requests only).
 *
 * Counts, across the live Booqable account:
 *   1. stock items missing a purchase cost          → the depreciation/ROI input gap
 *   2. product groups with no default purchase cost → the fallback gap
 *   3. product groups with deposit value 0/unset    → why deposits aren't charged
 *   4. product groups with both buffers at 0        → the unused cleaning window
 *
 * Usage (PowerShell):
 *   $env:BOOQABLE_COMPANY="babin-rentals"
 *   $env:BOOQABLE_TOKEN="<api token>"        # Settings ▸ Account, an existing token
 *   node booqable-cost-audit.mjs
 *
 * API budget: ~10–20 GET calls against the 150,000/month ceiling.
 */

const COMPANY = process.env.BOOQABLE_COMPANY;
const TOKEN = process.env.BOOQABLE_TOKEN;
if (!COMPANY || !TOKEN) {
  console.error("Set BOOQABLE_COMPANY and BOOQABLE_TOKEN environment variables first.");
  process.exit(1);
}
const BASE = `https://${COMPANY}.booqable.com/api/4`;

async function fetchAll(path, params = {}) {
  const out = [];
  let page = 1;
  for (;;) {
    const q = new URLSearchParams({ ...params, "page[size]": "100", "page[number]": String(page) });
    const res = await fetch(`${BASE}/${path}?${q}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`GET ${path} page ${page}: HTTP ${res.status} ${await res.text().then(t => t.slice(0, 200))}`);
    const body = await res.json();
    const rows = body.data ?? [];
    out.push(...rows);
    if (rows.length < 100) return out;
    page += 1;
    if (page > 200) throw new Error(`${path}: >20000 rows, aborting as a safety stop`);
  }
}

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const money = (v) => (v == null ? "—" : `Rs.${(v / 100).toLocaleString("en-IN")}`); // API values are in cents/paisa

const groups = await fetchAll("product_groups");
const items = await fetchAll("stock_items");

const g = groups.map((r) => {
  const a = r.attributes ?? {};
  return {
    name: a.name,
    deposit: num(a.deposit_in_cents),
    defaultCost: num(a.purchase_price_in_cents ?? a.default_purchase_price_in_cents),
    bufferBefore: num(a.buffer_time_before) ?? 0,
    bufferAfter: num(a.buffer_time_after) ?? 0,
    trackable: a.trackable === true,
  };
});
const it = items.map((r) => {
  const a = r.attributes ?? {};
  return { id: a.identifier, cost: num(a.purchase_price_in_cents ?? a.purchase_cost_in_cents) };
});

const itemsNoCost = it.filter((x) => !x.cost);
const groupsNoDefault = g.filter((x) => !x.defaultCost);
const groupsNoDeposit = g.filter((x) => !x.deposit);
const groupsNoBuffer = g.filter((x) => x.bufferBefore === 0 && x.bufferAfter === 0);

console.log(`\n=== D1 SIZING — ${new Date().toISOString().slice(0, 10)} ===`);
console.log(`product groups: ${g.length} · stock items: ${it.length}\n`);
console.log(`stock items with NO purchase cost      : ${itemsNoCost.length} / ${it.length}`);
console.log(`groups with NO default purchase cost   : ${groupsNoDefault.length} / ${g.length}`);
console.log(`groups with deposit 0/unset            : ${groupsNoDeposit.length} / ${g.length}`);
console.log(`groups with both buffers = 0           : ${groupsNoBuffer.length} / ${g.length}\n`);
console.log(`Backfill job size = ${itemsNoCost.length} unit costs + ${groupsNoDeposit.length} deposit values (+ defaults where a whole group shares one price).\n`);

const sample = (arr, f) => arr.slice(0, 15).map(f).join("\n");
if (itemsNoCost.length) console.log("First 15 units missing cost:\n" + sample(itemsNoCost, (x) => `  ${x.id ?? "(no identifier)"}`) + (itemsNoCost.length > 15 ? `\n  … +${itemsNoCost.length - 15} more` : ""));
if (groupsNoDeposit.length) console.log("\nFirst 15 groups with no deposit:\n" + sample(groupsNoDeposit, (x) => `  ${x.name}`) + (groupsNoDeposit.length > 15 ? `\n  … +${groupsNoDeposit.length - 15} more` : ""));

console.log("\nNOTE: attribute names are matched defensively (purchase_price_in_cents / purchase_cost_in_cents /");
console.log("deposit_in_cents). If a count reads 100% missing, print one raw record (add console.log(items[0]))");
console.log("and check the real field name against https://developers.booqable.com — the API is JSON:API v4.");
