import { db } from "@/lib/db";
import {
  attendanceLogs, tasks, esatFeedback, facilityLogs,
  redditActivity, finalizedModules, employees, kpiScores,
} from "@/lib/db/schema";
import { and, eq, gte, lte, ne, count, avg } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = parseInt(searchParams.get("month") ?? "");
  const year  = parseInt(searchParams.get("year")  ?? "");

  if (isNaN(month) || isNaN(year)) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDayN = new Date(year, month, 0).getDate();
  const lastDay  = `${year}-${String(month).padStart(2, "0")}-${String(lastDayN).padStart(2, "0")}`;
  const startTs  = new Date(year, month - 1, 1, 0, 0, 0);
  const endTs    = new Date(year, month, 0, 23, 59, 59, 999);

  // Data counts per module
  const [attRow]    = await db.select({ n: count() }).from(attendanceLogs)
    .where(and(gte(attendanceLogs.workDate, firstDay), lte(attendanceLogs.workDate, lastDay)));

  const [taskRow]   = await db.select({ n: count() }).from(tasks)
    .where(and(gte(tasks.dueDate, firstDay), lte(tasks.dueDate, lastDay)));

  const [esatAgRow] = await db.select({ n: count() }).from(esatFeedback)
    .where(and(eq(esatFeedback.esatType, "agents"), gte(esatFeedback.submittedAt, startTs), lte(esatFeedback.submittedAt, endTs)));

  const [esatClRow] = await db.select({ n: count() }).from(esatFeedback)
    .where(and(eq(esatFeedback.esatType, "client"), gte(esatFeedback.submittedAt, startTs), lte(esatFeedback.submittedAt, endTs)));

  // Facility: exclude no_work markers — only real log entries count as "has data"
  const [facRow]    = await db.select({ n: count() }).from(facilityLogs)
    .where(and(gte(facilityLogs.date, firstDay), lte(facilityLogs.date, lastDay), ne(facilityLogs.source, "no_work")));

  const [redditRow] = await db.select({ n: count() }).from(redditActivity)
    .where(and(eq(redditActivity.month, month), eq(redditActivity.year, year)));

  // Finalization status for the period
  const finalizedRows = await db
    .select({ module: finalizedModules.module })
    .from(finalizedModules)
    .where(and(eq(finalizedModules.month, month), eq(finalizedModules.year, year)));
  const finalizedSet = new Set(finalizedRows.map(r => r.module));

  // General stats
  const [empRow]  = await db.select({ n: count() }).from(employees).where(eq(employees.isActive, true));
  const [kpiRow]  = await db.select({ a: avg(kpiScores.finalScore) }).from(kpiScores)
    .where(and(eq(kpiScores.month, month), eq(kpiScores.year, year)));

  type ModuleStatus = "complete" | "incomplete" | "no_data";
  function status(hasData: boolean, mod: string): ModuleStatus {
    if (finalizedSet.has(mod)) return "complete";
    return hasData ? "incomplete" : "no_data";
  }

  const MODULES = [
    { module: "attendance",  label: "Attendance",             path: "/attendance",  hasData: attRow.n    > 0 },
    { module: "tasks",       label: "Tasks (TOR)",            path: "/tasks",       hasData: taskRow.n   > 0 },
    { module: "esat-agents", label: "Agents ESAT",            path: "/esat/agents", hasData: esatAgRow.n > 0 },
    { module: "esat-client", label: "Client ESAT",            path: "/esat/client", hasData: esatClRow.n > 0 },
    { module: "facility",    label: "Facility & Orderliness", path: "/facility",    hasData: facRow.n    > 0 },
    { module: "reddit",      label: "Reddit Responses",       path: "/reddit",      hasData: redditRow.n > 0 },
  ] as const;

  return NextResponse.json({
    modules: MODULES.map(m => ({ ...m, isFinalized: finalizedSet.has(m.module), status: status(m.hasData, m.module) })),
    stats: {
      activeEmployees: empRow.n,
      avgKpi: kpiRow.a ? Number(kpiRow.a).toFixed(2) : null,
    },
  });
}
