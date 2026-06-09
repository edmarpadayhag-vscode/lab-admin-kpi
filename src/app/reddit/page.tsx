"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { upsertRedditWeek, clearRedditMonth } from "./actions";
import { useFinalized } from "@/hooks/use-finalized";
import { FinalizeButton } from "@/components/finalize-button";
import { getStoredMonth, getStoredYear } from "@/lib/kpi-period";

function calcActivityScore(replyCount: number): number {
  if (replyCount >= 3) return 5;
  if (replyCount === 2) return 3;
  if (replyCount === 1) return 2;
  return 1; // 0 replies
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

// ─── Types ─────────────────────────────────────────────────────────────────────

type Employee  = { id: number; name: string; isActive: boolean };
type Entry     = { date: string; post: string; reply: string; resolved: string };
type WeekState = { weekNumber: number; isActive: boolean; links: Entry[] };

// ─── Helpers ───────────────────────────────────────────────────────────────────

function monthFirstDay(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
function monthLastDay(month: number, year: number): string {
  const d = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function weeksInRange(start: string, end: string): number {
  const s = new Date(start + "T00:00:00.000Z");
  const e = new Date(end   + "T00:00:00.000Z");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 5;
  const days = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  return Math.min(Math.max(Math.ceil(days / 7), 1), 5);
}
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function weekRangeLabel(weekNum: number, startStr: string): string {
  const MS = 86400000;
  const s  = new Date(startStr + "T00:00:00.000Z");
  const wS = new Date(s.getTime() + (weekNum - 1) * 7 * MS);
  const wE = new Date(s.getTime() +  weekNum      * 7 * MS - MS);
  return `${SHORT_MONTHS[wS.getUTCMonth()]} ${wS.getUTCDate()} – ${SHORT_MONTHS[wE.getUTCMonth()]} ${wE.getUTCDate()}`;
}

function blankEntry(): Entry {
  return { date: "", post: "", reply: "", resolved: "" };
}

function emptyWeeks(count: number): WeekState[] {
  return Array.from({ length: count }, (_, i) => ({
    weekNumber: i + 1,
    isActive:   false,
    links:      [blankEntry()],
  }));
}

/**
 * Parses the stored redditPostLink JSON into an Entry[].
 * Handles both the new format [{date,post,reply}] and the old string[] format.
 */
function parseEntries(raw: string | null | undefined, rawReply: string | null | undefined): Entry[] {
  if (!raw) return [blankEntry()];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [blankEntry()];
    if (typeof parsed[0] === "object" && parsed[0] !== null) {
      return (parsed as Partial<Entry>[]).map(e => ({
        date:     String(e.date     ?? ""),
        post:     String(e.post     ?? ""),
        reply:    String(e.reply    ?? ""),
        resolved: String(e.resolved ?? ""),
      }));
    }
    // Old format: string[] for posts + separate replyLink string[]
    let replies: string[] = [];
    try { replies = JSON.parse(rawReply ?? "[]"); } catch { /* ok */ }
    return (parsed as string[]).map((post, i) => ({
      date:     "",
      post:     String(post       ?? ""),
      reply:    String(replies[i] ?? ""),
      resolved: "",
    }));
  } catch {
    return [blankEntry()];
  }
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function lsRangeKey(month: string, year: string) {
  return `reddit-range-${year}-${month}`;
}
function lsLoadRange(month: string, year: string): { start: string; end: string } {
  try {
    const raw = localStorage.getItem(lsRangeKey(month, year));
    if (raw) {
      const { start, end } = JSON.parse(raw) as { start?: string; end?: string };
      return { start: start ?? "", end: end ?? "" };
    }
  } catch { /* ok */ }
  return { start: "", end: "" };
}
function lsSaveRange(month: string, year: string, start: string, end: string) {
  try { localStorage.setItem(lsRangeKey(month, year), JSON.stringify({ start, end })); } catch { /* ok */ }
}

export default function RedditPage() {
  const [employees,      setEmployees]      = useState<Employee[]>([]);
  const [employeeId,     setEmployeeId]     = useState("");
  const [filterMonth,    setFilterMonth]    = useState(getStoredMonth);
  const [filterYear,     setFilterYear]     = useState(getStoredYear);
  // Initialise from localStorage so values survive tab navigation
  const [startOverride,  setStartOverride]  = useState<string>(() => lsLoadRange(getStoredMonth(), getStoredYear()).start);
  const [endOverride,    setEndOverride]    = useState<string>(() => lsLoadRange(getStoredMonth(), getStoredYear()).end);
  // Derive effective dates from overrides or the selected month/year
  const startDate = startOverride || monthFirstDay(parseInt(filterMonth), parseInt(filterYear));
  const endDate   = endOverride   || monthLastDay(parseInt(filterMonth), parseInt(filterYear));
  const [weeks,          setWeeks]          = useState<WeekState[]>(
    emptyWeeks(weeksInRange(startDate, endDate))
  );
  const [savingWeek,     setSavingWeek]     = useState<number | null>(null);
  const [persistedWeeks, setPersistedWeeks] = useState<Set<number>>(new Set());
  const [reloadKey,      setReloadKey]      = useState(0);
  const { isFinalized, finalizing, finalize, unfinalize } = useFinalized("reddit", filterMonth, filterYear);
  const [importing,      setImporting]      = useState(false);
  const [importResult,   setImportResult]   = useState<{ ok: boolean; message: string } | null>(null);
  const [clearing,       setClearing]       = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  // Load employees
  useEffect(() => {
    fetch("/api/employees")
      .then(r => r.json())
      .then((data: Employee[]) => {
        const active = data.filter(e => e.isActive !== false);
        setEmployees(active);
        if (active.length > 0) setEmployeeId(String(active[0].id));
      });
  }, []);

  // When month/year changes, load any previously saved dates from localStorage
  useEffect(() => {
    const { start, end } = lsLoadRange(filterMonth, filterYear);
    setStartOverride(start);
    setEndOverride(end);
  }, [filterMonth, filterYear]);

  // Load reddit data
  useEffect(() => {
    if (!employeeId) return;
    const count = weeksInRange(startDate, endDate);
    fetch(`/api/reddit?employeeId=${employeeId}&month=${filterMonth}&year=${filterYear}`)
      .then(r => r.json())
      .then((rows: { weekNumber: number; isActive: boolean; redditPostLink: string | null; replyLink: string | null }[]) => {
        const base = emptyWeeks(count);
        for (const row of rows) {
          const wi = row.weekNumber - 1;
          if (wi < 0 || wi >= count) continue;
          base[wi] = {
            weekNumber: row.weekNumber,
            isActive:   row.isActive,
            links:      parseEntries(row.redditPostLink, row.replyLink),
          };
        }
        setWeeks(base);
        setPersistedWeeks(new Set(rows.map(r => r.weekNumber - 1)));
      });
  }, [employeeId, filterMonth, filterYear, reloadKey, startDate, endDate]);

  // ── Clear ─────────────────────────────────────────────────────────────────────

  async function handleClear() {
    if (!employeeId) return;
    setClearing(true);
    try {
      await clearRedditMonth({
        employeeId: parseInt(employeeId),
        month:      parseInt(filterMonth),
        year:       parseInt(filterYear),
      });
      setWeeks(emptyWeeks(weeksInRange(startDate, endDate)));
      setPersistedWeeks(new Set());
      setImportResult(null);
    } finally {
      setClearing(false);
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────────

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const form = new FormData();
    form.append("file", file);
    form.append("startDate", startDate);
    form.append("endDate",   endDate);
    try {
      const res  = await fetch("/api/reddit/import", { method: "POST", body: form });
      const data = await res.json() as {
        inserted?: number;
        skipped?:  number;
        error?:    string;
        months?:   { month: number; year: number }[];
      };
      if (!res.ok) {
        setImportResult({ ok: false, message: data.error ?? "Import failed" });
      } else {
        // Auto-switch the month/year filter to match the imported data
        if (data.months && data.months.length > 0) {
          const { month, year } = data.months[0];
          setFilterMonth(String(month));
          setFilterYear(String(year));
        }
        const skippedNote = (data.skipped ?? 0) > 0 ? `, ${data.skipped} skipped` : "";
        const monthNote   = data.months?.[0]
          ? ` (${MONTH_NAMES[data.months[0].month - 1]} ${data.months[0].year})`
          : "";
        setImportResult({ ok: true, message: `Imported ${data.inserted ?? 0} entries${monthNote}${skippedNote}` });
        setReloadKey(k => k + 1);
      }
    } catch {
      setImportResult({ ok: false, message: "Network error — check your connection and try again" });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

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
        entries:    week.links,
      });
      setSavingWeek(null);
      setPersistedWeeks(prev => new Set(prev).add(weekIdx));
    });
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function handleEntryChange(wi: number, ri: number, field: keyof Entry, val: string) {
    setWeeks(prev =>
      prev.map((w, i) => i === wi
        ? { ...w, links: w.links.map((l, j) => j === ri ? { ...l, [field]: val } : l) }
        : w
      )
    );
  }

  function addRow(wi: number) {
    setWeeks(prev => prev.map((w, i) => i === wi ? { ...w, links: [...w.links, blankEntry()] } : w));
    setPersistedWeeks(prev => { const s = new Set(prev); s.delete(wi); return s; });
  }

  function toggleActive(wi: number) {
    const newIsActive = !weeks[wi].isActive;
    setWeeks(prev => prev.map((w, i) => i === wi ? { ...w, isActive: newIsActive } : w));
    saveWeek(wi, { ...weeks[wi], isActive: newIsActive });
  }

  // ── Scores ────────────────────────────────────────────────────────────────────

  const weekRatings = weeks.map(w => {
    const replyCount = w.links.filter(l => l.reply.trim()).length;
    return w.isActive ? calcActivityScore(replyCount) : 0;
  });

  const activeWeeks = weeks.filter(w => w.isActive);
  const redditScore = activeWeeks.length > 0
    ? activeWeeks.reduce((sum, w) => sum + weekRatings[weeks.indexOf(w)], 0) / activeWeeks.length
    : 0;

  const inputCls = "h-7 text-xs border-0 border-transparent shadow-none ring-0 outline-none bg-transparent focus-visible:ring-0 focus-visible:outline-none focus-visible:border-b focus-visible:border-slate-400 rounded-none p-0 px-1 placeholder:text-transparent focus-visible:placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50";

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
          <Select value={employeeId} onValueChange={v => v !== null && setEmployeeId(v)}>
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
          <Select value={filterMonth} onValueChange={v => v !== null && setFilterMonth(v)}>
            <SelectTrigger className="w-40"><SelectValue>{(v) => MONTH_NAMES[Number(v) - 1] ?? v}</SelectValue></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Year</Label>
          <Select value={filterYear} onValueChange={v => v !== null && setFilterYear(v)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Start Date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={e => {
              setStartOverride(e.target.value);
              lsSaveRange(filterMonth, filterYear, e.target.value, endOverride);
            }}
            className="w-36 h-9 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>End Date</Label>
          <Input
            type="date"
            value={endDate}
            onChange={e => {
              setEndOverride(e.target.value);
              lsSaveRange(filterMonth, filterYear, startOverride, e.target.value);
            }}
            className="w-36 h-9 text-sm"
          />
        </div>

        {/* Import */}
        <div className="flex flex-col gap-1.5">
          <Label>&nbsp;</Label>
          <div className="flex items-center gap-3">
            <FinalizeButton isFinalized={isFinalized} finalizing={finalizing} month={filterMonth} year={filterYear} onFinalize={finalize} onUnfinalize={unfinalize} />
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileImport}
            />
            <Button
              variant="outline"
              disabled={importing || isFinalized}
              onClick={() => { setImportResult(null); fileInputRef.current?.click(); }}
            >
              {importing ? "Importing…" : "Import File"}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="destructive"
                    disabled={clearing || isFinalized || persistedWeeks.size === 0}
                  />
                }
              >
                {clearing ? "Clearing…" : "Clear"}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all Reddit activity for{" "}
                    <strong>{MONTH_NAMES[parseInt(filterMonth) - 1]} {filterYear}</strong> for the selected employee.
                    This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={handleClear}>
                    Clear
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {importResult && (
              <span className={`text-sm ${importResult.ok ? "text-green-600" : "text-red-600"}`}>
                {importResult.message}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Score widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card px-5 py-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Reddit Score</span>
          <span className="text-3xl font-bold">{activeWeeks.length > 0 ? redditScore.toFixed(2) : "—"}</span>
          <span className="text-xs text-muted-foreground">Average rating of active weeks</span>
        </div>
        <div className="rounded-lg border bg-card px-5 py-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Active Weeks</span>
          <span className="text-3xl font-bold">{activeWeeks.length}</span>
          <span className="text-xs text-muted-foreground">of {weeks.length} total weeks</span>
        </div>
        <div className="rounded-lg border bg-card px-5 py-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Score Guide</span>
          <span className="text-sm font-medium mt-0.5">≥ 3 → 5 · 2 → 3</span>
          <span className="text-xs text-muted-foreground">1 → 2 · 0 → 1</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="px-4 py-3 text-left font-bold w-24 border-r border-slate-500">Weeks</th>
              <th className="px-4 py-3 text-center font-bold w-24 border-r border-slate-500">Active Week</th>
              <th className="px-4 py-3 text-center font-bold w-32 border-r border-slate-500">Date</th>
              <th className="px-4 py-3 text-center font-bold border-r border-slate-500">Original Thread</th>
              <th className="px-4 py-3 text-center font-bold border-r border-slate-500">Reply Thread</th>
              <th className="px-4 py-3 text-center font-bold w-36 border-r border-slate-500">Resolved?</th>
              <th className="px-4 py-3 text-center font-bold w-20">Rating</th>
            </tr>
          </thead>

          <tbody>
            {weeks.map((week, wi) => {
              const rowCount = week.links.length;
              const bgClass  = wi % 2 === 0 ? "bg-white" : "bg-slate-50/50";

              return week.links.map((entry, ri) => {
                const isFirstRow = ri === 0;
                const isLastRow  = ri === rowCount - 1;
                const rowBorder  = isLastRow ? "border-b-2 border-slate-300" : "border-b border-slate-100";

                return (
                  <tr key={`${wi}-${ri}`} className={`${bgClass} ${rowBorder}`}>
                    {/* Week label */}
                    {isFirstRow && (
                      <td
                        rowSpan={rowCount}
                        className="px-4 py-2 align-middle border-r border-slate-200 whitespace-nowrap"
                      >
                        <div className="font-semibold">Week {week.weekNumber}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{weekRangeLabel(week.weekNumber, startDate)}</div>
                      </td>
                    )}

                    {/* Active toggle */}
                    {isFirstRow && (
                      <td
                        rowSpan={rowCount}
                        className="px-4 py-2 text-center align-middle border-r border-slate-200"
                      >
                        <button
                          onClick={() => !isFinalized && toggleActive(wi)}
                          disabled={isFinalized}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            week.isActive
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-red-100 text-red-600 hover:bg-red-200"
                          }`}
                        >
                          {week.isActive ? "Yes" : "No"}
                        </button>
                      </td>
                    )}

                    {/* Date */}
                    <td className={`px-2 py-1 border-r border-slate-200 ${!week.isActive ? "bg-muted/40" : ""}`}>
                      <Input
                        type="date"
                        value={entry.date}
                        onChange={e => handleEntryChange(wi, ri, "date", e.target.value)}
                        disabled={!week.isActive}
                        className={inputCls}
                      />
                    </td>

                    {/* Original Thread */}
                    <td className={`px-2 py-1 border-r border-slate-200 ${!week.isActive ? "bg-muted/40" : ""}`}>
                      <Input
                        value={entry.post}
                        onChange={e => handleEntryChange(wi, ri, "post", e.target.value)}
                        placeholder={week.isActive ? "https://www.reddit.com/…" : ""}
                        disabled={!week.isActive}
                        className={inputCls}
                      />
                    </td>

                    {/* Reply Thread */}
                    <td className={`px-2 py-1 border-r border-slate-200 ${!week.isActive ? "bg-muted/40" : ""}`}>
                      <Input
                        value={entry.reply}
                        onChange={e => handleEntryChange(wi, ri, "reply", e.target.value)}
                        placeholder={week.isActive ? "https://www.reddit.com/…" : ""}
                        disabled={!week.isActive}
                        className={inputCls}
                      />
                    </td>

                    {/* Resolved? */}
                    <td className={`px-2 py-1 border-r border-slate-200 ${!week.isActive ? "bg-muted/40" : ""}`}>
                      <Input
                        value={entry.resolved}
                        onChange={e => handleEntryChange(wi, ri, "resolved", e.target.value)}
                        placeholder={week.isActive ? "e.g. Yes / No Confirmation" : ""}
                        disabled={!week.isActive}
                        className={inputCls}
                      />
                    </td>

                    {/* Rating + Save */}
                    {isFirstRow && (
                      <td
                        rowSpan={rowCount}
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
                              disabled={isFinalized}
                              onClick={() => setPersistedWeeks(prev => {
                                const s = new Set(prev); s.delete(wi); return s;
                              })}
                            >
                              Edit
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-3 text-xs w-full"
                              disabled={savingWeek === wi || isFinalized}
                              onClick={() => saveWeek(wi, weeks[wi])}
                            >
                              {savingWeek === wi ? "Saving…" : "Save"}
                            </Button>
                          )}
                          {week.isActive && !isFinalized && (
                            <button
                              onClick={() => addRow(wi)}
                              className="text-xs text-slate-400 hover:text-slate-600 mt-1"
                            >
                              + row
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
