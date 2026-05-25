import { db } from "@/lib/db";
import { esatFeedback, employees } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await db
    .select({
      id: esatFeedback.id,
      staffId: esatFeedback.staffId,
      staffName: employees.name,
      score: esatFeedback.score,
      remarks: esatFeedback.remarks,
      submittedAt: esatFeedback.submittedAt,
    })
    .from(esatFeedback)
    .innerJoin(employees, eq(esatFeedback.staffId, employees.id))
    .orderBy(asc(esatFeedback.submittedAt), asc(esatFeedback.id));
  return NextResponse.json(rows);
}
