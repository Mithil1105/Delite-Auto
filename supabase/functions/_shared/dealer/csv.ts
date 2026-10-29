// supabase/functions/_shared/dealer/csv.ts
//
// Small RFC-4180-style CSV parser + dealer price CSV row parsing. Pure; the server re-validates on
// commit, so the browser never gets to decide what is "valid".

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export interface PriceCsvRow {
  line: number;
  sku: string;
  /** Price in rupees as typed; converted to paise by the caller after validation. */
  priceRupees: number | null;
  taxBasis: "exclusive" | "inclusive" | null;
  minQty: number | null;
  qtyMultiple: number | null;
  startsAt: string | null;
  endsAt: string | null;
  note: string | null;
  errors: string[];
}

export const PRICE_CSV_MAX_ROWS = 2000;

const HEADER_ALIASES: Record<string, string> = {
  sku: "sku",
  "internal reference": "sku",
  code: "sku",
  price: "price",
  "dealer price": "price",
  "unit price": "price",
  tax: "tax",
  "tax basis": "tax",
  moq: "moq",
  "min qty": "moq",
  "minimum quantity": "moq",
  multiple: "multiple",
  "qty multiple": "multiple",
  "quantity multiple": "multiple",
  start: "start",
  "starts at": "start",
  "start date": "start",
  end: "end",
  "ends at": "end",
  "end date": "end",
  note: "note",
  "deal note": "note",
};

export function parsePriceCsv(text: string): { rows: PriceCsvRow[]; fatal: string | null } {
  const grid = parseCsv(text);
  if (grid.length < 2) return { rows: [], fatal: "The file needs a header row and at least one data row" };
  if (grid.length - 1 > PRICE_CSV_MAX_ROWS) return { rows: [], fatal: `At most ${PRICE_CSV_MAX_ROWS} rows per import` };

  const columns = grid[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  if (!columns.includes("sku")) return { rows: [], fatal: 'Missing a "sku" column' };
  if (!columns.includes("price")) return { rows: [], fatal: 'Missing a "price" column' };

  const rows: PriceCsvRow[] = grid.slice(1).map((cells, idx) => {
    const get = (name: string): string => {
      const i = columns.indexOf(name);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const errors: string[] = [];
    const sku = get("sku");
    if (!sku) errors.push("SKU is empty");

    const priceRaw = get("price").replace(/[₹,\s]/g, "");
    let priceRupees: number | null = null;
    if (!priceRaw) errors.push("Price is empty");
    else if (!/^\d+(\.\d{1,2})?$/.test(priceRaw) || Number(priceRaw) <= 0) errors.push(`Price "${get("price")}" is not a positive amount with up to 2 decimals`);
    else priceRupees = Number(priceRaw);

    const taxRaw = get("tax").toLowerCase();
    let taxBasis: PriceCsvRow["taxBasis"] = null;
    if (taxRaw) {
      if (taxRaw === "exclusive" || taxRaw === "excl" || taxRaw === "ex") taxBasis = "exclusive";
      else if (taxRaw === "inclusive" || taxRaw === "incl" || taxRaw === "inc") taxBasis = "inclusive";
      else errors.push(`Tax basis "${get("tax")}" must be exclusive or inclusive`);
    }

    const intOrNull = (name: string, label: string): number | null => {
      const v = get(name);
      if (!v) return null;
      if (!/^\d+$/.test(v) || Number(v) < 1) {
        errors.push(`${label} "${v}" must be a whole number of 1 or more`);
        return null;
      }
      return Number(v);
    };
    const dateOrNull = (name: string, label: string): string | null => {
      const v = get(name);
      if (!v) return null;
      const parsed = Date.parse(v);
      if (Number.isNaN(parsed)) {
        errors.push(`${label} "${v}" is not a valid date`);
        return null;
      }
      return new Date(parsed).toISOString();
    };

    const startsAt = dateOrNull("start", "Start date");
    const endsAt = dateOrNull("end", "End date");
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) errors.push("End date must be after the start date");

    return {
      line: idx + 2,
      sku,
      priceRupees,
      taxBasis,
      minQty: intOrNull("moq", "Minimum quantity"),
      qtyMultiple: intOrNull("multiple", "Quantity multiple"),
      startsAt,
      endsAt,
      note: get("note") || null,
      errors,
    };
  });
  return { rows, fatal: null };
}
