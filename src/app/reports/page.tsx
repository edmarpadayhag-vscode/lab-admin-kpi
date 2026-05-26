"use client";

import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Printer, RefreshCw } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Employee = {
  id: number;
  name: string;
  isActive: boolean;
};

type KpiRow = {
  label: string;
  weight: number;           // 0.10, 0.20, etc.
  actualPerformance: number | null; // 0–100 or null
  rating: number;           // 0–5
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

function fmtWeight(w: number): string {
  return `${(w * 100).toFixed(0)}%`;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [month, setMonth]           = useState<string>(String(new Date().getMonth() + 1));
  const [year,  setYear]            = useState<string>(String(CURRENT_YEAR));

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
                  <SelectValue />
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
                      ) : (
                        <span className="font-semibold">{fmtPct(kpi.actualPerformance)}</span>
                      )}
                    </td>

                    {/* Rating */}
                    <td className="px-4 py-3 text-center border-r border-slate-200">
                      {kpi.rating === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${ratingStyle(kpi.rating)}`}
                        >
                          {ratingLabel(kpi.rating)}
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
                  <td className="px-4 py-3 text-center text-lg">
                    {report.overallScore.toFixed(2)}
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

          {/* Rating legend */}
          <div className="flex flex-wrap gap-2 mt-1 print:hidden">
            <span className="text-xs text-muted-foreground mr-1 self-center">Rating scale:</span>
            {[
              { r: 5, label: "5 — Outstanding (100%)" },
              { r: 4, label: "4 — Far Exceeds (90–99%)" },
              { r: 3, label: "3 — Exceeds (80–89%)" },
              { r: 2, label: "2 — Meets (70–79%)" },
              { r: 1, label: "1 — Needs Improv. (<70%)" },
            ].map(({ r, label }) => (
              <span
                key={r}
                className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${ratingStyle(r)}`}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Data breakdown cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-1 print:hidden">
            <MetaCard title="Attendance" value={`${report.meta.presentDays}/${report.meta.totalWorkDays} days`} />
            <MetaCard title="Tasks" value={`${report.meta.completedTasks}/${report.meta.totalTasks} completed`} />
            <MetaCard title="Facility" value={`${report.meta.compliantCount}/${report.meta.totalFacility} compliant`} />
            <MetaCard title="ESAT Entries" value={`${report.meta.esatCount} submissions`} />
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
