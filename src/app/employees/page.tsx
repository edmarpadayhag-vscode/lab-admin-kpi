"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { EmployeeForm } from "@/components/employees/employee-form";
import { EmployeeTable } from "@/components/employees/employee-table";
import { Plus } from "lucide-react";
import type { Employee } from "@/types/employee";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  async function load() {
    const res = await fetch("/api/employees");
    const data = await res.json();
    setEmployees(data);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold">Employees</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Employee
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Employee</DialogTitle>
            </DialogHeader>
            <EmployeeForm
              onSuccess={() => {
                setOpen(false);
                startTransition(() => load());
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <EmployeeTable
        employees={employees}
      />
    </div>
  );
}
