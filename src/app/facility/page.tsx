"use client";

import { useEffect, useState, useTransition } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CalendarOff, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { clearAllFacilityLogs, createFacilityLog, deleteFacilityLog, markDayNoWork, unmarkDayNoWork, updateFacilityLog } from "./actions";
import { useFinalized } from "@/hooks/use-finalized";
import { FinalizeButton } from "@/components/finalize-button";
import { getStoredMonth, getStoredYear } from "@/lib/kpi-period";

// ─── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DOW_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS  = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

type ImportResult = {
  inserted: number;
  skipped: number;
  total: number;
  errors: { row: number; message: string }[];
};

type Log = {
  id: number;
  date: string;
  submittedBy: number | null;
  submittedByName: string | null;
  timeSubmitted: string | null;
  personnelPresent: string | null;
  status: string;
  remarks: string | null;
  proofImageUrl: string | null;
  source: "manual" | "import" | string;
};

export default function FacilityPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [open, setOpen] = useState(false);
  const [prefillDate, setPrefillDate] = useState("");
  const [editing, setEditing] = useState<Log | null>(null);

  // Month / year filter
  const [filterMonth, setFilterMonth] = useState(getStoredMonth);
  const [filterYear,  setFilterYear]  = useState(getStoredYear);

  // ── Derived month stats ────────────────────────────────────────────────────
  const selY = parseInt(filterYear)  || new Date().getFullYear();
  const selM = parseInt(filterMonth) || (new Date().getMonth() + 1);
  const daysInMonth = new Date(selY, selM, 0).getDate();

  // All days in the selected month
  const allMonthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${selY}-${String(selM).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dow = new Date(selY, selM - 1, day).getDay(); // 0=Sun … 6=Sat
    return { date: dateStr, dow, isWeekend: dow === 0 || dow === 6 };
  });

  // Logs for the selected month
  const monthPrefix = `${selY}-${String(selM).padStart(2, "0")}`;
  const monthLogs   = logs.filter(l => l.date.startsWith(monthPrefix));

  // Separate no-work markers from real log entries
  const noWorkDates = new Set<string>();
  const logsByDate  = new Map<string, Log[]>();
  for (const log of monthLogs) {
    if (log.source === "no_work") {
      noWorkDates.add(log.date);
    } else {
      if (!logsByDate.has(log.date)) logsByDate.set(log.date, []);
      logsByDate.get(log.date)!.push(log);
    }
  }

  // Widget values — no-work days are excluded from the count entirely
  const weekdays          = allMonthDays.filter(d => !d.isWeekend);
  const countableWeekdays = weekdays.filter(d => !noWorkDates.has(d.date));
  const numberOfDays  = countableWeekdays.length;
  const missedDays    = countableWeekdays.filter(d => !logsByDate.has(d.date)).length;
  const facilityRate  = numberOfDays > 0 ? (numberOfDays - missedDays) / numberOfDays : 0;
  const { isFinalized, finalizing, finalize, unfinalize } = useFinalized("facility", filterMonth, filterYear);
  const [removeProof, setRemoveProof] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function load() {
    const logsRes = await fetch("/api/facility").then((r) => r.json());
    setLogs(logsRes);
  }

  useEffect(() => { load(); }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setFormError(null);
    startTransition(async () => {
      try {
        await createFacilityLog(fd);
        form.reset();
        setOpen(false);
        await load();
        setToast("Entry added");
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  function openEdit(log: Log) {
    setEditing(log);
    setRemoveProof(false);
    setFormError(null);
  }

  function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (removeProof) fd.set("removeProofImage", "1");
    setFormError(null);
    const id = editing.id;
    startTransition(async () => {
      try {
        await updateFacilityLog(id, fd);
        setEditing(null);
        await load();
        setToast("Entry updated");
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Failed to update");
      }
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteFacilityLog(id);
      load();
    });
  }

  function handleClearAll() {
    startTransition(async () => {
      await clearAllFacilityLogs(selM, selY);
      await load();
      setToast("Success");
    });
  }

  async function handleImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await fetch("/api/facility/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Import failed");
      } else {
        setImportResult(data);
        load();
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold">Facility</h1>
        </div>
        <div className="flex items-center gap-2">
          <FinalizeButton isFinalized={isFinalized} finalizing={finalizing} month={filterMonth} year={filterYear} onFinalize={finalize} onUnfinalize={unfinalize} />
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="outline" disabled={monthLogs.length === 0 || isPending || isFinalized}>
                <Trash2 className="mr-2 h-4 w-4" />Clear All
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear {MONTH_NAMES[selM - 1]} {selY} facility logs?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all {monthLogs.length} facility log{monthLogs.length === 1 ? "" : "s"} for {MONTH_NAMES[selM - 1]} {selY}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleClearAll}>
                Delete all
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog
          open={importOpen}
          onOpenChange={(o) => {
            setImportOpen(o);
            if (!o) resetImport();
          }}
        >
          <DialogTrigger render={<Button variant="outline" disabled={isFinalized}><Upload className="mr-2 h-4 w-4" />Import Excel</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Import Facility Logs from Excel</DialogTitle></DialogHeader>
            <form onSubmit={handleImport} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="file">Excel file (.xlsx, .xls, .csv)</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  required
                />
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Expected columns (Microsoft Forms export):</p>
                <table className="w-full mt-1 border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 pr-3 font-medium text-foreground">Column header in file</th>
                      <th className="text-left py-1 font-medium text-foreground">Maps to</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="py-0.5 pr-3"><code>Please enter the date.</code></td><td>Date</td></tr>
                    <tr><td className="py-0.5 pr-3"><code>Start time</code></td><td>Time</td></tr>
                    <tr><td className="py-0.5 pr-3"><code>Please enter your name/s.</code></td><td>Personnel Present</td></tr>
                  </tbody>
                </table>
                <p className="mt-1">Other columns are ignored. Column order does not matter.</p>
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
                      <summary className="cursor-pointer text-muted-foreground">View {importResult.errors.length} row error(s)</summary>
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
        <Button onClick={() => { setPrefillDate(""); setFormError(null); setOpen(true); }} disabled={isFinalized}>
          <Plus className="mr-2 h-4 w-4" />Log Check
        </Button>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPrefillDate(""); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Log Facility Check</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  key={prefillDate}
                  defaultValue={prefillDate}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timeSubmitted">Time</Label>
                <Input id="timeSubmitted" name="timeSubmitted" type="time" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="personnelPresent">Personnel Present</Label>
                <Input id="personnelPresent" name="personnelPresent" placeholder="Name(s) present" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proofImage">Proof image (optional)</Label>
                <Input
                  id="proofImage"
                  name="proofImage"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                />
                <p className="text-xs text-muted-foreground">PNG, JPEG, WebP, or GIF. Max 8 MB.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea id="remarks" name="remarks" rows={2} />
              </div>
              {formError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {formError}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* ── Month / year selector ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Month</Label>
          <Select value={filterMonth} onValueChange={(v) => v !== null && setFilterMonth(v)}>
            <SelectTrigger className="w-40">
              <SelectValue>{(v) => MONTH_NAMES[Number(v) - 1] ?? v}</SelectValue>
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

      {/* ── Summary widgets ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Number of Days */}
        <div className="rounded-lg border bg-card px-5 py-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Number of Days
          </span>
          <span className="text-3xl font-bold">{numberOfDays}</span>
          <span className="text-xs text-muted-foreground">
            Weekdays in {MONTH_NAMES[selM - 1]} {selY}
          </span>
        </div>

        {/* Missed Days */}
        <div className={`rounded-lg border px-5 py-4 flex flex-col gap-1 ${missedDays > 0 ? "bg-red-50 border-red-200" : "bg-card"}`}>
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Missed Days
          </span>
          <span className={`text-3xl font-bold ${missedDays > 0 ? "text-red-600" : ""}`}>
            {missedDays}
          </span>
          <span className="text-xs text-muted-foreground">
            Weekdays with no entry
          </span>
        </div>

        {/* Facility compliance rate */}
        <div className={`rounded-lg border px-5 py-4 flex flex-col gap-1 ${facilityRate < 1 ? "bg-orange-50 border-orange-200" : "bg-card"}`}>
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Facility
          </span>
          <span className={`text-3xl font-bold ${facilityRate < 1 ? "text-orange-600" : "text-green-600"}`}>
            {(facilityRate * 100).toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">
            (Number of Days − Missed Days) / Number of Days
          </span>
        </div>
      </div>

      {/* ── Full-month table ──────────────────────────────────────────────────── */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Personnel Present</TableHead>
            <TableHead>Remarks</TableHead>
            <TableHead>Proof</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {allMonthDays.map(({ date, dow, isWeekend }) => {
            const dayLabel = DOW_NAMES[dow];
            const dayLogs  = logsByDate.get(date) ?? [];

            // Weekend with no entry — greyed placeholder (not counted in widgets)
            if (isWeekend && dayLogs.length === 0) {
              return (
                <TableRow key={date} className="bg-muted/20">
                  <TableCell className="text-muted-foreground">
                    <span className="font-medium">{date}</span>
                    <span className="ml-2 text-xs">{dayLabel}</span>
                  </TableCell>
                  <TableCell colSpan={5} className="text-xs text-muted-foreground italic">
                    Weekend
                  </TableCell>
                </TableRow>
              );
            }

            // Weekday tagged as No Work — greyed, not counted in widgets
            if (noWorkDates.has(date) && dayLogs.length === 0) {
              return (
                <TableRow key={date} className="bg-muted/30">
                  <TableCell className="text-muted-foreground">
                    <span className="font-medium">{date}</span>
                    <span className="ml-2 text-xs">{dayLabel}</span>
                  </TableCell>
                  <TableCell colSpan={4} className="text-xs text-muted-foreground italic">
                    <span className="inline-flex items-center gap-1">
                      <CalendarOff className="h-3 w-3" />
                      No Work
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground"
                        disabled={isPending}
                        onClick={() => startTransition(async () => {
                          await unmarkDayNoWork(date);
                          await load();
                        })}
                      >
                        Undo
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            }

            // Weekday with no entry — highlighted as missed
            if (dayLogs.length === 0) {
              return (
                <TableRow key={date} className="bg-red-50">
                  <TableCell>
                    <span className="font-medium">{date}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{dayLabel}</span>
                  </TableCell>
                  <TableCell colSpan={4} className="text-xs text-red-500 italic">
                    No entry
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={isPending || isFinalized}
                        aria-label="Add entry"
                        onClick={() => {
                          setPrefillDate(date);
                          setFormError(null);
                          setOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground"
                        disabled={isPending || isFinalized}
                        aria-label="Mark as No Work"
                        onClick={() => startTransition(async () => {
                          await markDayNoWork(date);
                          await load();
                        })}
                      >
                        <CalendarOff className="h-3.5 w-3.5 mr-1" />
                        No Work
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            }

            // Weekday with one or more log entries
            return dayLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  <span className="font-medium">{log.date}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{dayLabel}</span>
                </TableCell>
                <TableCell>{log.timeSubmitted ? log.timeSubmitted.slice(0, 5) : "—"}</TableCell>
                <TableCell>{log.personnelPresent ?? "—"}</TableCell>
                <TableCell className="max-w-48 truncate">{log.remarks ?? "—"}</TableCell>
                <TableCell>
                  {log.proofImageUrl ? (
                    <a href={log.proofImageUrl} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={log.proofImageUrl}
                        alt="Proof"
                        className="h-10 w-10 rounded object-cover border"
                      />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {log.source === "manual" && (
                      <Button size="icon" variant="ghost" onClick={() => openEdit(log)} disabled={isPending || isFinalized} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(log.id)} disabled={isPending || isFinalized} aria-label="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ));
          })}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Facility Log</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-date">Date</Label>
                <Input id="edit-date" name="date" type="date" defaultValue={editing.date} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-timeSubmitted">Time</Label>
                <Input
                  id="edit-timeSubmitted"
                  name="timeSubmitted"
                  type="time"
                  defaultValue={editing.timeSubmitted ? editing.timeSubmitted.slice(0, 5) : ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-personnelPresent">Personnel Present</Label>
                <Input
                  id="edit-personnelPresent"
                  name="personnelPresent"
                  placeholder="Name(s) present"
                  defaultValue={editing.personnelPresent ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Proof image</Label>
                {editing.proofImageUrl && !removeProof && (
                  <div className="flex items-center gap-3 rounded-md border p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={editing.proofImageUrl}
                      alt="Current proof"
                      className="h-16 w-16 rounded object-cover border"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRemoveProof(true)}
                    >
                      Remove
                    </Button>
                  </div>
                )}
                {removeProof && (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>Existing image will be removed on save.</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveProof(false)}>
                      Undo
                    </Button>
                  </div>
                )}
                <Input
                  id="edit-proofImage"
                  name="proofImage"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                />
                <p className="text-xs text-muted-foreground">Upload a new image to replace the current one. Max 8 MB.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-remarks">Remarks</Label>
                <Textarea
                  id="edit-remarks"
                  name="remarks"
                  rows={2}
                  defaultValue={editing.remarks ?? ""}
                />
              </div>
              {formError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {formError}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Saving…" : "Save changes"}
              </Button>
            </form>
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
