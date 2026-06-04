import { db } from "@/lib/db";
import { esatFeedback, employees } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
// v3 — type-aware MS Forms column headers (Agents + Client)

// ─── Header aliases ────────────────────────────────────────────────────────────
type RowKey = "date" | "labAdmin" | "rate" | "productRate" | "remarks" | "rater";

// Aliases in priority order: Agents-specific headers come first so they claim
// their fields before the generic fallbacks are checked. Client ESAT files
// won't have those columns so the generic aliases fire as normal.
const HEADER_ALIASES: [pattern: string, field: RowKey][] = [
  // ── Agents ESAT specific ──────────────────────────────────────────────────
  ["staff were approachable and accommodating.",                                                   "rate"],
  [
    "products, devices, tablets, and computer are working. (if the devices were not working, please add your remarks)",
    "productRate",
  ],
  ["please provide feedback if your answer to question 8 is \"no\"",                              "remarks"],
  ["please provide feedback if your answer to question 8 is 'no'",                               "remarks"],
  // ── date ──────────────────────────────────────────────────────────────────
  ["start time",      "date"],
  ["date",            "date"],
  ["submitted at",    "date"],
  ["timestamp",       "date"],
  ["submitted",       "date"],
  // ── lab admin ─────────────────────────────────────────────────────────────
  ["who assisted you?",          "labAdmin"],
  ["who assisted you",           "labAdmin"],
  ["please enter your name",     "labAdmin"],
  ["lab admin",                  "labAdmin"],
  ["staff name",                 "labAdmin"],
  ["employee name",              "labAdmin"],
  // ── rate (Client ESAT / generic) ──────────────────────────────────────────
  ["please rate the assistance provided by the lab admins, with 1 being the lowest and 5 being the highest.", "rate"],
  ["please rate the assistance provided by the lab admins, with 1 being the lowest and 5 being the highest",  "rate"],
  ["score (1-5)",     "rate"],
  ["rating",          "rate"],
  ["rate",            "rate"],
  ["score",           "rate"],
  // ── remarks (Client ESAT / generic) ───────────────────────────────────────
  ["what influenced your decision to give this rating?", "remarks"],
  ["what influenced your decision to give this rating",  "remarks"],
  ["remarks",         "remarks"],
  ["comments",        "remarks"],
  ["comment",         "remarks"],
  ["feedback",        "remarks"],
  ["notes",           "remarks"],
  // ── rater ─────────────────────────────────────────────────────────────────
  ["name",            "rater"],
  ["rater",           "rater"],
  ["respondent",      "rater"],
  ["submitted by",    "rater"],
];

function normalizeHeaders(headers: string[]): Map<number, RowKey> {
  const map = new Map<number, RowKey>();
  const claimed = new Set<RowKey>();

  for (const [pattern, field] of HEADER_ALIASES) {
    if (claimed.has(field)) continue;
    const idx = headers.findIndex(
      (h) => String(h ?? "").trim().toLowerCase() === pattern
    );
    if (idx !== -1) {
      map.set(idx, field);
      claimed.add(field);
    }
  }
  return map;
}

// ─── Parsers ───────────────────────────────────────────────────────────────────
function excelSerialToDate(n: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400 * 1000));
}

function parseDate(value: unknown): Date | null {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return excelSerialToDate(value);
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  // MS Forms exports rating labels like "5 (Strongly agree)" — grab the leading number.
  const s = String(value).trim();
  const leading = s.match(/^(\d+(\.\d+)?)/);
  const n = leading ? Number(leading[1]) : Number(s);
  if (isNaN(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

// Product rate: "Yes" → 5, "No" → 1, blank/empty → null (not counted).
function parseProductRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  if (s === "yes") return 5;
  if (s === "no")  return 1;
  return null; // any other value treated as empty — silently ignored
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const form = await request.formData();
  const rawType = form.get("type");
  const esatType: "agents" | "client" = rawType === "client" ? "client" : "agents";
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "File exceeds 5 MB limit" }, { status: 400 });

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
      type: "buffer",
      cellDates: true,
    });
  } catch {
    return NextResponse.json({ error: "Could not parse Excel file" }, { status: 400 });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return NextResponse.json({ error: "Workbook has no sheets" }, { status: 400 });

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (rawRows.length < 2) {
    return NextResponse.json({ error: "No data rows found (need a header row + at least one data row)" }, { status: 400 });
  }

  const headerRow = (rawRows[0] as unknown[]).map((c) => String(c ?? ""));
  const colMap = normalizeHeaders(headerRow);

  if (!colMap.size) {
    return NextResponse.json({
      error: "No recognised columns found. Expected headers: Date, Lab Admin, Staff Rate / Rate, Remarks",
    }, { status: 400 });
  }

  const allEmployees = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees);
  const byName = new Map(allEmployees.map((e) => [e.name.trim().toLowerCase(), e.id]));

  const toInsert: typeof esatFeedback.$inferInsert[] = [];
  const errors: { row: number; message: string }[] = [];

  (rawRows.slice(1) as unknown[][]).forEach((row, idx) => {
    const rowNum = idx + 2;

    const get = (key: RowKey): unknown => {
      for (const [colIdx, field] of colMap) {
        if (field === key) return (row as unknown[])[colIdx];
      }
      return "";
    };

    // Skip blank rows
    const allBlank = Array.from(colMap.keys()).every(
      (ci) => (row as unknown[])[ci] === "" || (row as unknown[])[ci] == null
    );
    if (allBlank) return;

    // Date
    const rawDate = get("date");
    const parsedDate = parseDate(rawDate);
    if (!parsedDate) {
      errors.push({ row: rowNum, message: `Invalid or missing date: "${String(rawDate)}"` });
      return;
    }

    // Lab Admin → employee lookup
    const rawName = String(get("labAdmin") ?? "").trim();
    if (!rawName) {
      errors.push({ row: rowNum, message: "Missing Lab Admin name" });
      return;
    }
    const staffId = byName.get(rawName.toLowerCase());
    if (!staffId) {
      errors.push({ row: rowNum, message: `Unknown employee: "${rawName}"` });
      return;
    }

    // Staff Rate (score)
    const rawRate = get("rate");
    const score = parseRate(rawRate);
    if (score === null) {
      errors.push({ row: rowNum, message: `Invalid staff rate (must be 1–5): "${String(rawRate)}"` });
      return;
    }

    // Product Rate (equivalentScore) — optional, no error if missing/blank
    const equivalentScore = parseProductRate(get("productRate"));

    const remarks = String(get("remarks") ?? "").trim() || null;
    const rater   = String(get("rater")   ?? "").trim() || null;

    toInsert.push({
      staffId,
      esatType,
      score,
      equivalentScore,
      productWorking: equivalentScore !== null ? equivalentScore >= 3 : true,
      remarks,
      rater,
      submittedAt: parsedDate,
    });
  });

  let inserted = 0;
  if (toInsert.length > 0) {
    try {
      const result = await db.insert(esatFeedback).values(toInsert).returning({ id: esatFeedback.id });
      inserted = result.length;
    } catch (err) {
      console.error("[POST /api/esat/import] DB insert failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Database error: ${message}. Make sure you have run \`npx drizzle-kit push\`.` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    inserted,
    skipped: errors.length,
    total: rawRows.length - 1,
    errors,
  });
}
