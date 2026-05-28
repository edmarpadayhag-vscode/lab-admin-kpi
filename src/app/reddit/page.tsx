"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { upsertRedditWeek } from "./actions";

function calcActivityScore(replyCount: number): number {
  if (replyCount >= 3) return 5;
  if (replyCount === 2) return 3;
  return 1; // 0 or 1 entries
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const ROWS_PER_WEEK = 5;
const TOTAL_WEEKS   = 5;

// ─── Types ─────────────────────────────────────────────────────────────────────

type Employee = { id: number; name: string; isActive: boolean };

type LinkPair = { post: string; reply: string };

type WeekState = {
  weekNumber: number;
  isActive: boolean;
  links: LinkPair[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseLinks(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return raw ? [raw] : [];
  }
}

function emptyWeeks(): WeekState[] {
  return Array.from({ length: TOTAL_WEEKS }, (_, i) => ({
    weekNumber: i + 1,
    isActive:   true,
    links: Array.from({ length: ROWS_PER_WEEK }, () => ({ post: "", reply: "" })),
  }));
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function RedditPage() {
  const _now = new Date();
  const [employees,       setEmployees]       = useState<Employee[]>([]);
  const [employeeId,      setEmployeeId]       = useState("");
  const [filterMonth,     setFilterMonth]      = useState(String(_now.getMonth() + 1));
  const [filterYear,      setFilterYear]       = useState(String(_now.getFullYear()));
  const [weeks,          setWeeks]          = useState<WeekState[]>(emptyWeeks());
  const [savingWeek,     setSavingWeek]     = useState<number | null>(null);
  // Weeks whose data exists in the DB — show "Edit" button instead of "Save"
  const [persistedWeeks, setPersistedWeeks] = useState<Set<number>>(new Set());
  const [, startTransition] = useTransition();

  // Load employees
  useEffect(() => {
    fetch("/api/employees")
      .then(r => r.json())
      .then((data: Employee[]) => {
        const active = data.filter((e) => e.isActive !== false);
        setEmployees(active);
        if (active.length > 0) setEmployeeId(String(active[0].id));
      });
  }, []);

  // Load reddit data when employee / month / year changes
  useEffect(() => {
    if (!employeeId) return;
    fetch(`/api/reddit?employeeId=${employeeId}&month=${filterMonth}&year=${filterYear}`)
      .then(r => r.json())
      .then((rows: {
        weekNumber: number;
        isActive: boolean;
        redditPostLink: string | null;
        replyLink: string | null;
      }[]) => {
        const base = emptyWeeks();
        for (const row of rows) {
          const wi = row.weekNumber - 1;
          if (wi < 0 || wi >= TOTAL_WEEKS) continue;
          const postArr  = parseLinks(row.redditPostLink);
          const replyArr = parseLinks(row.replyLink);
          const links = Array.from({ length: ROWS_PER_WEEK }, (_, ri) => ({
            post:  postArr[ri]  ?? "",
            reply: replyArr[ri] ?? "",
          }));
          base[wi] = { weekNumber: row.weekNumber, isActive: row.isActive, links };
        }
        setWeeks(base);
        setPersistedWeeks(new Set(rows.map(r => r.weekNumber - 1)));
      });
  }, [employeeId, filterMonth, filterYear]);

  // ── Save helpers ─────────────────────────────────────────────────────────────

  function saveWeek(weekIdx: number, week: WeekState) {
    if (!employeeId) return;
    setSavingWeek(weekIdx);
    startTransition(async () => {
      await upsertRedditWeek({
        employeeId: parseInt(employeeId),
        month:      parseInt(filterMonth),
        year:       parseInt(filterYear),
        weekNumber: week.weekNumber,
        isActive:   week.isActive,
        postLinks:  week.links.map(l => l.post),
        replyLinks: week.links.map(l => l.reply),
      });
      setSavingWeek(null);
      setPersistedWeeks(prev => new Set(prev).add(weekIdx));
    });
  }

  // ── Field change handlers ─────────────────────────────────────────────────────

  function handleLinkChange(wi: number, ri: number, field: "post" | "reply", val: string) {
    setWeeks(prev =>
      prev.map((w, i) => i === wi
        ? { ...w, links: w.links.map((l, j) => j === ri ? { ...l, [field]: val } : l) }
        : w
      )
    );
  }

  function toggleActive(wi: number) {
    const newIsActive = !weeks[wi].isActive;
    setWeeks(prev => prev.map((w, i) => i === wi ? { ...w, isActive: newIsActive } : w));
    saveWeek(wi, { ...weeks[wi], isActive: newIsActive });
  }

  // ── Derived scores ────────────────────────────────────────────────────────────

  const weekRatings = weeks.map(w => {
    const replyCount = w.links.filter(l => l.reply.trim()).length;
    return w.isActive ? calcActivityScore(replyCount) : 0;
  });

  const activeWeeks = weeks.filter(w => w.isActive);
  const redditScore = activeWeeks.length > 0
    ? activeWeeks.reduce((sum, w, _i) => {
        const idx = weeks.indexOf(w);
        return sum + weekRatings[idx];
      }, 0) / activeWeeks.length
    : 0;

  const selectedEmp = employees.find(e => String(e.id) === employeeId);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <h1 className="text-2xl font-bold">Reddit</h1>
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Employee</Label>
          <Select value={employeeId} onValueChange={(v) => v !== null && setEmployeeId(v)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select employee…">
                {(v: string | null) => {
                  if (!v) return null;
                  return employees.find(e => String(e.id) === v)?.name ?? v;
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

        <div className="flex flex-col gap-1.5">
          <Label>Month</Label>
          <Select value={filterMonth} onValueChange={(v) => v !== null && setFilterMonth(v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Year</Label>
          <Select value={filterYear} onValueChange={(v) => v !== null && setFilterYear(v)}>
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
      </div>

      {/* Reddit Score widget */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card px-5 py-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Reddit Score
          </span>
          <span className="text-3xl font-bold">
            {activeWeeks.length > 0 ? redditScore.toFixed(2) : "—"}
          </span>
          <span className="text-xs text-muted-foreground">
            Average rating of active weeks
          </span>
        </div>
        <div className="rounded-lg border bg-card px-5 py-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Active Weeks
          </span>
          <span className="text-3xl font-bold">{activeWeeks.length}</span>
          <span className="text-xs text-muted-foreground">
            of {weeks.length} total weeks
          </span>
        </div>
        <div className="rounded-lg border bg-card px-5 py-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Score Guide
          </span>
          <span className="text-sm font-medium mt-0.5">≥ 3 replies → 5</span>
          <span className="text-xs text-muted-foreground">2 replies → 3 · &lt;2 replies → 1</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm border-collapse">
          {/* Header */}
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="px-4 py-3 text-left font-bold w-28 border-r border-slate-500">Weeks</th>
              <th className="px-4 py-3 text-center font-bold w-28 border-r border-slate-500">Active Week</th>
              <th className="px-4 py-3 text-center font-bold border-r border-slate-500">Original Reddit Link</th>
              <th className="px-4 py-3 text-center font-bold border-r border-slate-500">Link to your reply</th>
              <th className="px-4 py-3 text-center font-bold w-20">Rating</th>
            </tr>
          </thead>

          <tbody>
            {weeks.map((week, wi) => (
              Array.from({ length: ROWS_PER_WEEK }, (_, ri) => {
                const isFirstRow = ri === 0;
                const isLastRow  = ri === ROWS_PER_WEEK - 1;
                const rowBorder  = isLastRow ? "border-b-2 border-slate-300" : "border-b border-slate-100";
                const bgClass    = wi % 2 === 0 ? "bg-white" : "bg-slate-50/50";

                return (
                  <tr key={`${wi}-${ri}`} className={`${bgClass} ${rowBorder}`}>
                    {/* Week label — first row only */}
                    {isFirstRow && (
                      <td
                        rowSpan={ROWS_PER_WEEK}
                        className="px-4 py-2 font-semibold align-middle border-r border-slate-200 whitespace-nowrap"
                      >
                        Week {week.weekNumber}
                      </td>
                    )}

                    {/* Active Week toggle — first row only */}
                    {isFirstRow && (
                      <td
                        rowSpan={ROWS_PER_WEEK}
                        className="px-4 py-2 text-center align-middle border-r border-slate-200"
                      >
                        <button
                          onClick={() => toggleActive(wi)}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                            week.isActive
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-red-100 text-red-600 hover:bg-red-200"
                          }`}
                        >
                          {week.isActive ? "Yes" : "No"}
                        </button>
                      </td>
                    )}

                    {/* Original Reddit Link */}
                    <td className={`px-2 py-1 border-r border-slate-200 ${!week.isActive ? "bg-muted/40" : ""}`}>
                      <Input
                        value={week.links[ri].post}
                        onChange={e => handleLinkChange(wi, ri, "post", e.target.value)}
                        placeholder={week.isActive ? "https://www.reddit.com/…" : ""}
                        disabled={!week.isActive}
                        className="h-7 text-xs border-0 border-transparent shadow-none ring-0 outline-none bg-transparent focus-visible:ring-0 focus-visible:outline-none focus-visible:border-b focus-visible:border-slate-400 rounded-none p-0 px-1 placeholder:text-transparent focus-visible:placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </td>

                    {/* Link to your reply */}
                    <td className={`px-2 py-1 border-r border-slate-200 ${!week.isActive ? "bg-muted/40" : ""}`}>
                      <Input
                        value={week.links[ri].reply}
                        onChange={e => handleLinkChange(wi, ri, "reply", e.target.value)}
                        placeholder={week.isActive ? "https://www.reddit.com/…" : ""}
                        disabled={!week.isActive}
                        className="h-7 text-xs border-0 border-transparent shadow-none ring-0 outline-none bg-transparent focus-visible:ring-0 focus-visible:outline-none focus-visible:border-b focus-visible:border-slate-400 rounded-none p-0 px-1 placeholder:text-transparent focus-visible:placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </td>

                    {/* Rating + Save — first row only */}
                    {isFirstRow && (
                      <td
                        rowSpan={ROWS_PER_WEEK}
                        className="px-3 py-2 text-center align-middle"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <span className="font-bold text-base">
                            {week.isActive ? weekRatings[wi] : ""}
                          </span>
                          {persistedWeeks.has(wi) ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 px-3 text-xs w-full"
                              onClick={() =>
                                setPersistedWeeks(prev => {
                                  const s = new Set(prev);
                                  s.delete(wi);
                                  return s;
                                })
                              }
                            >
                              Edit
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-3 text-xs w-full"
                              disabled={savingWeek === wi}
                              onClick={() => saveWeek(wi, weeks[wi])}
                            >
                              {savingWeek === wi ? "Saving…" : "Save"}
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            ))}

          </tbody>
        </table>
      </div>
    </div>
  );
}
