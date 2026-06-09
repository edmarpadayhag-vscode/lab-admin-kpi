"use client";

import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Printer, RefreshCw } from "lucide-react";
import { getStoredMonth, getStoredYear } from "@/lib/kpi-period";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Employee = {
  id: number;
  name: string;
  isActive: boolean;
};

type KpiRow = {
  label: string;
  weight: number;
  actualPerformance: number | null;
  displayType: "percent" | "score";
  rating: number;
  weightedPerformance: number;
};

type KpiReport = {
  employeeId: number;
  month: number;
  year: number;
  kpis: KpiRow[];
  overallScore: number;
  remarks: string;
  meta: {
    totalWorkDays: number;
    presentDays: number;
    absences: number;
    lateUndertimeCount: number;
    lateUndertimeMinutes: number;
    totalTasks: number;
    completedTasks: number;
    totalFacility: number;
    compliantCount: number;
    esatCount: number;
    redditWeeks: number;
  };
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const CURRENT_YEAR  = new Date().getFullYear();
const YEAR_OPTIONS  = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const MONTH_OPTIONS = MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }));

/** Color classes for each 1–5 rating. */
function ratingStyle(rating: number): string {
  if (rating === 5) return "bg-green-100 text-green-800 border-green-300";
  if (rating === 4) return "bg-blue-100  text-blue-800  border-blue-300";
  if (rating === 3) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  if (rating === 2) return "bg-orange-100 text-orange-800 border-orange-300";
  if (rating === 1) return "bg-red-100   text-red-800   border-red-300";
  return "bg-muted text-muted-foreground border-border";
}

function ratingLabel(rating: number): string {
  if (rating === 5) return "5 — Outstanding";
  if (rating === 4) return "4 — Far Exceeds";
  if (rating === 3) return "3 — Exceeds";
  if (rating === 2) return "2 — Meets";
  if (rating === 1) return "1 — Needs Improv.";
  return "N/A";
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(1)}%`;
}

type Opportunity = { text: string; level: "high" | "medium" | "low" };

function generateOpportunities(report: KpiReport): Opportunity[] {
  const items: Opportunity[] = [];

  for (const kpi of report.kpis) {
    const { label, actualPerformance: pct, rating, displayType } = kpi;
    const effectiveRating = displayType === "score" ? rating : Math.round(rating);
    if (effectiveRating >= 5) continue; // already at max — no opportunity

    const level: Opportunity["level"] =
      effectiveRating <= 2 ? "high" : effectiveRating <= 3 ? "medium" : "low";

    const fmt = (n: number) => n.toFixed(1);

    if (label === "Facility & Orderliness") {
      if (pct === null) {
        items.push({ text: "Facility & Orderliness: No data recorded for this period. Ensure daily facility checks are submitted.", level: "high" });
      } else {
        const gap = (100 - pct).toFixed(1);
        items.push({ text: `Facility & Orderliness (${fmt(pct)}%): ${gap}% of expected facility checks were missed. Aim for ≥ 95% daily submission compliance.`, level });
      }
    } else if (label === "Timeliness of Response") {
      if (pct === null) {
        items.push({ text: "Timeliness of Response: No completed tasks found. Ensure tasks are marked completed with accurate completion dates.", level: "high" });
      } else {
        items.push({ text: `Timeliness of Response (${fmt(pct)}%): ${report.meta.completedTasks} out of ${report.meta.totalTasks} tasks were completed. Work on submitting deliverables on or before the due date.`, level });
      }
    } else if (label === "Task Completion") {
      if (pct === null) {
        items.push({ text: "Task Completion: No tasks were found for this period. Verify tasks are properly assigned and tracked.", level: "high" });
      } else {
        const remaining = report.meta.totalTasks - report.meta.completedTasks;
        items.push({ text: `Task Completion (${fmt(pct)}%): ${remaining} task${remaining !== 1 ? "s" : ""} remain${remaining === 1 ? "s" : ""} incomplete. Prioritize closing out open items before month-end.`, level });
      }
    } else if (label === "Attendance") {
      if (pct === null) {
        items.push({ text: "Attendance: No attendance records found. Ensure attendance logs are being submitted for this period.", level: "high" });
      } else {
        const { absences, lateUndertimeCount, lateUndertimeMinutes, totalWorkDays } = report.meta;
        const parts: string[] = [];
        if (absences > 0)
          parts.push(`${absences} absence${absences !== 1 ? "s" : ""}`);
        if (lateUndertimeCount > 0)
          parts.push(`${lateUndertimeCount} late/undertime instance${lateUndertimeCount !== 1 ? "s" : ""} (${lateUndertimeMinutes} min total)`);
        const detail = parts.length > 0 ? parts.join(" and ") : "no absences or late/undertime";
        items.push({ text: `Attendance (${fmt(pct)}%): ${detail} out of ${totalWorkDays} work days. Consistent attendance directly impacts team productivity.`, level });
      }
    } else if (label === "Agents ESAT (Staff)") {
      if (pct === null) {
        items.push({ text: "Agents ESAT (Staff): No ESAT submissions found. Encourage clients to submit feedback after each interaction.", level: "high" });
      } else {
        items.push({ text: `Agents ESAT – Staff (${rating.toFixed(2)}/5): Staff satisfaction rating is below target. Focus on responsiveness, accuracy, and communication quality.`, level });
      }
    } else if (label === "Agents ESAT (Products)") {
      if (pct === null) {
        items.push({ text: "Agents ESAT (Products): No product feedback recorded. Ensure product working status is captured in ESAT submissions.", level: "high" });
      } else {
        items.push({ text: `Agents ESAT – Products (${rating.toFixed(2)}/5): Product reliability issues were reported. Coordinate with the team to resolve recurring product concerns and improve uptime.`, level });
      }
    } else if (label === "Client ESAT") {
      if (pct === null) {
        items.push({ text: "Client ESAT: No client feedback found for this period. Proactively request client satisfaction ratings after project milestones.", level: "high" });
      } else {
        items.push({ text: `Client ESAT (${rating.toFixed(2)}/5): Client satisfaction is below target. Review client feedback themes and develop an action plan to address recurring concerns.`, level });
      }
    } else if (label === "Reddit Responses") {
      if (pct === null) {
        items.push({ text: "Reddit Responses: No activity logged. Participate in at least 3 Reddit reply threads per active week to achieve full score.", level: "high" });
      } else {
        items.push({ text: `Reddit Responses (${rating.toFixed(2)}/5): Community engagement is below maximum. Aim for ≥ 3 quality replies per active week to reach a rating of 5.`, level });
      }
    }
  }

  return items;
}

function fmtWeight(w: number): string {
  return `${(w * 100).toFixed(0)}%`;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [month, setMonth]           = useState<string>(getStoredMonth);
  const [year,  setYear]            = useState<string>(getStoredYear);

  const [report,  setReport]  = useState<KpiReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Load employee list on mount
  useEffect(() => {
    fetch("/api/employees")
      .then(r => r.json())
      .then((data: Employee[]) => {
        const active = data.filter(e => e.isActive);
        setEmployees(active);
        if (active.length > 0) setEmployeeId(String(active[0].id));
      })
      .catch(() => setError("Failed to load employees."));
  }, []);

  async function generateReport() {
    if (!employeeId || !month || !year) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(
        `/api/kpi-report?employeeId=${employeeId}&month=${month}&year=${year}`
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Server error");
      }
      setReport(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  // Derive selected employee name for the header
  const selectedEmployee = employees.find(e => String(e.id) === employeeId);

  return (
    <div className="flex flex-col gap-6 p-6 print:p-4 min-h-screen">
      {/* Page header */}
      <div className="flex items-center gap-3 print:hidden">
        <SidebarTrigger />
        <h1 className="text-2xl font-bold">KPI Reports</h1>
      </div>

      {/* Controls */}
      <Card className="print:hidden">
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Employee */}
            <div className="flex flex-col gap-1.5">
              <Label>Employee</Label>
              <Select value={employeeId} onValueChange={(v) => v !== null && setEmployeeId(v)}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Select employee…">
                    {(v: string | null) => {
                      if (!v) return null;
                      const emp = employees.find(e => String(e.id) === v);
                      return emp?.name ?? v;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month */}
            <div className="flex flex-col gap-1.5">
              <Label>Month</Label>
              <Select value={month} onValueChange={(v) => v !== null && setMonth(v)}>
                <SelectTrigger className="w-40">
                  <SelectValue>{(v) => MONTH_NAMES[Number(v) - 1] ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map(m => (
                    <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year */}
            <div className="flex flex-col gap-1.5">
              <Label>Year</Label>
              <Select value={year} onValueChange={(v) => v !== null && setYear(v)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_OPTIONS.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Generate */}
            <Button onClick={generateReport} disabled={loading || !employeeId} className="gap-2">
              {loading
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating…</>
                : <><BarChart3 className="h-4 w-4" /> Generate Report</>}
            </Button>

            {/* Print — only shown when report exists */}
            {report && (
              <Button variant="outline" onClick={() => window.print()} className="gap-2">
                <Printer className="h-4 w-4" /> Print / Export
              </Button>
            )}
          </div>

          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      )}

      {/* Report */}
      {!loading && report && (
        <div className="flex flex-col gap-4">
          {/* Report title (visible on screen + print) */}
          <div className="text-center print:mt-2">
            <h2 className="text-xl font-bold uppercase tracking-wide">
              KPI Performance Scorecard
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {selectedEmployee?.name ?? "Employee"} &mdash;{" "}
              {MONTH_NAMES[report.month - 1]} {report.year}
            </p>
          </div>

          {/* Scorecard table */}
          <div className="overflow-x-auto rounded-lg border print:border-gray-400">
            <table className="w-full text-sm border-collapse">
              {/* ── thead ── */}
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-4 py-3 text-left font-bold w-72 border-r border-slate-600">
                    INITIATIVES<br />
                    <span className="text-xs font-normal opacity-80">(Key Performance Indicators)</span>
                  </th>
                  <th className="px-4 py-3 text-center font-bold w-24 border-r border-slate-600">
                    PERF WEIGHT<br />
                    <span className="text-xs font-normal opacity-80">(100% Total)</span>
                  </th>
                  <th className="px-4 py-3 text-center font-bold w-36 border-r border-slate-600">
                    ACTUAL<br />
                    <span className="text-xs font-normal opacity-80">PERFORMANCE</span>
                  </th>
                  <th className="px-4 py-3 text-center font-bold w-40 border-r border-slate-600">
                    RATING<br />
                    <span className="text-xs font-normal opacity-80">(5-point scale)</span>
                  </th>
                  <th className="px-4 py-3 text-center font-bold w-44">
                    ACTUAL WEIGHTED<br />
                    <span className="text-xs font-normal opacity-80">PERFORMANCE</span>
                  </th>
                </tr>
              </thead>

              {/* ── tbody ── */}
              <tbody>
                {report.kpis.map((kpi, idx) => (
                  <tr
                    key={idx}
                    className={`border-b ${idx % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50/40 transition-colors`}
                  >
                    {/* KPI label */}
                    <td className="px-4 py-3 font-medium border-r border-slate-200">
                      {kpi.label}
                    </td>

                    {/* Weight */}
                    <td className="px-4 py-3 text-center border-r border-slate-200 font-semibold">
                      {fmtWeight(kpi.weight)}
                    </td>

                    {/* Actual Performance */}
                    <td className="px-4 py-3 text-center border-r border-slate-200">
                      {kpi.actualPerformance === null ? (
                        <span className="text-muted-foreground text-xs">No data</span>
                      ) : kpi.displayType === "score" ? (
                        <span className="font-semibold">{kpi.actualPerformance.toFixed(2)} / 5</span>
                      ) : (
                        <span className="font-semibold">{fmtPct(kpi.actualPerformance)}</span>
                      )}
                    </td>

                    {/* Rating */}
                    <td className="px-4 py-3 text-center border-r border-slate-200">
                      {kpi.rating === 0 && kpi.actualPerformance === null ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : kpi.displayType === "score" ? (
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${ratingStyle(Math.round(kpi.rating))}`}>
                          {kpi.rating.toFixed(2)} — {ratingLabel(Math.round(kpi.rating)).split(" — ")[1]}
                        </span>
                      ) : (
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${ratingStyle(Math.round(kpi.rating))}`}
                        >
                          {ratingLabel(Math.round(kpi.rating))}
                        </span>
                      )}
                    </td>

                    {/* Weighted Performance */}
                    <td className="px-4 py-3 text-center">
                      <span className="font-semibold">
                        {kpi.weightedPerformance === 0
                          ? "—"
                          : kpi.weightedPerformance.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}

                {/* ── Overall Score row ── */}
                <tr className="bg-slate-800 text-white font-bold border-t-2 border-slate-600">
                  <td className="px-4 py-3 border-r border-slate-600">
                    Overall Score
                  </td>
                  <td className="px-4 py-3 text-center border-r border-slate-600">
                    100%
                  </td>
                  <td className="px-4 py-3 text-center border-r border-slate-600" />
                  <td className="px-4 py-3 text-center border-r border-slate-600" />
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-full border px-3 py-1 text-sm font-bold ${ratingStyle(Math.round(report.overallScore))}`}>
                      {report.overallScore.toFixed(2)} — {ratingLabel(Math.round(report.overallScore)).split(" — ")[1]}
                    </span>
                  </td>
                </tr>

                {/* ── Remarks row ── */}
                <tr className="bg-slate-100 border-t border-slate-300">
                  <td
                    colSpan={5}
                    className="px-4 py-3 text-center font-semibold text-slate-700 italic"
                  >
                    Remarks: {report.remarks}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Opportunities summary */}
          {(() => {
            const opps = generateOpportunities(report);
            return (
              <div className="rounded-lg border bg-card p-5">
                <h3 className="font-semibold text-sm mb-3">
                  Key Opportunities for {selectedEmployee?.name ?? "Employee"}
                </h3>
                {opps.length === 0 ? (
                  <p className="text-sm text-green-700 font-medium">
                    ✓ Outstanding performance across all KPI categories. Keep up the excellent work!
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {opps.map((opp, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className={`mt-0.5 shrink-0 h-2 w-2 rounded-full ${
                          opp.level === "high"   ? "bg-red-500" :
                          opp.level === "medium" ? "bg-orange-400" :
                                                   "bg-yellow-400"
                        }`} />
                        <span className={
                          opp.level === "high"   ? "text-red-700" :
                          opp.level === "medium" ? "text-orange-700" :
                                                   "text-yellow-700"
                        }>
                          {opp.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  🔴 Needs significant attention &nbsp;·&nbsp;
                  🟠 Needs improvement &nbsp;·&nbsp;
                  🟡 Good, room to grow
                </p>
              </div>
            );
          })()}

          {/* Rating legend */}
          <div className="flex flex-col gap-2 mt-1 print:hidden">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground w-56">Facility / Timeliness / Task Completion:</span>
              {[
                { r: 5, label: "5 (95–100%)" },
                { r: 4, label: "4 (90–94%)" },
                { r: 3, label: "3 (85–89%)" },
                { r: 2, label: "2 (80–84%)" },
                { r: 1, label: "1 (<80%)" },
              ].map(({ r, label }) => (
                <span key={r} className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${ratingStyle(r)}`}>
                  {label}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground w-56">Attendance:</span>
              {[
                { r: 5, label: "5 (100%)" },
                { r: 4, label: "4 (95–99.99%)" },
                { r: 3, label: "3 (90–94.99%)" },
                { r: 2, label: "2 (85–89.99%)" },
                { r: 1, label: "1 (<85%)" },
              ].map(({ r, label }) => (
                <span key={r} className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${ratingStyle(r)}`}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Data breakdown cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-1 print:hidden">
            <MetaCard title="Attendance" value={`${report.meta.presentDays}/${report.meta.totalWorkDays} days`} />
            <MetaCard title="Tasks" value={`${report.meta.completedTasks}/${report.meta.totalTasks} completed`} />
            <MetaCard title="Facility" value={`${report.meta.compliantCount}/${report.meta.totalFacility} compliant`} />
            <MetaCard title="ESAT Entries" value={`${report.meta.esatCount} submissions`} />
          </div>

          {/* Signature section — for printed sign-off */}
          <div className="mt-12 pt-6 break-inside-avoid print:mt-16">
            <div className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-12">
              {[
                { role: "Employee Name", name: selectedEmployee?.name ?? "" },
                { role: "Prepared By", name: "" },
                { role: "Reviewed By", name: "" },
              ].map(({ role, name }) => (
                <div key={role} className="flex flex-col">
                  {/* signing space */}
                  <div className="h-12" />
                  <div className="border-t border-slate-500 pt-1.5">
                    <p className="text-sm font-semibold">{role}</p>
                    {name && <p className="text-sm">{name}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">Signature over Printed Name</p>
                    <p className="mt-3 text-xs text-muted-foreground">Date: ____________________</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty state — no report generated yet */}
      {!loading && !report && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-3">
          <BarChart3 className="h-12 w-12 opacity-30" />
          <p className="text-lg font-medium">No report generated yet</p>
          <p className="text-sm">Select an employee, month, and year — then click &ldquo;Generate Report&rdquo;.</p>
        </div>
      )}
    </div>
  );
}

// ─── Small card for data breakdown ─────────────────────────────────────────────

function MetaCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{title}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
