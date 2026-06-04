import { db } from "@/lib/db";
import { tasks, employees } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

// ─── Header aliases ────────────────────────────────────────────────────────────
type RowKey = "title" | "startDate" | "dueDate" | "completedDate" | "requestedBy" | "assignedTo" | "status" | "priority";

const HEADER_ALIASES: [pattern: string, field: RowKey][] = [
  // ── title / task ──────────────────────────────────────────────────────────
  ["task",             "title"],
  ["tasks",            "title"],
  ["title",            "title"],
  ["task title",       "title"],
  ["description",      "title"],
  // ── start date ────────────────────────────────────────────────────────────
  ["date started",     "startDate"],
  ["start date",       "startDate"],
  ["start_date",       "startDate"],
  ["started",          "startDate"],
  // ── due date ──────────────────────────────────────────────────────────────
  ["due date",         "dueDate"],
  ["due_date",         "dueDate"],
  ["deadline",         "dueDate"],
  // ── completed date ────────────────────────────────────────────────────────
  ["date completed",   "completedDate"],
  ["completed date",   "completedDate"],
  ["completion date",  "completedDate"],
  ["completed_date",   "completedDate"],
  ["date_completed",   "completedDate"],
  // ── requested by ─────────────────────────────────────────────────────────
  ["requested by",     "requestedBy"],
  ["requested_by",     "requestedBy"],
  ["requestor",        "requestedBy"],
  ["requester",        "requestedBy"],
  // ── assigned to / requested to ────────────────────────────────────────────
  ["requested to",     "assignedTo"],
  ["requested_to",     "assignedTo"],
  ["assigned to",      "assignedTo"],
  ["assigned_to",      "assignedTo"],
  ["assignee",         "assignedTo"],
  ["lab admin",        "assignedTo"],
  // ── status ────────────────────────────────────────────────────────────────
  ["status",           "status"],
  // ── priority ──────────────────────────────────────────────────────────────
  ["priority",         "priority"],
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
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    return excelSerialToDate(value).toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseStatus(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (["pending", "in_progress", "completed", "overdue"].includes(s)) return s;
  if (s === "in progress") return "in_progress";
  return "pending";
}

function parsePriority(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase();
  if (["low", "medium", "high"].includes(s)) return s;
  return "medium";
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
    return NextResponse.json(
      { error: "No data rows found (need a header row + at least one data row)" },
      { status: 400 }
    );
  }

  const headerRow = (rawRows[0] as unknown[]).map((c) => String(c ?? ""));
  const colMap = normalizeHeaders(headerRow);

  // Require at minimum: title + dueDate
  const hasTitle = Array.from(colMap.values()).includes("title");
  const hasDue = Array.from(colMap.values()).includes("dueDate");
  if (!hasTitle || !hasDue) {
    return NextResponse.json({
      error: "Missing required columns. Need at least: Task/Title and Due Date.",
    }, { status: 400 });
  }

  // Load employees for name → id lookup
  const allEmployees = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees);
  const byName = new Map(allEmployees.map((e) => [e.name.trim().toLowerCase(), e.id]));

  const toInsert: typeof tasks.$inferInsert[] = [];
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

    // Title (required)
    const title = String(get("title") ?? "").trim();
    if (!title) {
      errors.push({ row: rowNum, message: "Missing task title" });
      return;
    }

    // Due date (required)
    const rawDue = get("dueDate");
    const dueDate = parseDate(rawDue);
    if (!dueDate) {
      errors.push({ row: rowNum, message: `Invalid or missing due date: "${String(rawDue)}"` });
      return;
    }

    // Start date (optional — fall back to due date)
    const rawStart = get("startDate");
    const startDate = parseDate(rawStart) ?? dueDate;

    // Completed date (optional)
    const completedDate = parseDate(get("completedDate")) ?? null;

    // Requested By (optional)
    const requestedBy = String(get("requestedBy") ?? "").trim() || null;

    // Assigned To / Requested To — employee lookup (optional)
    const rawAssignee = String(get("assignedTo") ?? "").trim();
    let assignedTo: number | null = null;
    if (rawAssignee) {
      assignedTo = byName.get(rawAssignee.toLowerCase()) ?? null;
      if (!assignedTo) {
        errors.push({ row: rowNum, message: `Unknown employee: "${rawAssignee}"` });
        return;
      }
    }

    // If no assignee column at all, skip employee requirement
    if (!assignedTo && Array.from(colMap.values()).includes("assignedTo")) {
      errors.push({ row: rowNum, message: "Missing Requested To / Assigned To" });
      return;
    }

    // If still no assignedTo (column not in file), use first active employee as placeholder?
    // Better: require it only if the column exists.
    if (!assignedTo) {
      errors.push({ row: rowNum, message: "No 'Requested To' column found or employee not matched" });
      return;
    }

    const status = parseStatus(get("status"));
    const priority = parsePriority(get("priority"));

    toInsert.push({
      title,
      requestedBy,
      assignedTo,
      startDate,
      dueDate,
      completedDate,
      status: status as "pending" | "in_progress" | "completed" | "overdue",
      priority: priority as "low" | "medium" | "high",
    });
  });

  let inserted = 0;
  if (toInsert.length > 0) {
    const result = await db.insert(tasks).values(toInsert).returning({ id: tasks.id });
    inserted = result.length;
  }

  return NextResponse.json({
    inserted,
    skipped: errors.length,
    total: rawRows.length - 1,
    errors,
  });
}
