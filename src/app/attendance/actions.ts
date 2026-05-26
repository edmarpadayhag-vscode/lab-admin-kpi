"use server";

import { db } from "@/lib/db";
import { attendanceLogs, employees } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { calcLateMinutes, expectedOut, isNonWorkSchedule } from "@/lib/attendance-utils";

type LogInput = {
  employeeId: number;
  workDate: string;
  schedule: string;
  actualTimeIn: string | null;
  actualTimeOut: string | null;
  remarks: string;
};

function buildRow(input: LogInput) {
  const nonWork = isNonWorkSchedule(input.schedule);
  return {
    employeeId: input.employeeId,
    workDate: input.workDate,
    schedule: input.schedule,
    expectedTimeIn:  nonWork ? null : input.schedule,
    expectedTimeOut: nonWork ? null : expectedOut(input.schedule),
    // Preserve actual times even for PTO/SL so they can be restored if the
    // user switches back to a regular schedule.
    actualTimeIn:  input.actualTimeIn  || null,
    actualTimeOut: input.actualTimeOut || null,
    lateMinutes: calcLateMinutes(input.schedule, input.actualTimeIn),
    remarks: input.remarks || null,
  };
}

export async function upsertAttendanceLog(input: LogInput) {
  const baseRow = buildRow(input);

  // Half-day types need expected times from the employee's regular schedule
  // because isNonWorkSchedule() returns true for them and buildRow would leave
  // expectedTimeIn/Out as null.
  let row = baseRow;
  if (input.schedule === "Half Day Absent" || input.schedule === "Half Day PTO") {
    const [emp] = await db
      .select({ expectedTimeIn: employees.expectedTimeIn })
      .from(employees)
      .where(eq(employees.id, input.employeeId));
    const empSchedule = emp?.expectedTimeIn
      ? String(emp.expectedTimeIn).slice(0, 5) // "08:00:00" → "08:00"
      : "08:00";
    row = {
      ...baseRow,
      expectedTimeIn:  empSchedule,
      expectedTimeOut: expectedOut(empSchedule),
    };
  }

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

export async function clearAllAttendanceLogs() {
  await db.delete(attendanceLogs);
  revalidatePath("/attendance");
}
