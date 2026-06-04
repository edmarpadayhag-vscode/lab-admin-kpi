import { db } from "@/lib/db";
import { redditActivity, employees } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

type RowKey   = "date" | "employee" | "post" | "reply" | "resolved";
type EntryItem = { date: string; post: string; reply: string; resolved: string };

const HEADER_ALIASES: [string, RowKey][] = [
  // date
  ["date",                   "date"],
  ["post date",              "date"],
  ["reply date",             "date"],
  ["activity date",          "date"],
  // employee / answered by
  ["answered by",            "employee"],
  ["employee",               "employee"],
  ["employee name",          "employee"],
  ["name",                   "employee"],
  ["staff",                  "employee"],
  ["staff name",             "employee"],
  ["full name",              "employee"],
  // original thread / post link
  ["original thread",        "post"],
  ["original link",          "post"],
  ["original reddit link",   "post"],
  ["post link",              "post"],
  ["reddit post link",       "post"],
  ["reddit post",            "post"],
  ["reddit link",            "post"],
  ["post url",               "post"],
  ["post",                   "post"],
  ["url",                    "post"],
  // reply thread / reply link
  ["reply thread",           "reply"],
  ["link to your reply",     "reply"],
  ["reply link",             "reply"],
  ["reply url",              "reply"],
  ["your reply",             "reply"],
  ["reply",                  "reply"],
  // resolved / confirmation
  ["resolved?",              "resolved"],
  ["resolved",               "resolved"],
  ["confirmation",           "resolved"],
  ["is resolved",            "resolved"],
  ["status",                 "resolved"],
];

function normalizeHeaders(headers: string[]): Map<number, RowKey> {
  const map     = new Map<number, RowKey>();
  const claimed = new Set<RowKey>();
  for (const [pattern, field] of HEADER_ALIASES) {
    if (claimed.has(field)) continue;
    const idx = headers.findIndex(h => String(h ?? "").trim().toLowerCase() === pattern);
    if (idx !== -1) {
      map.set(idx, field);
      claimed.add(field);
    }
  }
  return map;
}

function excelSerialToDate(n: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400 * 1000));
}

function parseDate(value: unknown): Date | null {
  if (!value && value !== 0) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    // XLSX cellDates:true creates local-midnight Date objects.
    // Re-anchor to UTC midnight using local date parts so UTC methods stay correct.
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  if (typeof value === "number") return excelSerialToDate(value);
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Week 1-5 based on offset from a given start date (YYYY-MM-DD). */
function weekOfRange(dateStr: string, startStr: string): number {
  const d = new Date(dateStr  + "T00:00:00.000Z");
  const s = new Date(startStr + "T00:00:00.000Z");
  const off = Math.floor((d.getTime() - s.getTime()) / 86400000);
  if (off < 0) return 1;
  return Math.min(Math.floor(off / 7) + 1, 5);
}

function calcActivityScore(replyCount: number): number {
  if (replyCount >= 3) return 5;
  if (replyCount === 2) return 3;
  if (replyCount === 1) return 2;
  return 1; // 0 replies
}

function toDateStr(d: Date): string {
  const y   = d.getUTCFullYear();
  const m   = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(request: Request) {
  const form      = await request.formData();
  const file      = form.get("file");
  const startDate = String(form.get("startDate") ?? "").trim(); // YYYY-MM-DD from the page filter
  const endDate   = String(form.get("endDate")   ?? "").trim();
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "File exceeds 5 MB limit" }, { status: 400 });

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: true });
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

  const headerRow = (rawRows[0] as unknown[]).map(c => String(c ?? ""));
  const colMap    = normalizeHeaders(headerRow);

  if (!colMap.size) {
    return NextResponse.json({
      error: `No recognised columns found. Headers detected: ${headerRow.filter(Boolean).join(", ") || "(none)"}`,
    }, { status: 400 });
  }

  const allEmployees = await db.select({ id: employees.id, name: employees.name }).from(employees);
  const byName       = new Map(allEmployees.map(e => [e.name.trim().toLowerCase(), e.id]));

  // Group: employeeId → "month-year-week" → accumulated entries
  type WeekEntry = { month: number; year: number; weekNumber: number; entries: EntryItem[] };
  const grouped  = new Map<number, Map<string, WeekEntry>>();
  const errors: { row: number; message: string }[] = [];

  (rawRows.slice(1) as unknown[][]).forEach((row, idx) => {
    const rowNum = idx + 2;

    const get = (key: RowKey): unknown => {
      for (const [ci, field] of colMap) {
        if (field === key) return row[ci];
      }
      return "";
    };

    const allBlank = Array.from(colMap.keys()).every(ci => row[ci] === "" || row[ci] == null);
    if (allBlank) return;

    // Date (required)
    const rawDate = get("date");
    const parsed  = parseDate(rawDate);
    if (!parsed) {
      errors.push({ row: rowNum, message: `Invalid or missing date: "${String(rawDate)}"` });
      return;
    }
    const month   = parsed.getUTCMonth() + 1;
    const year    = parsed.getUTCFullYear();
    const dateStr = toDateStr(parsed);
    // Only use the page's startDate if it falls in the SAME month/year as this row.
    // If the user imports a May file while viewing June, startDate would be June 1 —
    // every May date would have off<0 and land in Week 1. Guard against that here.
    const ym         = `${year}-${String(month).padStart(2, "0")}`;
    const rangeStart = (startDate && startDate.startsWith(ym + "-")) ? startDate : ym + "-01";
    const rangeEnd   = (endDate   && endDate.startsWith(ym   + "-")) ? endDate   : null;

    // Discard rows whose date falls outside the defined range
    if (dateStr < rangeStart || (rangeEnd && dateStr > rangeEnd)) {
      errors.push({ row: rowNum, message: `Date ${dateStr} is outside the date range — skipped` });
      return;
    }

    const weekNumber = weekOfRange(dateStr, rangeStart);

    // Employee (required)
    const rawName = String(get("employee") ?? "").trim();
    if (!rawName) {
      errors.push({ row: rowNum, message: "Missing employee name" });
      return;
    }
    const employeeId = byName.get(rawName.toLowerCase());
    if (!employeeId) {
      errors.push({ row: rowNum, message: `Unknown employee: "${rawName}"` });
      return;
    }

    const post     = String(get("post")     ?? "").trim();
    const reply    = String(get("reply")    ?? "").trim();
    const resolved = String(get("resolved") ?? "").trim();

    if (!grouped.has(employeeId)) grouped.set(employeeId, new Map());
    const empMap = grouped.get(employeeId)!;
    const key    = `${month}-${year}-${weekNumber}`;
    if (!empMap.has(key)) empMap.set(key, { month, year, weekNumber, entries: [] });
    empMap.get(key)!.entries.push({ date: dateStr, post, reply, resolved });
  });

  let inserted = 0;
  const importedMonths: { month: number; year: number }[] = [];
  const monthsSeen = new Set<string>();
  for (const [employeeId, empMap] of grouped) {
    for (const { month, year, weekNumber, entries } of empMap.values()) {
      const mk = `${month}-${year}`;
      if (!monthsSeen.has(mk)) { monthsSeen.add(mk); importedMonths.push({ month, year }); }
      const replyCount    = entries.filter(e => e.reply).length;
      const activityScore = calcActivityScore(replyCount);
      const entriesJson   = JSON.stringify(entries);
      const replyLinks    = JSON.stringify(entries.map(e => e.reply));

      await db
        .insert(redditActivity)
        .values({
          employeeId,
          month,
          year,
          weekNumber,
          isActive:       true,
          redditPostLink: entriesJson,
          replyLink:      replyLinks,
          replyCount,
          activityScore,
        })
        .onConflictDoUpdate({
          target: [
            redditActivity.employeeId,
            redditActivity.month,
            redditActivity.year,
            redditActivity.weekNumber,
          ],
          set: {
            isActive:       true,
            redditPostLink: entriesJson,
            replyLink:      replyLinks,
            replyCount,
            activityScore,
          },
        });
      inserted++;
    }
  }

  return NextResponse.json({
    inserted,
    skipped: errors.length,
    total:   rawRows.length - 1,
    errors,
    months:  importedMonths,
  });
}
