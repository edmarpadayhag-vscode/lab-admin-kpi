import { db } from "@/lib/db";
import { tasks, employees } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      requestedBy: tasks.requestedBy,
      assignedTo: tasks.assignedTo,
      assigneeName: employees.name,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      completedDate: tasks.completedDate,
      status: tasks.status,
      priority: tasks.priority,
      remarks: tasks.remarks,
    })
    .from(tasks)
    .innerJoin(employees, eq(tasks.assignedTo, employees.id))
    .orderBy(desc(tasks.dueDate));
  return NextResponse.json(rows);
}
