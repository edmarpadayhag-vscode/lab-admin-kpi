"use client";

import { useEffect, useState, useTransition } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Star } from "lucide-react";
import { createEsatFeedback, deleteEsatFeedback } from "./actions";
import type { Employee } from "@/types/employee";

type Feedback = {
  id: number;
  staffId: number;
  staffName: string;
  score: number;
  productWorking: boolean;
  equivalentScore: number | null;
  remarks: string | null;
  submittedAt: string;
};

export default function EsatPage() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [open, setOpen] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [productWorking, setProductWorking] = useState("true");
  const [isPending, startTransition] = useTransition();

  async function load() {
    const [fbRes, empRes] = await Promise.all([
      fetch("/api/esat").then((r) => r.json()),
      fetch("/api/employees").then((r) => r.json()),
    ]);
    setFeedback(fbRes);
    setEmployees(empRes.filter((e: Employee) => e.isActive));
  }

  useEffect(() => { load(); }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const get = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    startTransition(async () => {
      await createEsatFeedback({
        staffId: Number(staffId),
        score: Number(get("score")),
        productWorking: productWorking === "true",
        equivalentScore: get("equivalentScore") ? Number(get("equivalentScore")) : null,
        remarks: get("remarks"),
      });
      setOpen(false);
      setStaffId("");
      setProductWorking("true");
      load();
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteEsatFeedback(id);
      load();
    });
  }

  function renderStars(score: number) {
    return Array.from({ length: 5 }, (_, i) => (
      <Star key={i} className={`inline h-3.5 w-3.5 ${i < score ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
    ));
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold">ESAT Feedback</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button><Plus className="mr-2 h-4 w-4" />Add Feedback</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Add ESAT Feedback</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Staff Member</Label>
                <Select value={staffId} onValueChange={(v) => v !== null && setStaffId(v)}>
                  <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="score">Score (1–5)</Label>
                  <Input id="score" name="score" type="number" min={1} max={5} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="equivalentScore">Equivalent Score</Label>
                  <Input id="equivalentScore" name="equivalentScore" type="number" step="0.01" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Product Working?</Label>
                <Select value={productWorking} onValueChange={(v) => v !== null && setProductWorking(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea id="remarks" name="remarks" rows={2} />
              </div>
              <Button type="submit" className="w-full" disabled={isPending || !staffId}>
                {isPending ? "Saving…" : "Submit Feedback"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Product Working</TableHead>
            <TableHead>Equivalent Score</TableHead>
            <TableHead>Remarks</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {feedback.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No feedback yet.
              </TableCell>
            </TableRow>
          )}
          {feedback.map((fb) => (
            <TableRow key={fb.id}>
              <TableCell className="font-medium">{fb.staffName}</TableCell>
              <TableCell>{renderStars(fb.score)}</TableCell>
              <TableCell>{fb.productWorking ? "Yes" : "No"}</TableCell>
              <TableCell>{fb.equivalentScore ?? "—"}</TableCell>
              <TableCell className="max-w-48 truncate">{fb.remarks ?? "—"}</TableCell>
              <TableCell>{new Date(fb.submittedAt).toLocaleDateString()}</TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(fb.id)} disabled={isPending}>
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
