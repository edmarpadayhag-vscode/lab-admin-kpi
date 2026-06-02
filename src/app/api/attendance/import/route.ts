import { db } from "@/lib/db";
import { attendanceLogs, employees } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { calcLateMinutes, expectedOut, isNonWorkSchedule } from "@/lib/attendance-utils";

// ─── Header aliases ────────────────────────────────────────────────────────────
type RowKey = "date" | "employee" | "firstName" | "lastName" | "schedule" | "actualIn" | "actualOut";

const HEADER_ALIASES: [pattern: string, field: RowKey][] = [
  // ── date ──────────────────────────────────────────────────────────────────
  ["date",              "date"],
  ["work date",         "date"],
  ["work_date",         "date"],
  ["start time",        "date"],
  ["day",               "date"],
  // ── split first / last name ───────────────────────────────────────────────
  ["first",             "firstName"],
  ["first name",        "firstName"],
  ["first_name",        "firstName"],
  ["given name",        "firstName"],
  ["last",              "lastName"],
  ["last name",         "lastName"],
  ["last_name",         "lastName"],
  ["surname",           "lastName"],
  ["family name",       "lastName"],
  // ── combined employee name ────────────────────────────────────────────────
  ["first & last",      "employee"],
  ["first & last name", "employee"],
  ["first and last",    "employee"],
  ["employee",          "employee"],
  ["employee name",     "employee"],
  ["employee_name",     "employee"],
  ["full name",         "employee"],
  ["name",              "employee"],
  ["staff name",        "employee"],
  ["staff",             "employee"],
  // ── schedule ──────────────────────────────────────────────────────────────
  ["schedule",          "schedule"],
  ["expected in",       "schedule"],
  ["expected_in",       "schedule"],
  ["time in (expected)","schedule"],
  ["shift",             "schedule"],
  // ── actual in ─────────────────────────────────────────────────────────────
  ["on time",           "actualIn"],
  ["actual_in",         "actualIn"],
  ["actual in",         "actualIn"],
  ["time in",           "actualIn"],
  ["time_in",           "actualIn"],
  ["actual time in",    "actualIn"],
  ["check in",          "actualIn"],
  // ── actual out ────────────────────────────────────────────────────────────
  ["off time",          "actualOut"],
  ["actual_out",        "actualOut"],
  ["actual out",        "actualOut"],
  ["time out",          "actualOut"],
  ["time_out",          "actualOut"],
  ["actual time out",   "actualOut"],
  ["check out",         "actualOut"],
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

function parseDate(value: unknown): string | null {
  if (!value && value !== 0) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    // Use local date parts to avoid UTC-offset shift
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number") {
    const d = excelSerialToDate(value);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  // format as YYYY-MM-DD
  return s.includes("T") ? s.slice(0, 10) : s;
}

function parseTime(value: unknown): string | null {
  if (!value && value !== 0) return null;
  if (value instanceof Date) {
    // xlsx cellDates: use local hours/minutes
    const h = String(value.getHours()).padStart(2, "0");
    const m = String(value.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
  if (typeof value === "number") {
    // fractional day serial: 0.5 = 12:00
    const totalMin = Math.round(value * 24 * 60);
    const h = String(Math.floor(totalMin / 60) % 24).padStart(2, "0");
    const m = String(totalMin % 60).padStart(2, "0");
    return `${h}:${m}`;
  }
  const s = String(value).trim();
  if (!s) return null;
  // ISO 8601 datetime: "2024-01-15T08:30:00" or "2024-01-15T08:30:00.000Z"
  // Extract the time portion directly from the string (ignore date & timezone)
  const isoMatch = s.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}:${isoMatch[2]}`;
  // Plain HH:MM or H:MM
  if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, "0");
  return null;
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
    return NextResponse.json({ error: "Could not parse file" }, { status: 400 });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return NextResponse.json({ error: "Workbook has no sheets" }, { status: 400 });

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (rawRows.length < 2) {
    return NextResponse.json(
      { error: "No data rows found (need a header row + at least one data row)" },
      { status: 400 }
    );
  }

  const headerRow = (rawRows[0] as unknown[]).map((c) => String(c ?? ""));
  const colMap = normalizeHeaders(headerRow);

  if (!colMap.size) {
    return NextResponse.json({
      error: `No recognised columns found. Headers detected in your file: ${headerRow.filter(Boolean).join(", ") || "(none)"}`,
    }, { status: 400 });
  }

  // Load employees for name → id + schedule lookup
  const allEmployees = await db
    .select({ id: employees.id, name: employees.name, expectedTimeIn: employees.expectedTimeIn })
    .from(employees);

  // name → { id, schedule } — trim "HH:MM:SS" to "HH:MM"
  const byName = new Map(
    allEmployees.map((e) => [
      e.name.trim().toLowerCase(),
      {
        id: e.id,
        schedule: e.expectedTimeIn
          ? String(e.expectedTimeIn).slice(0, 5)   // "08:00:00" → "08:00"
          : "08:00",
      },
    ])
  );

  const toUpsert: (typeof attendanceLogs.$inferInsert)[] = [];
  const errors: { row: number; message: string }[] = [];

  (rawRows.slice(1) as unknown[][]).forEach((row, idx) => {
    const rowNum = idx + 2;

    const get = (key: RowKey): unknown => {
      for (const [colIdx, field] of colMap) {
        if (field === key) return row[colIdx];
      }
      return "";
    };

    // Skip blank rows
    const allBlank = Array.from(colMap.keys()).every(
      (ci) => row[ci] === "" || row[ci] == null
    );
    if (allBlank) return;

    // Date (required)
    const rawDate = get("date");
    const workDate = parseDate(rawDate);
    if (!workDate) {
      errors.push({ row: rowNum, message: `Invalid or missing date: "${String(rawDate)}"` });
      return;
    }

    // Employee (required) — support combined column OR separate First + Last
    const hasSplit = Array.from(colMap.values()).includes("firstName") ||
                     Array.from(colMap.values()).includes("lastName");
    let rawName: string;
    if (hasSplit) {
      const firstFull = String(get("firstName") ?? "").trim();
      const first = firstFull.split(/\s+/)[0] ?? ""; // only the first word
      const last  = String(get("lastName")  ?? "").trim();
      rawName = [first, last].filter(Boolean).join(" ");
    } else {
      rawName = String(get("employee") ?? "").trim();
    }
    if (!rawName) {
      errors.push({ row: rowNum, message: "Missing employee name" });
      return;
    }
    const empRecord = byName.get(rawName.toLowerCase());
    if (!empRecord) {
      errors.push({ row: rowNum, message: `Unknown employee: "${rawName}"` });
      return;
    }
    const employeeId = empRecord.id;

    // Schedule — use the employee's assigned schedule; file column overrides if present
    const rawSchedule = String(get("schedule") ?? "").trim();
    const schedule    = rawSchedule || empRecord.schedule;
    const nonWork     = isNonWorkSchedule(schedule);

    // Times (optional)
    const actualTimeIn  = parseTime(get("actualIn"));
    const actualTimeOut = parseTime(get("actualOut"));

    toUpsert.push({
      employeeId,
      workDate,
      schedule,
      expectedTimeIn:  nonWork ? null : schedule,
      expectedTimeOut: nonWork ? null : expectedOut(schedule),
      actualTimeIn,
      actualTimeOut,
      lateMinutes: calcLateMinutes(schedule, actualTimeIn),
    });
  });

  let inserted = 0;
  if (toUpsert.length > 0) {
    for (const row of toUpsert) {
      await db
        .insert(attendanceLogs)
        .values(row)
        .onConflictDoUpdate({
          target: [attendanceLogs.employeeId, attendanceLogs.workDate],
          set: {
            schedule:        row.schedule,
            expectedTimeIn:  row.expectedTimeIn,
            expectedTimeOut: row.expectedTimeOut,
            actualTimeIn:    row.actualTimeIn,
            actualTimeOut:   row.actualTimeOut,
            lateMinutes:     row.lateMinutes,
          },
        });
      inserted++;
    }
  }

  return NextResponse.json({
    inserted,
    skipped: errors.length,
    total: rawRows.length - 1,
    errors,
  });
}
