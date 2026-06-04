import { db } from "@/lib/db";
import { facilityLogs } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

// ─── Header aliases ────────────────────────────────────────────────────────────
type RowKey = "date" | "time" | "personnel";

const HEADER_ALIASES: [pattern: string, field: RowKey][] = [
  // ── date ──────────────────────────────────────────────────────────────────
  ["please enter the date.",  "date"],
  ["please enter the date",   "date"],
  ["date",                    "date"],
  ["work date",               "date"],
  // ── time ──────────────────────────────────────────────────────────────────
  ["start time",              "time"],
  ["time submitted",          "time"],
  ["time",                    "time"],
  // ── personnel present ─────────────────────────────────────────────────────
  ["please enter your name/s.",  "personnel"],
  ["please enter your name/s",   "personnel"],
  ["please enter your name.",    "personnel"],
  ["please enter your name",     "personnel"],
  ["personnel present",          "personnel"],
  ["name",                       "personnel"],
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
function excelSerialToDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400 * 1000));
}

function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return excelSerialToDate(value).toISOString().slice(0, 10);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function parseTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    const h = String(value.getHours()).padStart(2, "0");
    const m = String(value.getMinutes()).padStart(2, "0");
    const s = String(value.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  if (typeof value === "number") {
    const totalSec = Math.round((value % 1) * 86400);
    const h = Math.floor(totalSec / 3600) % 24;
    const m = Math.floor(totalSec / 60) % 60;
    const s = totalSec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  const str = String(value).trim();
  const match = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let h = Number(match[1]);
  const m = Number(match[2]);
  const s = match[3] ? Number(match[3]) : 0;
  const mer = match[4]?.toLowerCase();
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size === 0)
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: "File exceeds 5 MB limit" }, { status: 400 });

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
  if (!sheetName)
    return NextResponse.json({ error: "Workbook has no sheets" }, { status: 400 });

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (rawRows.length < 2)
    return NextResponse.json(
      { error: "No data rows found (need a header row + at least one data row)" },
      { status: 400 }
    );

  // Build column → field map from the first row
  const headerRow = (rawRows[0] as unknown[]).map((c) => String(c ?? ""));
  const colMap = normalizeHeaders(headerRow);

  if (!colMap.size)
    return NextResponse.json(
      { error: "No recognised columns found. Expected: \"Please enter the date.\", \"Start time\", \"Please enter your name/s.\"" },
      { status: 400 }
    );

  const get = (row: unknown[], key: RowKey): unknown => {
    for (const [colIdx, field] of colMap) {
      if (field === key) return (row as unknown[])[colIdx];
    }
    return "";
  };

  const toInsert: typeof facilityLogs.$inferInsert[] = [];
  const errors: { row: number; message: string }[] = [];

  (rawRows.slice(1) as unknown[][]).forEach((row, idx) => {
    const rowNum = idx + 2;

    // Skip blank rows
    const allBlank = Array.from(colMap.keys()).every(
      (ci) => row[ci] === "" || row[ci] == null
    );
    if (allBlank) return;

    // Date
    const rawDate = get(row, "date");
    const date = parseDate(rawDate);
    if (!date) {
      errors.push({ row: rowNum, message: `Invalid or missing date: "${String(rawDate)}"` });
      return;
    }

    // Personnel present — required
    const personnel = String(get(row, "personnel") ?? "").trim();
    if (!personnel) {
      errors.push({ row: rowNum, message: "Missing personnel name" });
      return;
    }

    // Time — optional
    const timeSubmitted = parseTime(get(row, "time"));

    toInsert.push({
      date,
      timeSubmitted,
      personnelPresent: personnel,
      source: "import",
    });
  });

  let inserted = 0;
  if (toInsert.length > 0) {
    try {
      const result = await db
        .insert(facilityLogs)
        .values(toInsert)
        .returning({ id: facilityLogs.id });
      inserted = result.length;
    } catch (err) {
      console.error("[POST /api/facility/import] DB insert failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Database error: ${message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    inserted,
    skipped: errors.length,
    total: rawRows.length - 1,
    errors,
  });
}
