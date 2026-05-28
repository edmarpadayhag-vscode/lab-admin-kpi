"use server";

import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createEmployee(data: {
  name: string;
  email: string;
  role: "lab_admin" | "trainer" | "qa";
  department: string;
}) {
  await db.insert(employees).values(data);
  revalidatePath("/employees");
}

export async function updateEmployee(
  id: number,
  data: {
    name: string;
    email: string;
    role: "lab_admin" | "trainer" | "qa";
    department: string;
  }
) {
  await db.update(employees).set(data).where(eq(employees.id, id));
  revalidatePath("/employees");
}

export async function deactivateEmployee(id: number) {
  await db.update(employees).set({ isActive: false }).where(eq(employees.id, id));
  revalidatePath("/employees");
}

export async function reactivateEmployee(id: number) {
  await db.update(employees).set({ isActive: true }).where(eq(employees.id, id));
  revalidatePath("/employees");
}
