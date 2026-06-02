import { db } from "@/lib/db";
import { attendanceLogs, employees, tasks, facilityLogs, esatFeedback, redditActivity } from "@/lib/db/schema";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { isNonWorkSchedule, calcUndertimeMinutes } from "@/lib/attendance-utils";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function calcRedditScore(replyCount: number): number {
  if (replyCount >= 3) return 5;
  if (replyCount === 2) return 3;
  if (replyCount === 1) return 2;
  return 1;
}

function isBlankTime(t: string | null | undefined): boolean {
  return !t || t.trim() === "" || /^0+[:0]*$/.test(t.trim());
}

function toMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function minutesDiff(from: string | null | undefined, to: string | null | undefined): number | null {
  const f = toMin(from), t = toMin(to);
  if (f === null || t === null) return null;
  const diff = t - f;
  return diff < 0 ? diff + 1440 : diff;
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

/** Facility, Timeliness, Task Completion scale:
 *  5 = 95–100%  |  4 = 90–94%  |  3 = 85–89%  |  2 = 80–84%  |  1 = <80%
 */
function toRatingStandard(pct: number | null): number {
  if (pct === null) return 0;
  if (pct >= 95) return 5;
  if (pct >= 90) return 4;
  if (pct >= 85) return 3;
  if (pct >= 80) return 2;
  return 1;
}

/** Attendance scale:
 *  5 = 100%  |  4 = 95–99.99%  |  3 = 90–94.99%  |  2 = 85–89.99%  |  1 = <85%
 */
function toRatingAttendance(pct: number | null): number {
  if (pct === null) return 0;
  if (pct >= 100) return 5;
  if (pct >= 95)  return 4;
  if (pct >= 90)  return 3;
  if (pct >= 85)  return 2;
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

  // ── 1. Attendance ─────────────────────────────────────────────────────────────
  // Mirrors the exact formula used by the Attendance tab's overallPct widget:
  //   score = (totalWorkMin − absenceMin − lateUndertimeMin) / totalWorkMin × 100
  const [empForAtt] = await db
    .select({ restDay1: employees.restDay1, restDay2: employees.restDay2 })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  const attLogs = await db
    .select({
      schedule:        attendanceLogs.schedule,
      workDate:        attendanceLogs.workDate,
      expectedTimeIn:  attendanceLogs.expectedTimeIn,
      expectedTimeOut: attendanceLogs.expectedTimeOut,
      actualTimeIn:    attendanceLogs.actualTimeIn,
      actualTimeOut:   attendanceLogs.actualTimeOut,
      lateMinutes:     attendanceLogs.lateMinutes,
    })
    .from(attendanceLogs)
    .where(and(
      eq(attendanceLogs.employeeId, employeeId),
      gte(attendanceLogs.workDate, firstDay),
      lte(attendanceLogs.workDate, lastDay),
    ));

  let totalWorkDays         = 0;
  let totalWorkMin          = 0;
  let totalAbsences         = 0;
  let lateUndertimeCount    = 0;
  let totalLateUndertimeMin = 0;

  for (const log of attLogs) {
    const [y, mo, d] = log.workDate.split("-").map(Number);
    const dow = new Date(y, mo - 1, d).getDay();
    const isRestDay =
      !isNonWorkSchedule(log.schedule) &&
      ((empForAtt?.restDay1 != null && dow === empForAtt.restDay1) ||
       (empForAtt?.restDay2 != null && dow === empForAtt.restDay2));

    const isFullyNonWork =
      log.schedule === "PTO" || log.schedule === "OFF" ||
      log.schedule === "Holiday Off" || isRestDay;
    if (isFullyNonWork) continue;

    // SL: counts as a work day with no deduction (excused absence)
    if (log.schedule === "SL") {
      totalWorkDays++;
      totalWorkMin += 9 * 60;
      continue;
    }

    totalWorkDays++;

    if (log.schedule === "1stHalf Absent") {
      totalWorkMin += 9 * 60;
      const ut = minutesDiff(log.expectedTimeIn, log.actualTimeIn) ?? 0;
      if (ut > 0) { lateUndertimeCount++; totalLateUndertimeMin += ut; }
      continue;
    }
    if (log.schedule === "2ndHalf Absent") {
      totalWorkMin += 9 * 60;
      const ut = minutesDiff(log.actualTimeOut, log.expectedTimeOut) ?? 0;
      if (ut > 0) { lateUndertimeCount++; totalLateUndertimeMin += ut; }
      continue;
    }
    if (log.schedule === "Half Day PTO") {
      const outMin = toMin(log.actualTimeOut);
      const inMin  = toMin(log.actualTimeIn) ?? toMin(log.expectedTimeIn);
      totalWorkMin += (outMin !== null && inMin !== null) ? Math.max(0, outMin - inMin) : 0;
      continue;
    }

    // Regular work day
    totalWorkMin += 9 * 60;
    if (isBlankTime(log.actualTimeIn) && isBlankTime(log.actualTimeOut)) {
      totalAbsences++;
      continue;
    }
    const late = log.lateMinutes ?? 0;
    const ut   = calcUndertimeMinutes(log.expectedTimeOut, log.actualTimeOut);
    if (late > 0 || ut > 0) { lateUndertimeCount++; totalLateUndertimeMin += late + ut; }
  }

  const totalAbsenceMin = totalAbsences * 9 * 60;
  const presentDays     = totalWorkDays - totalAbsences;
  const attendancePct: number | null = totalWorkMin > 0
    ? Math.max(0, ((totalWorkMin - totalAbsenceMin - totalLateUndertimeMin) / totalWorkMin) * 100)
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

  // ── 3. Tasks — same formula as the Tasks tab widgets (TOR and TC) ────────────
  // Filters: dueDate in the selected month, assigned to this employee.
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

  // TC  = totalCompleted / totalTasks × 100  (matches Tasks tab)
  const totalTasks     = taskList.length;
  const totalCompleted = taskList.filter(t => t.status === "completed").length;
  const taskCompletionPct: number | null = totalTasks > 0
    ? (totalCompleted / totalTasks) * 100
    : null;

  // TOR = completedOnTime / totalCompleted × 100  (matches Tasks tab)
  const completedOnTime = taskList.filter(t =>
    t.status === "completed" &&
    t.completedDate != null &&
    t.completedDate <= t.dueDate
  ).length;
  const timelinessPct: number | null = totalCompleted > 0
    ? (completedOnTime / totalCompleted) * 100
    : null;

  // ── 4. ESAT ──────────────────────────────────────────────────────────────────
  const esatLogs = await db
    .select({
      score:          esatFeedback.score,
      productWorking: esatFeedback.productWorking,
      esatType:       esatFeedback.esatType,
    })
    .from(esatFeedback)
    .where(and(
      eq(esatFeedback.staffId, employeeId),
      gte(esatFeedback.submittedAt, startTs),
      lte(esatFeedback.submittedAt, endTs),
    ));

  const agentsLogs = esatLogs.filter(e => e.esatType === "agents");
  const clientLogs = esatLogs.filter(e => e.esatType === "client");

  // Agents Staff: avg score (1–5 raw)
  const agentsStaffScore: number | null = agentsLogs.length > 0
    ? agentsLogs.reduce((s, e) => s + e.score, 0) / agentsLogs.length
    : null;

  // Agents Products: (% productWorking) × 5 → 0–5 raw
  const agentsProductsScore: number | null = agentsLogs.length > 0
    ? (agentsLogs.filter(e => e.productWorking).length / agentsLogs.length) * 5
    : null;

  // Client ESAT: avg score (1–5 raw)
  const clientEsatScore: number | null = clientLogs.length > 0
    ? clientLogs.reduce((s, e) => s + e.score, 0) / clientLogs.length
    : null;

  // ── 5. Reddit ────────────────────────────────────────────────────────────────
  const redditLogs = await db
    .select({ replyCount: redditActivity.replyCount, isActive: redditActivity.isActive })
    .from(redditActivity)
    .where(and(
      eq(redditActivity.employeeId, employeeId),
      eq(redditActivity.month, month),
      eq(redditActivity.year, year),
    ));

  const activeReddit = redditLogs.filter(r => r.isActive);
  // Recompute from replyCount using the current formula so the score always
  // matches the Reddit tab, regardless of what was stored at import time.
  const redditScore: number | null = activeReddit.length > 0
    ? activeReddit.reduce((s, r) => s + calcRedditScore(r.replyCount), 0) / activeReddit.length
    : null;

  // ── Build KPI rows ───────────────────────────────────────────────────────────
  type KpiDef = {
    label: string;
    weight: number;
    value: number | null;
    displayType: "percent" | "score";
    ratingFn?: (pct: number | null) => number;
  };

  const KPI_DEFS: KpiDef[] = [
    { label: "Facility & Orderliness",  weight: 0.10, value: facilityPct,         displayType: "percent", ratingFn: toRatingStandard  },
    { label: "Timeliness of Response",  weight: 0.10, value: timelinessPct,       displayType: "percent", ratingFn: toRatingStandard  },
    { label: "Task Completion",         weight: 0.10, value: taskCompletionPct,   displayType: "percent", ratingFn: toRatingStandard  },
    { label: "Attendance",              weight: 0.20, value: attendancePct,       displayType: "percent", ratingFn: toRatingAttendance },
    { label: "Agents ESAT (Staff)",     weight: 0.15, value: agentsStaffScore,    displayType: "score"   },
    { label: "Agents ESAT (Products)",  weight: 0.15, value: agentsProductsScore, displayType: "score"   },
    { label: "Client ESAT",             weight: 0.15, value: clientEsatScore,     displayType: "score"   },
    { label: "Reddit Responses",        weight: 0.05, value: redditScore,         displayType: "score"   },
  ];

  const kpis = KPI_DEFS.map(def => {
    const rating = def.displayType === "percent"
      ? (def.ratingFn ?? toRatingStandard)(def.value)
      : (def.value ?? 0);
    return {
      label:               def.label,
      weight:              def.weight,
      actualPerformance:   def.value,
      displayType:         def.displayType,
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
      absences:            totalAbsences,
      lateUndertimeCount,
      lateUndertimeMinutes: totalLateUndertimeMin,
      totalTasks,
      completedTasks: totalCompleted,
      totalFacility: countableWeekdays,
      compliantCount: daysWithEntry,
      esatCount: esatLogs.length,
      redditWeeks: redditLogs.length,
    },
  });
}
