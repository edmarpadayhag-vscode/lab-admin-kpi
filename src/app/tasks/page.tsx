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
import { createTask, updateTaskStatus, deleteTask } from "./actions";
import type { Employee } from "@/types/employee";

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

type Priority = "low" | "medium" | "high";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  in_progress: "default",
  completed: "secondary",
  overdue: "destructive",
};

const priorityColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "outline",
  high: "destructive",
};

export default function TasksPage() {
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [open, setOpen] = useState(false);
  const [priority, setPriority] = useState<Priority>("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [isPending, startTransition] = useTransition();

  async function load() {
    const [tasksRes, empRes] = await Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch("/api/employees").then((r) => r.json()),
    ]);
    setTaskList(tasksRes);
    setEmployees(empRes.filter((e: Employee) => e.isActive));
  }

  useEffect(() => { load(); }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const get = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    startTransition(async () => {
      await createTask({
        title: get("title"),
        description: get("description"),
        requestedBy: get("requestedBy"),
        assignedTo: Number(assignedTo),
        startDate: get("startDate"),
        dueDate: get("dueDate"),
        priority,
        remarks: get("remarks"),
      });
      setOpen(false);
      setPriority("medium");
      setAssignedTo("");
      load();
    });
  }

  function handleStatusChange(id: number, status: string) {
    const completedDate = status === "completed" ? new Date().toISOString().slice(0, 10) : undefined;
    startTransition(async () => {
      await updateTaskStatus(id, status as "pending" | "in_progress" | "completed" | "overdue", completedDate);
      load();
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteTask(id);
      load();
    });
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold">Tasks (TOR)</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button><Plus className="mr-2 h-4 w-4" />Add Task</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="requestedBy">Requested By</Label>
                  <Input id="requestedBy" name="requestedBy" />
                </div>
                <div className="space-y-1.5">
                  <Label>Assigned To</Label>
                  <Select value={assignedTo} onValueChange={(v) => v !== null && setAssignedTo(v)}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input id="startDate" name="startDate" type="date" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input id="dueDate" name="dueDate" type="date" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea id="remarks" name="remarks" rows={2} />
              </div>
              <Button type="submit" className="w-full" disabled={isPending || !assignedTo}>
                {isPending ? "Saving…" : "Add Task"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead>Requested By</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {taskList.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No tasks yet.
              </TableCell>
            </TableRow>
          )}
          {taskList.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="font-medium max-w-48 truncate">{task.title}</TableCell>
              <TableCell>{task.assigneeName}</TableCell>
              <TableCell>{task.requestedBy ?? "—"}</TableCell>
              <TableCell>{task.dueDate}</TableCell>
              <TableCell>
                <Badge variant={priorityColors[task.priority] ?? "outline"}>
                  {task.priority}
                </Badge>
              </TableCell>
              <TableCell>
                <Select
                  value={task.status}
                  onValueChange={(v) => v !== null && handleStatusChange(task.id, v)}
                >
                  <SelectTrigger className="h-7 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
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
    </div>
  );
}
