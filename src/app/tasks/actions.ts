"use server";

import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createTask(data: {
  title: string;
  description: string;
  requestedBy: string;
  assignedTo: number;
  startDate: string;
  dueDate: string;
  priority: "low" | "medium" | "high";
  remarks: string;
}) {
  await db.insert(tasks).values({ ...data, status: "pending" });
  revalidatePath("/tasks");
}

export async function updateTaskStatus(
  id: number,
  status: "pending" | "in_progress" | "completed" | "overdue",
  completedDate?: string
) {
  await db
    .update(tasks)
    .set({ status, completedDate: completedDate ?? null, updatedAt: new Date() })
    .where(eq(tasks.id, id));
  revalidatePath("/tasks");
}

export async function updateTask(
  id: number,
  data: {
    title: string;
    description: string;
    requestedBy: string;
    assignedTo: number;
    startDate: string;
    dueDate: string;
    priority: "low" | "medium" | "high";
    remarks: string;
  }
) {
  await db.update(tasks).set({ ...data, updatedAt: new Date() }).where(eq(tasks.id, id));
  revalidatePath("/tasks");
}

export async function deleteTask(id: number) {
  await db.delete(tasks).where(eq(tasks.id, id));
  revalidatePath("/tasks");
}

export async function clearAllTasks() {
  await db.delete(tasks);
  revalidatePath("/tasks");
}
