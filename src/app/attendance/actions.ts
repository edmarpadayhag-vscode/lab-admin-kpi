"use server";

import { db } from "@/lib/db";
import { attendanceLogs, employees, employeeSchedules } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
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
  if (input.schedule === "1stHalf Absent" || input.schedule === "2ndHalf Absent" || input.schedule === "Half Day PTO") {
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

export async function clearAllAttendanceLogs(
  month: number,
  year: number,
  employeeId?: number,
) {
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDayNum = new Date(year, month, 0).getDate();
  const lastDay   = `${year}-${String(month).padStart(2, "0")}-${String(lastDayNum).padStart(2, "0")}`;

  const conditions = [
    gte(attendanceLogs.workDate, firstDay),
    lte(attendanceLogs.workDate, lastDay),
  ];
  if (employeeId) conditions.push(eq(attendanceLogs.employeeId, employeeId));

  await db.delete(attendanceLogs).where(and(...conditions));
  revalidatePath("/attendance");
}

export async function upsertEmployeeSchedule(
  employeeId: number,
  month: number,
  year: number,
  schedule: string,
  restDays: number[] = [],
) {
  await db
    .insert(employeeSchedules)
    .values({ employeeId, month, year, schedule, restDays: JSON.stringify(restDays) })
    .onConflictDoUpdate({
      target: [employeeSchedules.employeeId, employeeSchedules.month, employeeSchedules.year],
      set: { schedule, restDays: JSON.stringify(restDays) },
    });
  revalidatePath("/attendance");
}

/** Re-stamp Expected In/Out on all attendance logs for the employee's month
 *  using the saved monthly schedule and rest days. */
export async function applyMonthlySchedule(
  employeeId: number,
  month: number,
  year: number,
) {
  const [sched] = await db
    .select()
    .from(employeeSchedules)
    .where(and(
      eq(employeeSchedules.employeeId, employeeId),
      eq(employeeSchedules.month, month),
      eq(employeeSchedules.year, year),
    ))
    .limit(1);

  if (!sched) return;

  const monthlySchedule = sched.schedule;
  const restDaySet: number[] = JSON.parse(sched.restDays || "[]");

  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDayNum = new Date(year, month, 0).getDate();
  const lastDay   = `${year}-${String(month).padStart(2, "0")}-${String(lastDayNum).padStart(2, "0")}`;

  const logs = await db
    .select()
    .from(attendanceLogs)
    .where(and(
      eq(attendanceLogs.employeeId, employeeId),
      gte(attendanceLogs.workDate, firstDay),
      lte(attendanceLogs.workDate, lastDay),
    ));

  const KEEP_UNCHANGED = ["PTO", "SL", "Holiday Off", "1stHalf Absent", "2ndHalf Absent", "Half Day PTO"];

  for (const log of logs) {
    if (KEEP_UNCHANGED.includes(log.schedule)) continue;

    // Determine the day-of-week for this log date
    const [ly, lm, ld] = log.workDate.split("-").map(Number);
    const dow = new Date(ly, lm - 1, ld).getDay();
    const isRestDay = restDaySet.includes(dow);

    if (isRestDay) {
      await db.update(attendanceLogs)
        .set({ schedule: "OFF", expectedTimeIn: null, expectedTimeOut: null, lateMinutes: 0 })
        .where(eq(attendanceLogs.id, log.id));
    } else {
      const newExpectedOut = expectedOut(monthlySchedule);
      const newLate = calcLateMinutes(monthlySchedule, log.actualTimeIn);
      await db.update(attendanceLogs)
        .set({
          schedule: monthlySchedule,
          expectedTimeIn: monthlySchedule,
          expectedTimeOut: newExpectedOut,
          lateMinutes: newLate,
        })
        .where(eq(attendanceLogs.id, log.id));
    }
  }

  revalidatePath("/attendance");
}
