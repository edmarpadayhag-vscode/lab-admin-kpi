import { db } from "@/lib/db";
import { esatFeedback, employees } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
// v2 — explicit MS Forms column headers

// ─── Header aliases ────────────────────────────────────────────────────────────
type RowKey = "date" | "labAdmin" | "rate" | "remarks";

// Aliases in priority order: specific (MS Forms exact) headers listed first so
// they win over generic fallbacks when multiple columns could match the same field.
const HEADER_ALIASES: [pattern: string, field: RowKey][] = [
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
  // ── rate ──────────────────────────────────────────────────────────────────
  ["please rate the assistance provided by the lab admins, with 1 being the lowest and 5 being the highest.", "rate"],
  ["please rate the assistance provided by the lab admins, with 1 being the lowest and 5 being the highest",  "rate"],
  ["score (1-5)",     "rate"],
  ["rating",          "rate"],
  ["rate",            "rate"],
  ["score",           "rate"],
  // ── remarks ───────────────────────────────────────────────────────────────
  ["what influenced your decision to give this rating?", "remarks"],
  ["what influenced your decision to give this rating",  "remarks"],
  ["remarks",         "remarks"],
  ["comments",        "remarks"],
  ["comment",         "remarks"],
  ["feedback",        "remarks"],
  ["notes",           "remarks"],
];

function normalizeHeaders(headers: string[]): Map<number, RowKey> {
  const map = new Map<number, RowKey>();
  const claimed = new Set<RowKey>();

  // First pass: honour priority order — first alias that matches an unclaimed field wins.
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
  const n = Number(value);
  if (isNaN(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const form = await request.formData();
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

  // Build column → field map from the first non-empty header row
  const headerRow = (rawRows[0] as unknown[]).map((c) => String(c ?? ""));
  const colMap = normalizeHeaders(headerRow);

  if (!colMap.size) {
    return NextResponse.json({
      error: "No recognised columns found. Expected headers: Date, Lab Admin, Rate, Remarks",
    }, { status: 400 });
  }

  // Load employees for name → id lookup
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

    // Rate
    const rawRate = get("rate");
    const score = parseRate(rawRate);
    if (score === null) {
      errors.push({ row: rowNum, message: `Invalid rate (must be 1–5): "${String(rawRate)}"` });
      return;
    }

    const remarks = String(get("remarks") ?? "").trim() || null;

    toInsert.push({
      staffId,
      score,
      productWorking: true, // default; not collected in this form
      remarks,
      submittedAt: parsedDate,
    });
  });

  let inserted = 0;
  if (toInsert.length > 0) {
    const result = await db.insert(esatFeedback).values(toInsert).returning({ id: esatFeedback.id });
    inserted = result.length;
  }

  return NextResponse.json({
    inserted,
    skipped: errors.length,
    total: rawRows.length - 1,
    errors,
  });
}
