"use client";

import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Users, CheckCircle2, Circle, AlertCircle, ExternalLink, Star } from "lucide-react";
import Link from "next/link";
import { saveKpiPeriod, getStoredMonth, getStoredYear } from "@/lib/kpi-period";

// ─── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

// ─── Types ─────────────────────────────────────────────────────────────────────

type ModuleStatus = "complete" | "incomplete" | "no_data";

type ModuleInfo = {
  module: string;
  label: string;
  path: string;
  hasData: boolean;
  isFinalized: boolean;
  status: ModuleStatus;
};

type EmpScore = { id: number; name: string; storedScore: string | null };

type DashboardData = {
  modules: ModuleInfo[];
  stats: {
    activeEmployees: number;
    employeeScores: EmpScore[];
  };
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [month, setMonth] = useState(() => String(new Date().getMonth() + 1));
  const [year,  setYear]  = useState(() => String(new Date().getFullYear()));
  const [ready,        setReady]       = useState(false);
  const [data,        setData]        = useState<DashboardData | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [liveScores,  setLiveScores]  = useState<Map<number, string | null>>(new Map());
  const [fetchingLive,setFetchingLive]= useState(false);

  // Hydration-safe: read localStorage only after mount, then allow fetching
  useEffect(() => {
    setMonth(getStoredMonth());
    setYear(getStoredYear());
    setReady(true);
  }, []);

  // Persist period changes and re-fetch
  function handleMonthChange(v: string) {
    setMonth(v);
    saveKpiPeriod(v, year);
  }
  function handleYearChange(v: string) {
    setYear(v);
    saveKpiPeriod(month, v);
  }

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setLiveScores(new Map());
    fetch(`/api/dashboard?month=${month}&year=${year}`, { signal: controller.signal })
      .then(r => r.json())
      .then((d: DashboardData) => setData(d))
      .catch(err => { if (err.name !== "AbortError") console.error(err); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [month, year, ready]);

  // Fetch live KPI scores for employees who don't have a stored report yet
  useEffect(() => {
    if (!data) return;
    const needsLive = data.stats.employeeScores.filter(e => e.storedScore === null);
    if (needsLive.length === 0) { setLiveScores(new Map()); return; }
    setFetchingLive(true);
    Promise.all(
      needsLive.map(e =>
        fetch(`/api/kpi-report?employeeId=${e.id}&month=${month}&year=${year}`)
          .then(r => r.json())
          .then((d: { overallScore?: number }) =>
            [e.id, d.overallScore != null ? d.overallScore.toFixed(2) : null] as [number, string | null])
          .catch(() => [e.id, null] as [number, string | null])
      )
    ).then(pairs => { setLiveScores(new Map(pairs)); setFetchingLive(false); });
  }, [data, month, year]);

  const monthLabel = MONTH_NAMES[Number(month) - 1] ?? "";
  const pending    = data?.modules.filter(m => m.status !== "complete") ?? [];
  const complete   = data?.modules.filter(m => m.status === "complete") ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* Header + period selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">KPI Period: {monthLabel} {year}</p>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">KPI Month</Label>
            <Select value={month} onValueChange={v => v !== null && handleMonthChange(v)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((n, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Year</Label>
            <Select value={year} onValueChange={v => v !== null && handleYearChange(v)}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-5 py-4 flex items-center gap-4">
          <Users className="h-8 w-8 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Active Employees</p>
            <p className="text-3xl font-bold">{loading ? "—" : (data?.stats.activeEmployees ?? "—")}</p>
          </div>
        </div>

        <div className="rounded-lg border bg-card px-5 py-4 flex items-start gap-4">
          <Star className="h-8 w-8 text-muted-foreground shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">KPI Score — {monthLabel} {year}</p>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !data?.stats.employeeScores.length ? (
              <p className="text-sm text-muted-foreground">No employees found.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.stats.employeeScores.map(e => {
                  const isFinal = e.storedScore !== null;
                  const score   = isFinal ? e.storedScore : (liveScores.get(e.id) ?? null);
                  const tag     = isFinal ? "(Final)" : fetchingLive ? "…" : "(Incomplete)";
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{e.name}</span>
                      <span className="text-sm shrink-0 text-right">
                        <span className="font-bold tabular-nums">{score ?? "—"}</span>
                        {" "}
                        <span className={`text-xs font-normal ${isFinal ? "text-green-600" : "text-orange-500"}`}>{tag}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card px-5 py-4 flex items-center gap-4">
          <CheckCircle2 className={`h-8 w-8 shrink-0 ${complete.length === 6 ? "text-green-500" : "text-muted-foreground"}`} />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Modules Complete</p>
            <p className="text-3xl font-bold">{loading ? "—" : `${complete.length} / ${data ? data.modules.length : 6}`}</p>
            <p className="text-xs text-muted-foreground">{monthLabel} {year}</p>
          </div>
        </div>
      </div>

      {/* Pending Tasks */}
      <div className="rounded-lg border bg-card">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">Pending Tasks — {monthLabel} {year}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Modules that still need data entry or finalization for the selected period.
          </p>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-sm text-muted-foreground text-center">Loading…</div>
        ) : !data ? (
          <div className="px-5 py-8 text-sm text-muted-foreground text-center">Failed to load dashboard data.</div>
        ) : pending.length === 0 ? (
          <div className="px-5 py-8 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p className="text-sm font-medium text-green-700">All modules are finalized for {monthLabel} {year}!</p>
          </div>
        ) : (
          <ul className="divide-y">
            {pending.map(m => (
              <li key={m.module} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {m.status === "no_data" ? (
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-orange-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className={`text-xs ${m.status === "no_data" ? "text-red-600" : "text-orange-600"}`}>
                      {m.status === "no_data" ? "No data entered for this period" : "Data entered — needs to be saved (finalized)"}
                    </p>
                  </div>
                </div>
                <Link
                  href={m.path}
                  className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Completed modules summary */}
        {!loading && data && complete.length > 0 && (
          <div className="px-5 py-3 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-green-700">✓ Finalized:</span>{" "}
              {complete.map(m => m.label).join(" · ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
