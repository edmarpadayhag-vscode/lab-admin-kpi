import { db } from "@/lib/db";
import { facilityLogs, employees } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await db
    .select({
      id: facilityLogs.id,
      date: facilityLogs.date,
      submittedBy: facilityLogs.submittedBy,
      submittedByName: employees.name,
      timeSubmitted: facilityLogs.timeSubmitted,
      personnelPresent: facilityLogs.personnelPresent,
      status: facilityLogs.status,
      remarks: facilityLogs.remarks,
      createdAt: facilityLogs.createdAt,
    })
    .from(facilityLogs)
    .innerJoin(employees, eq(facilityLogs.submittedBy, employees.id))
    .orderBy(desc(facilityLogs.date));
  return NextResponse.json(rows);
}
