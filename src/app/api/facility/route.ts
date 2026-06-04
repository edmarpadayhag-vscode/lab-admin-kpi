import { db } from "@/lib/db";
import { facilityLogs, employees } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
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
      proofImageUrl: facilityLogs.proofImageUrl,
      source: facilityLogs.source,
      createdAt: facilityLogs.createdAt,
    })
    .from(facilityLogs)
    .leftJoin(employees, eq(facilityLogs.submittedBy, employees.id))
    .orderBy(asc(facilityLogs.date), asc(facilityLogs.id));
  return NextResponse.json(rows);
}
