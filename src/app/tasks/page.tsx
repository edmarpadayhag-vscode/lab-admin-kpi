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
import { Trash2, Upload } from "lucide-react";
import { deleteTask, clearAllTasks } from "./actions";

type Task = {
  id: number;
  title: string;
  description: string | null;
  requestedBy: string | null;
  assignedTo: number;
  assigneeName: string;
  startDate: string;
  dueDate: string;
  completedDate: string | null;
  status: string;
  priority: string;
  remarks: string | null;
};

type ImportResult = {
  inserted: number;
  skipped: number;
  total: number;
  errors: { row: number; message: string }[];
};

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  in_progress: "default",
  completed: "secondary",
  overdue: "destructive",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  overdue: "Overdue",
};

export default function TasksPage() {
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [isPending, startTransition] = useTransition();

  // filter
  const [filterName, setFilterName] = useState("");

  // import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function load() {
    const res = await fetch("/api/tasks").then((r) => r.json());
    setTaskList(res);
  }

  useEffect(() => { load(); }, []);

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteTask(id);
      load();
    });
  }

  function handleClearAll() {
    startTransition(async () => {
      await clearAllTasks();
      setFilterName("");
      await load();
      setToast("All tasks cleared");
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
      const res = await fetch("/api/tasks/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Import failed");
      } else {
        setImportResult(data);
        if (data.inserted > 0) {
          await load();
          setToast(`${data.inserted} task${data.inserted === 1 ? "" : "s"} imported`);
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

  // ── derived ──────────────────────────────────────────────────────────────────
  const employeeNames = Array.from(new Set(taskList.map((t) => t.assigneeName))).sort();

  const displayed = filterName && filterName !== "all"
    ? taskList.filter((t) => t.assigneeName === filterName)
    : taskList;

  // ── summary metrics (follow the filter) ──────────────────────────────────────
  const totalTasks      = displayed.length;
  const totalCompleted  = displayed.filter((t) => t.status === "completed").length;
  const completedOnTime = displayed.filter(
    (t) => t.status === "completed" && t.completedDate != null && t.completedDate <= t.dueDate
  ).length;
  const delayedTasks    = displayed.filter(
    (t) =>
      t.status === "overdue" ||
      (t.status === "completed" && t.completedDate != null && t.completedDate > t.dueDate)
  ).length;
  const notCompleted    = totalTasks - totalCompleted;
  const tor             = totalCompleted > 0 ? (completedOnTime / totalCompleted) * 100 : null;
  const tc              = totalTasks     > 0 ? (totalCompleted  / totalTasks)     * 100 : null;

  const fmt = (n: number | null) => n === null ? "—" : `${n.toFixed(1)}%`;

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* ── toolbar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold">Tasks</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Clear All */}
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="outline" disabled={isPending || taskList.length === 0}>
                  Clear All
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all tasks?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all {taskList.length} task{taskList.length !== 1 ? "s" : ""}. This action cannot be undone.
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

          {/* Import */}
          <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) resetImport(); }}>
            <DialogTrigger render={<Button><Upload className="mr-2 h-4 w-4" />Import Excel</Button>} />
            <DialogContent>
              <DialogHeader><DialogTitle>Import Tasks from Excel</DialogTitle></DialogHeader>
              <form onSubmit={handleImport} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tasks-file">Excel file (.xlsx, .xls, .csv)</Label>
                  <Input
                    id="tasks-file"
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    required
                  />
                </div>
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Expected columns:</p>
                  <div className="space-y-0.5">
                    <p><span className="font-medium text-foreground">Tasks</span> — <code>Task</code> or <code>Title</code></p>
                    <p><span className="font-medium text-foreground">Date Started</span> — <code>Date Started</code> or <code>Start Date</code></p>
                    <p><span className="font-medium text-foreground">Due Date</span> — <code>Due Date</code></p>
                    <p><span className="font-medium text-foreground">Date Completed</span> — <code>Date Completed</code> <span className="italic">(optional)</span></p>
                    <p><span className="font-medium text-foreground">Requested By</span> — <code>Requested By</code> <span className="italic">(optional)</span></p>
                    <p><span className="font-medium text-foreground">Requested To</span> — <code>Requested To</code> or <code>Assigned To</code></p>
                    <p><span className="font-medium text-foreground">Status</span> — <code>Status</code> <span className="italic">(optional, defaults to Pending)</span></p>
                  </div>
                  <p className="pt-1">Requested To must match an employee name. Other columns are ignored.</p>
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

      {/* ── summary cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: "Required Tasks",               value: totalTasks,       red: false },
          { label: "Delayed Tasks",                value: delayedTasks,     red: delayedTasks > 0 },
          { label: "Completed Tasks On Time",      value: completedOnTime,  red: false },
          { label: "Total Completed Tasks",        value: totalCompleted,   red: false },
          { label: "Total Not Completed Tasks",    value: notCompleted,     red: notCompleted > 0 },
          { label: "Timeliness of Response (TOR)", value: fmt(tor),         red: tor !== null && tor < 100 },
          { label: "Task Completion (TC)",         value: fmt(tc),          red: tc  !== null && tc  < 100 },
        ].map(({ label, value, red }) => (
          <div key={label} className="rounded-lg border bg-card p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground leading-tight">{label}</span>
            <span className={`text-2xl font-bold tracking-tight ${red ? "text-destructive" : ""}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* ── employee filter ── */}
      <div className="flex items-center gap-3 max-w-xs">
        <Select value={filterName || "all"} onValueChange={(v) => v !== null && setFilterName(v === "all" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder="All Employees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employeeNames.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── table ── */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date Started</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Date Completed</TableHead>
            <TableHead>Tasks</TableHead>
            <TableHead>Requested By</TableHead>
            <TableHead>Requested To</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayed.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                {taskList.length === 0
                  ? "No tasks yet. Import an Excel file to get started."
                  : "No tasks match the current filter."}
              </TableCell>
            </TableRow>
          )}
          {displayed.map((task) => (
            <TableRow key={task.id}>
              <TableCell>{task.startDate}</TableCell>
              <TableCell>{task.dueDate}</TableCell>
              <TableCell>{task.completedDate ?? "—"}</TableCell>
              <TableCell className="font-medium max-w-48 truncate">{task.title}</TableCell>
              <TableCell>{task.requestedBy ?? "—"}</TableCell>
              <TableCell>{task.assigneeName}</TableCell>
              <TableCell>
                <Badge variant={statusColors[task.status] ?? "outline"}>
                  {statusLabels[task.status] ?? task.status}
                </Badge>
              </TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(task.id)} disabled={isPending}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
