"use client";

import { useEffect, useState, useTransition } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { createFacilityLog, deleteFacilityLog } from "./actions";
import type { Employee } from "@/types/employee";

type Log = {
  id: number;
  date: string;
  submittedBy: number;
  submittedByName: string;
  timeSubmitted: string | null;
  personnelPresent: boolean;
  status: string;
  remarks: string | null;
};

type Status = "compliant" | "non_compliant" | "off";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  compliant: "default",
  non_compliant: "destructive",
  off: "secondary",
};

export default function FacilityPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [open, setOpen] = useState(false);
  const [submittedBy, setSubmittedBy] = useState("");
  const [status, setStatus] = useState<Status>("compliant");
  const [personnelPresent, setPersonnelPresent] = useState("true");
  const [isPending, startTransition] = useTransition();

  async function load() {
    const [logsRes, empRes] = await Promise.all([
      fetch("/api/facility").then((r) => r.json()),
      fetch("/api/employees").then((r) => r.json()),
    ]);
    setLogs(logsRes);
    setEmployees(empRes.filter((e: Employee) => e.isActive));
  }

  useEffect(() => { load(); }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const get = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    startTransition(async () => {
      await createFacilityLog({
        date: get("date"),
        submittedBy: Number(submittedBy),
        timeSubmitted: get("timeSubmitted"),
        personnelPresent: personnelPresent === "true",
        status,
        remarks: get("remarks"),
      });
      setOpen(false);
      setSubmittedBy("");
      setStatus("compliant");
      setPersonnelPresent("true");
      load();
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteFacilityLog(id);
      load();
    });
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold">Facility</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button><Plus className="mr-2 h-4 w-4" />Log Check</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Log Facility Check</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" name="date" type="date" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timeSubmitted">Time Submitted</Label>
                  <Input id="timeSubmitted" name="timeSubmitted" type="time" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Submitted By</Label>
                <Select value={submittedBy} onValueChange={(v) => v !== null && setSubmittedBy(v)}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compliant">Compliant</SelectItem>
                      <SelectItem value="non_compliant">Non-Compliant</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Personnel Present?</Label>
                  <Select value={personnelPresent} onValueChange={(v) => v !== null && setPersonnelPresent(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea id="remarks" name="remarks" rows={2} />
              </div>
              <Button type="submit" className="w-full" disabled={isPending || !submittedBy}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Submitted By</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Personnel Present</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Remarks</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No facility logs yet.
              </TableCell>
            </TableRow>
          )}
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{log.date}</TableCell>
              <TableCell>{log.submittedByName}</TableCell>
              <TableCell>{log.timeSubmitted ?? "—"}</TableCell>
              <TableCell>{log.personnelPresent ? "Yes" : "No"}</TableCell>
              <TableCell>
                <Badge variant={statusColors[log.status] ?? "outline"}>
                  {log.status.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell className="max-w-48 truncate">{log.remarks ?? "—"}</TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(log.id)} disabled={isPending}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
