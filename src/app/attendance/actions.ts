"use server";

import { db } from "@/lib/db";
import { attendanceLogs, employees } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { calcLateMinutes, expectedOut } from "@/lib/attendance-utils";

type LogInput = {
  employeeId: number;
  workDate: string;
  schedule: string;
  actualTimeIn: string | null;
  actualTimeOut: string | null;
  remarks: string;
};

function buildRow(input: LogInput) {
  const isOff = input.schedule === "OFF";
  return {
    employeeId: input.employeeId,
    workDate: input.workDate,
    schedule: input.schedule,
    expectedTimeIn: isOff ? null : input.schedule,
    expectedTimeOut: isOff ? null : expectedOut(input.schedule),
    actualTimeIn: input.actualTimeIn || null,
    actualTimeOut: input.actualTimeOut || null,
    lateMinutes: calcLateMinutes(input.schedule, input.actualTimeIn),
    remarks: input.remarks || null,
  };
}

export async function upsertAttendanceLog(input: LogInput) {
  const row = buildRow(input);
  await db
    .insert(attendanceLogs)
    .values(row)
    .onConflictDoUpdate({
      target: [attendanceLogs.employeeId, attendanceLogs.workDate],
      set: {
        schedule: row.schedule,
        expectedTimeIn: row.expectedTimeIn,
        expectedTimeOut: row.expectedTimeOut,
        actualTimeIn: row.actualTimeIn,
        actualTimeOut: row.actualTimeOut,
        lateMinutes: row.lateMinutes,
        remarks: row.remarks,
      },
    });
  revalidatePath("/attendance");
}

export async function importAttendanceCSV(
  rows: { date: string; employee: string; schedule: string; actual_in: string; actual_out: string }[]
) {
  const allEmployees = await db.select({ id: employees.id, name: employees.name }).from(employees);
  const nameMap = new Map(allEmployees.map((e) => [e.name.toLowerCase(), e.id]));

  const errors: string[] = [];

  for (const row of rows) {
    // Skip blank rows
    if (!row.employee || !String(row.employee).trim()) continue;
    if (!row.date   || !String(row.date).trim())     continue;

    const employeeId = nameMap.get(String(row.employee).trim().toLowerCase());
    if (!employeeId) {
      errors.push(`Employee not found: "${row.employee}"`);
      continue;
    }
    await upsertAttendanceLog({
      employeeId,
      workDate: row.date,
      schedule: row.schedule || "08:00",
      actualTimeIn: row.actual_in || null,
      actualTimeOut: row.actual_out || null,
      remarks: "",
    });
  }

  revalidatePath("/attendance");
  return { imported: rows.length - errors.length, errors };
}

export async function deleteAttendanceLog(id: number) {
  await db.delete(attendanceLogs).where(eq(attendanceLogs.id, id));
  revalidatePath("/attendance");
}
