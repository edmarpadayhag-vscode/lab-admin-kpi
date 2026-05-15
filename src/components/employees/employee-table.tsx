"use client";

import { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmployeeForm } from "./employee-form";
import { deactivateEmployee, reactivateEmployee } from "@/app/employees/actions";
import type { Employee } from "@/types/employee";

interface Props {
  employees: Employee[];
}

export function EmployeeTable({ employees }: Props) {
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deactivating, setDeactivating] = useState<Employee | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDeactivate() {
    if (!deactivating) return;
    startTransition(async () => {
      await deactivateEmployee(deactivating.id);
      setDeactivating(null);
    });
  }

  function handleReactivate(employee: Employee) {
    startTransition(async () => {
      await reactivateEmployee(employee.id);
    });
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Expected In</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No employees yet. Add your first team member.
              </TableCell>
            </TableRow>
          )}
          {employees.map((emp) => (
            <TableRow key={emp.id}>
              <TableCell className="font-medium">{emp.name}</TableCell>
              <TableCell>{emp.email}</TableCell>
              <TableCell className="capitalize">{emp.role}</TableCell>
              <TableCell>{emp.department ?? "—"}</TableCell>
              <TableCell>{emp.expectedTimeIn}</TableCell>
              <TableCell>
                <Badge variant={emp.isActive ? "default" : "secondary"}>
                  {emp.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(emp)}>
                  Edit
                </Button>
                {emp.isActive ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeactivating(emp)}
                    disabled={isPending}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReactivate(emp)}
                    disabled={isPending}
                  >
                    Reactivate
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          {editing && (
            <EmployeeForm employee={editing} onSuccess={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Deactivate confirmation */}
      <AlertDialog open={!!deactivating} onOpenChange={(open) => !open && setDeactivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivating?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide them from active lists but preserve all their records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} disabled={isPending}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
