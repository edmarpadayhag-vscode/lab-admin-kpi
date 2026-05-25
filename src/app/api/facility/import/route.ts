import { db } from "@/lib/db";
import { facilityLogs } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

// Column mapping from the source Excel form:
//   Column B (index 1) — "Start time"            → date + timeSubmitted
//   Column H (index 7) — "Please enter your name" → personnelPresent (free text)
const COL_DATETIME = 1;
const COL_NAME = 7;

function excelSerialToDate(serial: number): Date {
  const utcMs = Math.round(serial * 86400 * 1000);
  return new Date(Date.UTC(1899, 11, 30) + utcMs);
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
  // Date object from xlsx (cellDates: true) — extract local HH:MM:SS
  if (value instanceof Date) {
    const h = String(value.getHours()).padStart(2, "0");
    const m = String(value.getMinutes()).padStart(2, "0");
    const s = String(value.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  // Pure numeric fraction of a day (Excel serial with no date component)
  if (typeof value === "number") {
    const totalSec = Math.round((value % 1) * 86400);
    const h = Math.floor(totalSec / 3600) % 24;
    const m = Math.floor(totalSec / 60) % 60;
    const s = totalSec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  // String — handle "HH:MM", "HH:MM:SS", "H:MM AM/PM"
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

function isHeaderRow(row: unknown[]): boolean {
  // Header row contains the literal header strings; skip it.
  const b = row[COL_DATETIME];
  const h = row[COL_NAME];
  if (typeof b === "string" && /start\s*time/i.test(b)) return true;
  if (typeof h === "string" && /please\s*enter\s*your\s*name/i.test(h)) return true;
  return false;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  const MAX_BYTES = 5 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 5 MB limit" }, { status: 400 });
  }

  let workbook: XLSX.WorkBook;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
  } catch {
    return NextResponse.json({ error: "Could not parse Excel file" }, { status: 400 });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return NextResponse.json({ error: "Workbook has no sheets" }, { status: 400 });
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
  });

  const toInsert: typeof facilityLogs.$inferInsert[] = [];
  const errors: { row: number; message: string }[] = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 1; // 1-based row number as shown in Excel
    if (isHeaderRow(row)) return;

    const rawDatetime = row[COL_DATETIME];
    const rawName = row[COL_NAME];

    if ((rawDatetime === "" || rawDatetime === null || rawDatetime === undefined) &&
        (rawName === "" || rawName === null || rawName === undefined)) {
      return; // empty row
    }

    const date = parseDate(rawDatetime);
    if (!date) {
      errors.push({ row: rowNum, message: `Invalid or missing date in column B: ${String(rawDatetime)}` });
      return;
    }

    const name = String(rawName ?? "").trim();
    if (!name) {
      errors.push({ row: rowNum, message: "Missing name in column H" });
      return;
    }

    toInsert.push({
      date,
      timeSubmitted: parseTime(rawDatetime),
      personnelPresent: name,
      source: "import",
    });
  });

  let inserted = 0;
  if (toInsert.length > 0) {
    const result = await db.insert(facilityLogs).values(toInsert).returning({ id: facilityLogs.id });
    inserted = result.length;
  }

  return NextResponse.json({
    inserted,
    skipped: errors.length,
    total: rows.length,
    errors,
  });
}
