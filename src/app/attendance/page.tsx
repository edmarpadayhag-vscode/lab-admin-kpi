"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Upload, AlertCircle, Pencil } from "lucide-react";
import { upsertAttendanceLog, deleteAttendanceLog, importAttendanceCSV } from "./actions";
import { SCHEDULE_OPTIONS, expectedOut, parseCSV } from "@/lib/attendance-utils";
import type { Employee } from "@/types/employee";

type Log = {
  id: number;
  workDate: string;
  employeeId: number;
  employeeName: string;
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
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

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

  function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const rows = parseCSV(text) as {
        date: string; employee: string; schedule: string;
        actual_in: string; actual_out: string;
      }[];
      startTransition(async () => {
        const result = await importAttendanceCSV(rows);
        setCsvErrors(result.errors);
        load();
        if (fileRef.current) fileRef.current.value = "";
      });
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold">Attendance</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={isPending}>
            <Upload className="mr-2 h-4 w-4" />Import CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />

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

      {csvErrors.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm space-y-1">
          <p className="flex items-center gap-1.5 font-medium text-destructive">
            <AlertCircle className="h-4 w-4" /> {csvErrors.length} row(s) could not be imported
          </p>
          {csvErrors.map((err, i) => <p key={i} className="text-muted-foreground pl-5">{err}</p>)}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        CSV columns (case-insensitive): <code>date, employee, schedule, actual_in, actual_out</code>
        &nbsp;— existing records for the same employee + date will be overwritten.
      </p>

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
            <TableHead>Remarks</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                No attendance records yet. Add manually or import a CSV.
              </TableCell>
            </TableRow>
          )}
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{log.workDate}</TableCell>
              <TableCell className="font-medium">{log.employeeName}</TableCell>
              <TableCell>{log.schedule === "OFF" ? "OFF" : (log.expectedTimeIn ?? "—")}</TableCell>
              <TableCell>{log.expectedTimeOut ?? "—"}</TableCell>
              <TableCell>{log.actualTimeIn ?? "—"}</TableCell>
              <TableCell>{log.actualTimeOut ?? "—"}</TableCell>
              <TableCell>
                {log.schedule === "OFF" ? "—" : log.lateMinutes > 0
                  ? <span className="text-destructive font-medium">{log.lateMinutes}</span>
                  : "0"}
              </TableCell>
              <TableCell className="max-w-40 truncate">{log.remarks ?? "—"}</TableCell>
              <TableCell className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(log)} disabled={isPending}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(log.id)} disabled={isPending}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
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
    </div>
  );
}
