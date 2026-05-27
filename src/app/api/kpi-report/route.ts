import { db } from "@/lib/db";
import { attendanceLogs, tasks, facilityLogs, esatFeedback, redditActivity } from "@/lib/db/schema";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { isNonWorkSchedule } from "@/lib/attendance-utils";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isBlankTime(t: string | null | undefined): boolean {
  return !t || t.trim() === "" || /^0+[:0]*$/.test(t.trim());
}

/** Get ISO week number (1–53) for a Date. */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Return all ISO week numbers that have at least one day in the given month. */
function getISOWeeksInMonth(year: number, month: number): number[] {
  const weeks = new Set<number>();
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    weeks.add(getISOWeek(new Date(year, month - 1, d)));
  }
  return Array.from(weeks);
}

/**
 * Convert an actual-performance percentage (0–100) to a 5-point rating.
 * null → 0 (no data)
 */
function toRating(pct: number | null): number {
  if (pct === null) return 0;
  if (pct >= 100) return 5;
  if (pct >= 90) return 4;
  if (pct >= 80) return 3;
  if (pct >= 70) return 2;
  return 1;
}

/** Map an overall weighted score to a remarks label. */
function toRemarks(score: number): string {
  if (score >= 4.5) return "Outstanding";
  if (score >= 4.0) return "Far Exceeds Expectations";
  if (score >= 3.0) return "Exceeds Expectations";
  if (score >= 2.0) return "Meets Expectations";
  if (score >= 1.0) return "Needs Improvement";
  return "Unsatisfactory";
}

// ─── GET /api/kpi-report?employeeId=X&month=Y&year=Z ──────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = parseInt(searchParams.get("employeeId") ?? "");
  const month      = parseInt(searchParams.get("month") ?? "");
  const year       = parseInt(searchParams.get("year") ?? "");

  if (isNaN(employeeId) || isNaN(month) || isNaN(year)) {
    return NextResponse.json({ error: "Missing or invalid parameters" }, { status: 400 });
  }

  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDayNum = new Date(year, month, 0).getDate();
  const lastDay  = `${year}-${String(month).padStart(2, "0")}-${String(lastDayNum).padStart(2, "0")}`;
  const startTs  = new Date(year, month - 1, 1, 0, 0, 0);
  const endTs    = new Date(year, month, 0, 23, 59, 59, 999);

  // ── 1. Attendance ────────────────────────────────────────────────────────────
  const attLogs = await db
    .select({
      schedule:      attendanceLogs.schedule,
      actualTimeIn:  attendanceLogs.actualTimeIn,
      actualTimeOut: attendanceLogs.actualTimeOut,
    })
    .from(attendanceLogs)
    .where(and(
      eq(attendanceLogs.employeeId, employeeId),
      gte(attendanceLogs.workDate, firstDay),
      lte(attendanceLogs.workDate, lastDay),
    ));

  let totalWorkDays = 0;
  let presentDays   = 0;
  for (const log of attLogs) {
    if (isNonWorkSchedule(log.schedule)) continue;
    totalWorkDays++;
    const absent = isBlankTime(log.actualTimeIn) && isBlankTime(log.actualTimeOut);
    if (!absent) presentDays++;
  }
  const attendancePct: number | null = totalWorkDays > 0
    ? (presentDays / totalWorkDays) * 100
    : null;

  // ── 2. Facility (shared — same score for all employees in the month) ─────────
  // Matches the exact formula used on the Facility & Orderliness tab:
  //   rate = (weekdays with a log entry) / (weekdays − no-work days) × 100
  const facLogs = await db
    .select({ date: facilityLogs.date, source: facilityLogs.source })
    .from(facilityLogs)
    .where(and(
      gte(facilityLogs.date, firstDay),
      lte(facilityLogs.date, lastDay),
    ));

  // Separate no-work markers from real log entries
  const noWorkDates = new Set<string>();
  const logDates    = new Set<string>();
  for (const row of facLogs) {
    if (row.source === "no_work") {
      noWorkDates.add(row.date);
    } else {
      logDates.add(row.date);
    }
  }

  // Count weekdays, excluding no-work tagged days
  const daysInMonth = new Date(year, month, 0).getDate();
  let countableWeekdays = 0;
  let daysWithEntry     = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month - 1, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    if (isWeekend || noWorkDates.has(dateStr)) continue;
    countableWeekdays++;
    if (logDates.has(dateStr)) daysWithEntry++;
  }

  const facilityPct: number | null = countableWeekdays > 0
    ? (daysWithEntry / countableWeekdays) * 100
    : null;

  // ── 3. Tasks ─────────────────────────────────────────────────────────────────
  const taskList = await db
    .select({
      status:        tasks.status,
      dueDate:       tasks.dueDate,
      completedDate: tasks.completedDate,
    })
    .from(tasks)
    .where(and(
      eq(tasks.assignedTo, employeeId),
      gte(tasks.dueDate, firstDay),
      lte(tasks.dueDate, lastDay),
    ));

  const totalTasks     = taskList.length;
  const completedTasks = taskList.filter(t => t.status === "completed").length;
  const taskCompletionPct: number | null = totalTasks > 0
    ? (completedTasks / totalTasks) * 100
    : null;

  const onTimeTasks = taskList.filter(t =>
    t.status === "completed" &&
    t.completedDate !== null &&
    t.dueDate !== null &&
    t.completedDate <= t.dueDate
  ).length;
  const timelinessPct: number | null = completedTasks > 0
    ? (onTimeTasks / completedTasks) * 100
    : null;

  // ── 4. ESAT ──────────────────────────────────────────────────────────────────
  const esatLogs = await db
    .select({
      score:          esatFeedback.score,
      productWorking: esatFeedback.productWorking,
      equivalentScore: esatFeedback.equivalentScore,
    })
    .from(esatFeedback)
    .where(and(
      eq(esatFeedback.staffId, employeeId),
      gte(esatFeedback.submittedAt, startTs),
      lte(esatFeedback.submittedAt, endTs),
    ));

  // Staff ESAT: avg score / 5 × 100
  const esatStaffPct: number | null = esatLogs.length > 0
    ? (esatLogs.reduce((s, e) => s + e.score, 0) / esatLogs.length / 5) * 100
    : null;

  // Products ESAT: % of submissions where productWorking = true
  const esatProductsPct: number | null = esatLogs.length > 0
    ? (esatLogs.filter(e => e.productWorking).length / esatLogs.length) * 100
    : null;

  // PM ESAT: avg equivalentScore — stored as 0-100
  const validEq = esatLogs.filter(e => e.equivalentScore !== null);
  const esatPmPct: number | null = validEq.length > 0
    ? validEq.reduce((s, e) => s + (e.equivalentScore ?? 0), 0) / validEq.length
    : null;

  // ── 5. Reddit ────────────────────────────────────────────────────────────────
  const weekNums = getISOWeeksInMonth(year, month);
  const redditLogs = await db
    .select({ activityScore: redditActivity.activityScore, weekNumber: redditActivity.weekNumber })
    .from(redditActivity)
    .where(and(
      eq(redditActivity.employeeId, employeeId),
      eq(redditActivity.year, year),
      inArray(redditActivity.weekNumber, weekNums),
    ));

  const redditPct: number | null = redditLogs.length > 0
    ? (redditLogs.reduce((s, r) => s + r.activityScore, 0) / redditLogs.length / 5) * 100
    : null;

  // ── Build KPI rows ───────────────────────────────────────────────────────────
  const KPI_DEFS: { label: string; weight: number; pct: number | null }[] = [
    { label: "Facility & Orderliness",   weight: 0.10, pct: facilityPct       },
    { label: "Timeliness of Response",   weight: 0.10, pct: timelinessPct     },
    { label: "Task Completion",          weight: 0.10, pct: taskCompletionPct },
    { label: "Attendance",               weight: 0.20, pct: attendancePct     },
    { label: "Agents ESAT (Staff)",       weight: 0.15, pct: esatStaffPct      },
    { label: "Agents ESAT (Products)",   weight: 0.15, pct: esatProductsPct   },
    { label: "Client ESAT",              weight: 0.15, pct: esatPmPct         },
    { label: "Reddit Responses",         weight: 0.05, pct: redditPct         },
  ];

  const kpis = KPI_DEFS.map(def => {
    const rating = toRating(def.pct);
    return {
      label:               def.label,
      weight:              def.weight,
      actualPerformance:   def.pct,
      rating,
      weightedPerformance: rating * def.weight,
    };
  });

  const overallScore = kpis.reduce((s, k) => s + k.weightedPerformance, 0);

  return NextResponse.json({
    employeeId,
    month,
    year,
    kpis,
    overallScore,
    remarks: toRemarks(overallScore),
    meta: {
      totalWorkDays,
      presentDays,
      totalTasks,
      completedTasks,
      totalFacility: countableWeekdays,
      compliantCount: daysWithEntry,
      esatCount: esatLogs.length,
      redditWeeks: redditLogs.length,
    },
  });
}
