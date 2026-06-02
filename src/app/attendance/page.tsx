"use client";

import { useEffect, useState, useTransition } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Upload, Pencil } from "lucide-react";
import { upsertAttendanceLog, deleteAttendanceLog, clearAllAttendanceLogs, upsertEmployeeSchedule, applyMonthlySchedule } from "./actions";
import { useFinalized } from "@/hooks/use-finalized";
import { FinalizeButton } from "@/components/finalize-button";
import { SCHEDULE_OPTIONS, expectedOut, calcUndertimeMinutes } from "@/lib/attendance-utils";
import type { Employee } from "@/types/employee";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

/** Returns true when a stored time value represents "no time recorded". */
function isBlankTime(t: string | null | undefined): boolean {
  return !t || t.trim() === "" || /^0+[:0]*$/.test(t.trim());
}

/** Parse "HH:MM" or "HH:MM:SS" → total minutes, or null if unparseable. */
function toMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Minutes elapsed from `fromTime` to `toTime` (both "HH:MM" or "HH:MM:SS").
 * Handles cross-midnight automatically: if the raw difference is negative,
 * adds 1440 (one day) — e.g. from 22:59 to 08:00 → 541 min, not −899.
 * Returns null if either value is unparseable.
 */
function minutesDiff(fromTime: string | null | undefined, toTime: string | null | undefined): number | null {
  const from = toMin(fromTime);
  const to   = toMin(toTime);
  if (from === null || to === null) return null;
  const diff = to - from;
  return diff < 0 ? diff + 1440 : diff;
}

type Log = {
  id: number;
  workDate: string;
  employeeId: number;
  employeeName: string;
  restDay1: number | null;
  restDay2: number | null;
  schedule: string;
  expectedTimeIn: string | null;
  expectedTimeOut: string | null;
  actualTimeIn: string | null;
  actualTimeOut: string | null;
  lateMinutes: number;
  remarks: string | null;
};

// ─── Shared attendance form ───────────────────────────────────────────────────

function AttendanceForm({
  employees,
  initial,
  defaultSchedule,
  isPending,
  onSubmit,
}: {
  employees: Employee[];
  initial?: Log;
  defaultSchedule?: string;
  isPending: boolean;
  onSubmit: (data: {
    employeeId: number;
    workDate: string;
    schedule: string;
    actualTimeIn: string | null;
    actualTimeOut: string | null;
    remarks: string;
  }) => void;
}) {
  const isEdit = !!initial;
  const [schedule, setSchedule] = useState(initial?.schedule ?? defaultSchedule ?? "08:00");
  const [selectedEmployee, setSelectedEmployee] = useState(
    initial ? String(initial.employeeId) : ""
  );

  const previewExpectedOut = schedule !== "OFF" ? expectedOut(schedule) : null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const get = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    onSubmit({
      employeeId: Number(selectedEmployee),
      workDate: get("workDate"),
      schedule,
      actualTimeIn: get("actualTimeIn") || null,
      actualTimeOut: get("actualTimeOut") || null,
      remarks: get("remarks"),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Employee</Label>
          {isEdit ? (
            <Input value={initial.employeeName} readOnly className="bg-muted text-muted-foreground" />
          ) : (
            <Select value={selectedEmployee} onValueChange={(v) => v !== null && setSelectedEmployee(v)}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="workDate">Date</Label>
          <Input
            id="workDate"
            name="workDate"
            type="date"
            defaultValue={initial?.workDate}
            readOnly={isEdit}
            className={isEdit ? "bg-muted text-muted-foreground" : ""}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Schedule (Expected In)</Label>
          <Select value={schedule} onValueChange={(v) => v !== null && setSchedule(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-56">
              {SCHEDULE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Expected Out</Label>
          <Input
            value={previewExpectedOut ?? "OFF"}
            readOnly
            className="bg-muted text-muted-foreground"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="actualTimeIn">Actual In</Label>
          <Input
            id="actualTimeIn"
            name="actualTimeIn"
            type="time"
            defaultValue={initial?.actualTimeIn ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="actualTimeOut">Actual Out</Label>
          <Input
            id="actualTimeOut"
            name="actualTimeOut"
            type="time"
            defaultValue={initial?.actualTimeOut ?? ""}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="remarks">Remarks</Label>
        <Textarea id="remarks" name="remarks" rows={2} defaultValue={initial?.remarks ?? ""} />
      </div>

      <Button type="submit" className="w-full" disabled={isPending || (!isEdit && !selectedEmployee)}>
        {isPending ? "Saving…" : isEdit ? "Update" : "Save"}
      </Button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<Log | null>(null);
  const [isPending, startTransition] = useTransition();

  // filters
  const _now = new Date();
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterMonth, setFilterMonth] = useState(String(_now.getMonth() + 1));
  const [filterYear,  setFilterYear]  = useState(String(_now.getFullYear()));

  // Monthly schedule + rest days for the selected employee + month/year
  const [monthlySchedule, setMonthlySchedule] = useState<string>("08:00");
  const [restDays,         setRestDays]         = useState<number[]>([]);
  const [isApplying,       setIsApplying]        = useState(false);
  const { isFinalized, finalizing, finalize, unfinalize } = useFinalized("attendance", filterMonth, filterYear);

  const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Load monthly schedule + rest days whenever employee / month / year changes
  useEffect(() => {
    if (!filterEmployee) { setMonthlySchedule("08:00"); setRestDays([]); return; }
    fetch(`/api/employee-schedules?employeeId=${filterEmployee}&month=${filterMonth}&year=${filterYear}`)
      .then(r => r.json())
      .then(({ schedule, restDays: rd }: { schedule: string | null; restDays: number[] }) => {
        setMonthlySchedule(schedule ?? "08:00");
        setRestDays(rd ?? []);
      });
  }, [filterEmployee, filterMonth, filterYear]);

  function toggleRestDay(dow: number) {
    setRestDays(prev =>
      prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow]
    );
  }

  async function handleSaveAndApply() {
    if (!filterEmployee) return;
    setIsApplying(true);
    await upsertEmployeeSchedule(Number(filterEmployee), Number(filterMonth), Number(filterYear), monthlySchedule, restDays);
    await applyMonthlySchedule(Number(filterEmployee), Number(filterMonth), Number(filterYear));
    await load();
    setIsApplying(false);
    setToast("Schedule & rest days applied");
  }

  // import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number; total: number; errors: { row: number; message: string }[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function load() {
    const [logsRes, empRes] = await Promise.all([
      fetch("/api/attendance").then((r) => r.json()),
      fetch("/api/employees").then((r) => r.json()),
    ]);
    setLogs(logsRes);
    const active: Employee[] = empRes.filter((e: Employee) => e.isActive);
    setEmployees(active);
    setFilterEmployee(prev => prev || (active[0] ? String(active[0].id) : ""));
  }

  useEffect(() => { load(); }, []);

  function handleUpsert(data: Parameters<typeof upsertAttendanceLog>[0]) {
    startTransition(async () => {
      await upsertAttendanceLog(data);
      setEditing(null);
      load();
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteAttendanceLog(id);
      load();
    });
  }

  function handleClearAll() {
    startTransition(async () => {
      await clearAllAttendanceLogs(
        Number(filterMonth),
        Number(filterYear),
        filterEmployee ? Number(filterEmployee) : undefined,
      );
      await load();
      setToast("Records cleared");
    });
  }

  async function handleImport(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await fetch("/api/attendance/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Import failed");
      } else {
        setImportResult(data);
        if (data.inserted > 0) {
          await load();
          setToast(`${data.inserted} record${data.inserted === 1 ? "" : "s"} imported`);
        }
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function resetImport() {
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
  }

  // ── Filtered logs ─────────────────────────────────────────────────────────────
  const monthPrefix = `${filterYear}-${String(Number(filterMonth)).padStart(2, "0")}`;
  const filteredLogs = logs.filter((l) => {
    const matchesMonth    = l.workDate.startsWith(monthPrefix);
    const matchesEmployee = !filterEmployee || l.employeeId === Number(filterEmployee);
    return matchesMonth && matchesEmployee;
  });

  // ── Summary metrics ──────────────────────────────────────────────────────────
  let totalWorkDays = 0;
  let totalWorkMin  = 0;   // accumulated incrementally (half-day PTO contributes partial)
  let totalAbsences = 0;
  let countLateUndertime   = 0;
  let totalLateUndertimeMin = 0;

  for (const log of filteredLogs) {
    const [y, mo, d] = log.workDate.split("-").map(Number);
    const dow = new Date(y, mo - 1, d).getDay();
    const isRestDay =
      log.schedule !== "PTO" && log.schedule !== "SL" &&
      log.schedule !== "Holiday Off" && log.schedule !== "1stHalf Absent" &&
      log.schedule !== "2ndHalf Absent" && log.schedule !== "Half Day PTO" &&
      ((log.restDay1 != null && dow === log.restDay1) ||
       (log.restDay2 != null && dow === log.restDay2));

    // Fully non-work: skip entirely
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

    // ── 1stHalf Absent: undertime = Actual In − Expected In ─────────────────
    if (log.schedule === "1stHalf Absent") {
      totalWorkMin += 9 * 60;
      const ut = minutesDiff(log.expectedTimeIn, log.actualTimeIn) ?? 0;
      if (ut > 0) { countLateUndertime++; totalLateUndertimeMin += ut; }
      continue;
    }

    // ── 2ndHalf Absent: undertime = Expected Out − Actual Out ────────────────
    if (log.schedule === "2ndHalf Absent") {
      totalWorkMin += 9 * 60;
      const ut = minutesDiff(log.actualTimeOut, log.expectedTimeOut) ?? 0;
      if (ut > 0) { countLateUndertime++; totalLateUndertimeMin += ut; }
      continue;
    }

    // ── Half Day PTO: partial hours worked (Actual Out − Actual In) ──────────
    if (log.schedule === "Half Day PTO") {
      const outMin = toMin(log.actualTimeOut);
      const inMin  = toMin(log.actualTimeIn) ?? toMin(log.expectedTimeIn);
      totalWorkMin += (outMin !== null && inMin !== null) ? Math.max(0, outMin - inMin) : 0;
      continue;
    }

    // ── Regular work day ─────────────────────────────────────────────────────
    totalWorkMin += 9 * 60;

    if (isBlankTime(log.actualTimeIn) && isBlankTime(log.actualTimeOut)) {
      totalAbsences++;
      continue;
    }

    const late = log.lateMinutes ?? 0;
    const ut   = calcUndertimeMinutes(log.expectedTimeOut, log.actualTimeOut);
    if (late > 0 || ut > 0) {
      countLateUndertime++;
      totalLateUndertimeMin += late + ut;
    }
  }

  const totalAbsenceMin = totalAbsences * 9 * 60;
  const overallPct = totalWorkMin > 0
    ? Math.max(0, ((totalWorkMin - totalAbsenceMin - totalLateUndertimeMin) / totalWorkMin) * 100)
    : null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold">Attendance</h1>
        </div>
        <div className="flex gap-2">
          <FinalizeButton isFinalized={isFinalized} finalizing={finalizing} month={filterMonth} year={filterYear} onFinalize={finalize} onUnfinalize={unfinalize} />
          {/* Clear All */}
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="outline" disabled={isPending || isFinalized || filteredLogs.length === 0}>
                  Clear All
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Clear {employees.find(e => String(e.id) === filterEmployee)?.name ?? "selected employee"}'s attendance for {MONTH_NAMES[Number(filterMonth) - 1]} {filterYear}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete {filteredLogs.length} record{filteredLogs.length !== 1 ? "s" : ""}. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleClearAll}>
                  Delete All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Import dialog */}
          <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) resetImport(); }}>
            <DialogTrigger render={<Button variant="outline" disabled={isFinalized}><Upload className="mr-2 h-4 w-4" />Import Excel</Button>} />
            <DialogContent>
              <DialogHeader><DialogTitle>Import Attendance from Excel</DialogTitle></DialogHeader>
              <form onSubmit={handleImport} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="att-file">Excel / CSV file (.xlsx, .xls, .csv)</Label>
                  <Input
                    id="att-file"
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    required
                  />
                </div>
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Expected columns:</p>
                  <div className="space-y-0.5">
                    <p><span className="font-medium text-foreground">Date</span> — <code>Date</code> or <code>Work Date</code></p>
                    <p><span className="font-medium text-foreground">Employee</span> — <code>Employee</code> or <code>Name</code></p>
                    <p><span className="font-medium text-foreground">Schedule</span> — <code>Schedule</code> or <code>Expected In</code> <span className="italic">(optional, defaults to 08:00)</span></p>
                    <p><span className="font-medium text-foreground">Actual In</span> — <code>Actual In</code> or <code>Time In</code> <span className="italic">(optional)</span></p>
                    <p><span className="font-medium text-foreground">Actual Out</span> — <code>Actual Out</code> or <code>Time Out</code> <span className="italic">(optional)</span></p>
                  </div>
                  <p className="pt-1">Employee must match a name in the system. Existing records for the same employee + date are overwritten.</p>
                </div>
                {importError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {importError}
                  </div>
                )}
                {importResult && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                    <p>
                      Inserted <strong>{importResult.inserted}</strong> of <strong>{importResult.total}</strong> rows
                      {importResult.skipped > 0 && <> · skipped <strong>{importResult.skipped}</strong></>}
                    </p>
                    {importResult.errors.length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">
                          View {importResult.errors.length} error{importResult.errors.length === 1 ? "" : "s"}
                        </summary>
                        <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
                          {importResult.errors.map((err, i) => (
                            <li key={i} className="text-xs text-muted-foreground">
                              Row {err.row}: {err.message}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={!importFile || importing}>
                  {importing ? "Importing…" : "Import"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Employee</Label>
          <Select value={filterEmployee} onValueChange={(v) => v !== null && setFilterEmployee(v)}>
            <SelectTrigger className="w-48">
              <SelectValue>
                {employees.find((e) => String(e.id) === filterEmployee)?.name ?? "Select employee…"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
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

      {/* Monthly Schedule + Rest Days — only when a specific employee is selected */}
      {!!filterEmployee && (
        <div className="flex flex-wrap items-end gap-6 rounded-lg border bg-card px-5 py-4">
          {/* Schedule picker */}
          <div className="flex flex-col gap-1.5">
            <Label className="font-semibold">Monthly Schedule (Expected In)</Label>
            <Select
              value={monthlySchedule}
              onValueChange={(v) => v !== null && setMonthlySchedule(v)}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {SCHEDULE_OPTIONS.filter(s => /^\d{2}:\d{2}$/.test(s)).map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rest days picker */}
          <div className="flex flex-col gap-1.5">
            <Label className="font-semibold">Rest Days</Label>
            <div className="flex gap-1.5">
              {DOW_LABELS.map((label, dow) => (
                <button
                  key={dow}
                  type="button"
                  onClick={() => toggleRestDay(dow)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    restDays.includes(dow)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-input hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Save & Apply button */}
          <Button
            onClick={handleSaveAndApply}
            disabled={isApplying || isFinalized}
            className="gap-2"
          >
            {isApplying ? "Applying…" : "Save & Apply"}
          </Button>

          <p className="text-xs text-muted-foreground self-end pb-1">
            Updates Expected In on all existing logs for {MONTH_NAMES[Number(filterMonth) - 1]} {filterYear}.
          </p>
        </div>
      )}

      {/* ── Summary widgets ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Work Days / Hours */}
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground leading-tight">Total Work Days / Hours</span>
          <span className="text-2xl font-bold tracking-tight">{totalWorkDays}<span className="text-sm font-normal text-muted-foreground ml-1">days</span></span>
          <span className="text-xs text-muted-foreground">{(totalWorkMin / 60).toFixed(1)} hrs · {totalWorkMin} min</span>
        </div>

        {/* Total Absences */}
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground leading-tight">Total Absences</span>
          <span className={`text-2xl font-bold tracking-tight ${totalAbsences > 0 ? "text-destructive" : ""}`}>{totalAbsences}<span className="text-sm font-normal text-muted-foreground ml-1">days</span></span>
          <span className="text-xs text-muted-foreground">{totalAbsenceMin} min</span>
        </div>

        {/* Count + Total Min Late / Undertime */}
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground leading-tight">Count Late / Undertime</span>
          <span className={`text-2xl font-bold tracking-tight ${countLateUndertime > 0 ? "text-destructive" : ""}`}>{countLateUndertime}<span className="text-sm font-normal text-muted-foreground ml-1">days</span></span>
          <span className={`text-xs ${totalLateUndertimeMin > 0 ? "text-destructive" : "text-muted-foreground"}`}>{totalLateUndertimeMin} min</span>
        </div>

        {/* Monthly Attendance */}
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground leading-tight">Monthly Attendance</span>
          <span className={`text-2xl font-bold tracking-tight ${overallPct !== null && overallPct < 100 ? "text-destructive" : ""}`}>
            {overallPct !== null ? `${overallPct.toFixed(1)}%` : "—"}
          </span>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Expected In</TableHead>
            <TableHead>Expected Out</TableHead>
            <TableHead>Actual In</TableHead>
            <TableHead>Actual Out</TableHead>
            <TableHead>Late (min)</TableHead>
            <TableHead>Undertime (min)</TableHead>
            <TableHead>Remarks</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredLogs.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                {logs.length === 0
                  ? "No attendance records yet. Add manually or import a CSV."
                  : `No records for ${employees.find(e => String(e.id) === filterEmployee)?.name ?? "selected employee"} in ${MONTH_NAMES[Number(filterMonth) - 1]} ${filterYear}.`}
              </TableCell>
            </TableRow>
          )}
          {filteredLogs.map((log) => {
            // Determine row status (explicit schedule beats rest-day detection)
            const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const [y, mo, d] = log.workDate.split("-").map(Number);
            const dow = new Date(y, mo - 1, d).getDay(); // local 0=Sun
            const isRestDay = log.schedule !== "PTO" && log.schedule !== "SL" && log.schedule !== "Holiday Off"
              && log.schedule !== "1stHalf Absent" && log.schedule !== "2ndHalf Absent" && log.schedule !== "Half Day PTO" &&
              ((log.restDay1 != null && dow === log.restDay1) ||
               (log.restDay2 != null && dow === log.restDay2));
            const isPTO           = log.schedule === "PTO";
            const isSL            = log.schedule === "SL";
            const isOff           = log.schedule === "OFF";
            const isHOff          = log.schedule === "Holiday Off";
            const is1stHalfAbsent = log.schedule === "1stHalf Absent";
            const is2ndHalfAbsent = log.schedule === "2ndHalf Absent";
            const isHalfPTO       = log.schedule === "Half Day PTO";
            // isNonWork: fully non-working days — half-day types excluded (they store expected times)
            const isNonWork  = isPTO || isSL || isRestDay || isOff || isHOff;
            const isHalfDay  = is1stHalfAbsent || is2ndHalfAbsent || isHalfPTO;

            // Absent = valid full work day but no actual times recorded
            const noActualIn  = isBlankTime(log.actualTimeIn);
            const noActualOut = isBlankTime(log.actualTimeOut);
            const isAbsent    = !isNonWork && !isHalfDay && noActualIn && noActualOut;

            // Expected In cell content
            const expectedInCell = isPTO
              ? <Badge variant="outline" className="text-blue-600 border-blue-400">PTO</Badge>
              : isSL
              ? <Badge variant="outline" className="text-yellow-600 border-yellow-400">SL</Badge>
              : isHOff
              ? <Badge variant="outline" className="text-green-600 border-green-400">Holiday Off</Badge>
              : is1stHalfAbsent
              ? <div className="flex flex-col gap-0.5">
                  <Badge variant="outline" className="text-orange-600 border-orange-400 w-fit">1stHalf Absent</Badge>
                  <span className="text-xs text-muted-foreground">{log.expectedTimeIn ?? "—"}</span>
                </div>
              : is2ndHalfAbsent
              ? <div className="flex flex-col gap-0.5">
                  <Badge variant="outline" className="text-orange-600 border-orange-400 w-fit">2ndHalf Absent</Badge>
                  <span className="text-xs text-muted-foreground">{log.expectedTimeIn ?? "—"}</span>
                </div>
              : isHalfPTO
              ? <Badge variant="outline" className="text-purple-600 border-purple-400">Half Day PTO</Badge>
              : isRestDay
              ? <Badge variant="secondary">Rest Day</Badge>
              : isOff ? "OFF"
              : (log.expectedTimeIn ?? "—");

            return (
            <TableRow key={log.id} className={isNonWork || isHalfDay ? "bg-muted/40" : ""}>
              <TableCell>
                <div>{log.workDate}</div>
                <div className="text-xs text-muted-foreground">{DAY_NAMES[dow]}</div>
              </TableCell>
              <TableCell className="font-medium">{log.employeeName}</TableCell>
              <TableCell>{expectedInCell}</TableCell>
              <TableCell>{isNonWork ? "—" : (log.expectedTimeOut ?? "—")}</TableCell>
              <TableCell>{noActualIn  ? "—" : log.actualTimeIn!}</TableCell>
              <TableCell>{noActualOut ? "—" : log.actualTimeOut!}</TableCell>
              <TableCell>
                {/* Late minutes: not tracked for half-day or absent rows */}
                {isNonWork || isHalfDay || isAbsent ? "—" : log.lateMinutes > 0
                  ? <span className="text-destructive font-medium">{log.lateMinutes}</span>
                  : "0"}
              </TableCell>
              <TableCell>
                {(() => {
                  if (isNonWork || isAbsent || isHalfPTO) return "—";
                  // 1stHalf Absent: undertime = Actual In − Expected In
                  if (is1stHalfAbsent) {
                    const ut = minutesDiff(log.expectedTimeIn, log.actualTimeIn) ?? 0;
                    return ut > 0 ? <span className="text-destructive font-medium">{ut}</span> : "0";
                  }
                  // 2ndHalf Absent: undertime = Expected Out − Actual Out
                  if (is2ndHalfAbsent) {
                    const ut = minutesDiff(log.actualTimeOut, log.expectedTimeOut) ?? 0;
                    return ut > 0 ? <span className="text-destructive font-medium">{ut}</span> : "0";
                  }
                  if (noActualOut) return "—";
                  const ut = calcUndertimeMinutes(log.expectedTimeOut, log.actualTimeOut);
                  return ut > 0
                    ? <span className="text-destructive font-medium">{ut}</span>
                    : "0";
                })()}
              </TableCell>
              <TableCell className="max-w-40 truncate">
                {isAbsent
                  ? <span className="text-destructive font-medium">
                      Absent{log.remarks ? ` — ${log.remarks}` : ""}
                    </span>
                  : (log.remarks ?? "—")}
              </TableCell>
              <TableCell className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(log)} disabled={isPending || isFinalized}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(log.id)} disabled={isPending || isFinalized}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Edit dialog — rendered outside the table to avoid nesting issues */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Attendance</DialogTitle></DialogHeader>
          {editing && (
            <AttendanceForm
              key={editing.id}
              employees={employees}
              initial={editing}
              isPending={isPending}
              onSubmit={handleUpsert}
            />
          )}
        </DialogContent>
      </Dialog>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg animate-in fade-in-0 slide-in-from-bottom-2"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
