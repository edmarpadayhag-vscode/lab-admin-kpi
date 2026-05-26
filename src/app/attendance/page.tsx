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
import { Plus, Trash2, Upload, Pencil } from "lucide-react";
import { upsertAttendanceLog, deleteAttendanceLog, clearAllAttendanceLogs } from "./actions";
import { SCHEDULE_OPTIONS, expectedOut, calcUndertimeMinutes } from "@/lib/attendance-utils";
import type { Employee } from "@/types/employee";

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
  isPending,
  onSubmit,
}: {
  employees: Employee[];
  initial?: Log;
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
  const [schedule, setSchedule] = useState(initial?.schedule ?? "08:00");
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
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Log | null>(null);
  const [isPending, startTransition] = useTransition();

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
    setEmployees(empRes.filter((e: Employee) => e.isActive));
  }

  useEffect(() => { load(); }, []);

  function handleUpsert(data: Parameters<typeof upsertAttendanceLog>[0]) {
    startTransition(async () => {
      await upsertAttendanceLog(data);
      setAddOpen(false);
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
      await clearAllAttendanceLogs();
      await load();
      setToast("All records cleared");
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

  // ── Summary metrics ──────────────────────────────────────────────────────────
  let totalWorkDays = 0;
  let totalWorkMin  = 0;   // accumulated incrementally (half-day PTO contributes partial)
  let totalAbsences = 0;
  let countLateUndertime   = 0;
  let totalLateUndertimeMin = 0;

  for (const log of logs) {
    const [y, mo, d] = log.workDate.split("-").map(Number);
    const dow = new Date(y, mo - 1, d).getDay();
    const isRestDay =
      log.schedule !== "PTO" && log.schedule !== "SL" &&
      log.schedule !== "H-OFF" && log.schedule !== "1stHalf Absent" &&
      log.schedule !== "2ndHalf Absent" && log.schedule !== "Half Day PTO" &&
      ((log.restDay1 != null && dow === log.restDay1) ||
       (log.restDay2 != null && dow === log.restDay2));

    // Fully non-work: skip entirely
    const isFullyNonWork =
      log.schedule === "PTO" || log.schedule === "SL" ||
      log.schedule === "OFF" || log.schedule === "H-OFF" || isRestDay;
    if (isFullyNonWork) continue;

    totalWorkDays++;

    // ── 1stHalf Absent: came in late; undertime = Expected Out − Actual In ───
    if (log.schedule === "1stHalf Absent") {
      totalWorkMin += 9 * 60;
      const expOut = toMin(log.expectedTimeOut);
      const actIn  = toMin(log.actualTimeIn);
      const ut = (expOut !== null && actIn !== null) ? Math.max(0, expOut - actIn) : 0;
      if (ut > 0) { countLateUndertime++; totalLateUndertimeMin += ut; }
      continue;
    }

    // ── 2ndHalf Absent: left early; undertime = Actual Out − Expected In ─────
    if (log.schedule === "2ndHalf Absent") {
      totalWorkMin += 9 * 60;
      const actOut = toMin(log.actualTimeOut);
      const expIn  = toMin(log.expectedTimeIn);
      const ut = (actOut !== null && expIn !== null) ? Math.max(0, actOut - expIn) : 0;
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
          {/* Clear All */}
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="outline" disabled={isPending || logs.length === 0}>
                  Clear All
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all attendance records?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all {logs.length} record{logs.length !== 1 ? "s" : ""}. This action cannot be undone.
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
            <DialogTrigger render={<Button variant="outline"><Upload className="mr-2 h-4 w-4" />Import Excel</Button>} />
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

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={<Button><Plus className="mr-2 h-4 w-4" />Log Attendance</Button>} />
            <DialogContent>
              <DialogHeader><DialogTitle>Log Attendance</DialogTitle></DialogHeader>
              <AttendanceForm
                employees={employees}
                isPending={isPending}
                onSubmit={handleUpsert}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

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

        {/* Overall Attendance */}
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground leading-tight">Overall Attendance</span>
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
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                No attendance records yet. Add manually or import a CSV.
              </TableCell>
            </TableRow>
          )}
          {logs.map((log) => {
            // Determine row status (explicit schedule beats rest-day detection)
            const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const [y, mo, d] = log.workDate.split("-").map(Number);
            const dow = new Date(y, mo - 1, d).getDay(); // local 0=Sun
            const isRestDay = log.schedule !== "PTO" && log.schedule !== "SL" && log.schedule !== "H-OFF"
              && log.schedule !== "1stHalf Absent" && log.schedule !== "2ndHalf Absent" && log.schedule !== "Half Day PTO" &&
              ((log.restDay1 != null && dow === log.restDay1) ||
               (log.restDay2 != null && dow === log.restDay2));
            const isPTO           = log.schedule === "PTO";
            const isSL            = log.schedule === "SL";
            const isOff           = log.schedule === "OFF";
            const isHOff          = log.schedule === "H-OFF";
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
              ? <Badge variant="outline" className="text-green-600 border-green-400">H-OFF</Badge>
              : is1stHalfAbsent
              ? <Badge variant="outline" className="text-orange-600 border-orange-400">1stHalf Absent</Badge>
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
                  // 1stHalf Absent: came in late — undertime = Expected Out − Actual In
                  if (is1stHalfAbsent) {
                    const expOut = toMin(log.expectedTimeOut);
                    const actIn  = toMin(log.actualTimeIn);
                    const ut = (expOut !== null && actIn !== null) ? Math.max(0, expOut - actIn) : 0;
                    return ut > 0 ? <span className="text-destructive font-medium">{ut}</span> : "0";
                  }
                  // 2ndHalf Absent: left early — undertime = Actual Out − Expected In
                  if (is2ndHalfAbsent) {
                    const actOut = toMin(log.actualTimeOut);
                    const expIn  = toMin(log.expectedTimeIn);
                    const ut = (actOut !== null && expIn !== null) ? Math.max(0, actOut - expIn) : 0;
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
                <Button size="icon" variant="ghost" onClick={() => setEditing(log)} disabled={isPending}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(log.id)} disabled={isPending}>
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
