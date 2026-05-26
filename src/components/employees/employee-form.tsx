"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createEmployee, updateEmployee } from "@/app/employees/actions";
import type { Employee } from "@/types/employee";

type Role = "employee" | "manager" | "admin";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Props {
  employee?: Employee;
  onSuccess: () => void;
}

export function EmployeeForm({ employee, onSuccess }: Props) {
  const [role, setRole] = useState<Role>(employee?.role ?? "employee");
  const [restDay1, setRestDay1] = useState<string>(
    employee?.restDay1 != null ? String(employee.restDay1) : "none"
  );
  const [restDay2, setRestDay2] = useState<string>(
    employee?.restDay2 != null ? String(employee.restDay2) : "none"
  );
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      role,
      department: (form.elements.namedItem("department") as HTMLInputElement).value,
      expectedTimeIn: (form.elements.namedItem("expectedTimeIn") as HTMLInputElement).value,
      restDay1: restDay1 !== "none" ? Number(restDay1) : null,
      restDay2: restDay2 !== "none" ? Number(restDay2) : null,
    };

    startTransition(async () => {
      if (employee) {
        await updateEmployee(employee.id, data);
      } else {
        await createEmployee(data);
      }
      onSuccess();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Full Name</Label>
        <Input id="name" name="name" defaultValue={employee?.name} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={employee?.email} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="role">Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="employee">Employee</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="department">Department</Label>
        <Input id="department" name="department" defaultValue={employee?.department ?? ""} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="expectedTimeIn">Expected Time In</Label>
        <Input
          id="expectedTimeIn"
          name="expectedTimeIn"
          type="time"
          defaultValue={employee?.expectedTimeIn ?? "08:00"}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Rest Day 1</Label>
          <Select value={restDay1} onValueChange={(v) => v !== null && setRestDay1(v)}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {DAY_NAMES.map((day, i) => (
                <SelectItem key={i} value={String(i)}>{day}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Rest Day 2</Label>
          <Select value={restDay2} onValueChange={(v) => v !== null && setRestDay2(v)}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {DAY_NAMES.map((day, i) => (
                <SelectItem key={i} value={String(i)}>{day}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving…" : employee ? "Update Employee" : "Add Employee"}
      </Button>
    </form>
  );
}
