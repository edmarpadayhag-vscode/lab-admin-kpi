import { db } from "@/lib/db";
import { attendanceLogs, employees } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await db
    .select({
      id: attendanceLogs.id,
      workDate: attendanceLogs.workDate,
      schedule: attendanceLogs.schedule,
      expectedTimeIn: attendanceLogs.expectedTimeIn,
      expectedTimeOut: attendanceLogs.expectedTimeOut,
      actualTimeIn: attendanceLogs.actualTimeIn,
      actualTimeOut: attendanceLogs.actualTimeOut,
      lateMinutes: attendanceLogs.lateMinutes,
      remarks: attendanceLogs.remarks,
      employeeId: attendanceLogs.employeeId,
      employeeName: employees.name,
    })
    .from(attendanceLogs)
    .innerJoin(employees, eq(attendanceLogs.employeeId, employees.id))
    .orderBy(desc(attendanceLogs.workDate));
  return NextResponse.json(rows);
}
