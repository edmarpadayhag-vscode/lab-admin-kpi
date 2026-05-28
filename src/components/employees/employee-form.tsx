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

type Role = "lab_admin" | "trainer" | "qa";

interface Props {
  employee?: Employee;
  onSuccess: () => void;
}

export function EmployeeForm({ employee, onSuccess }: Props) {
  const [role, setRole] = useState<Role>((employee?.role as Role) ?? "lab_admin");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = {
      name:       (form.elements.namedItem("name")       as HTMLInputElement).value,
      email:      (form.elements.namedItem("email")      as HTMLInputElement).value,
      role,
      department: (form.elements.namedItem("department") as HTMLInputElement).value,
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
        <Select value={role} onValueChange={(v) => v !== null && setRole(v as Role)}>
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lab_admin">Lab Admin</SelectItem>
            <SelectItem value="trainer">Trainer</SelectItem>
            <SelectItem value="qa">QA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="department">Department</Label>
        <Input id="department" name="department" defaultValue={employee?.department ?? ""} />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving…" : employee ? "Update Employee" : "Add Employee"}
      </Button>
    </form>
  );
}
