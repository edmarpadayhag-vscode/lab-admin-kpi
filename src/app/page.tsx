"use client";

import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Users, TrendingUp, CheckCircle2, Circle, AlertCircle, ExternalLink } from "lucide-react";
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

type DashboardData = {
  modules: ModuleInfo[];
  stats: {
    activeEmployees: number;
    avgKpi: string | null;
  };
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [month, setMonth] = useState(getStoredMonth);
  const [year,  setYear]  = useState(getStoredYear);
  const [data,  setData]  = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    setData(null);
    fetch(`/api/dashboard?month=${month}&year=${year}`)
      .then(r => r.json())
      .then((d: DashboardData) => setData(d))
      .finally(() => setLoading(false));
  }, [month, year]);

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

        <div className="rounded-lg border bg-card px-5 py-4 flex items-center gap-4">
          <TrendingUp className="h-8 w-8 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Avg KPI Score</p>
            <p className="text-3xl font-bold">{loading ? "—" : (data?.stats.avgKpi ?? "—")}</p>
            <p className="text-xs text-muted-foreground">{monthLabel} {year}</p>
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
