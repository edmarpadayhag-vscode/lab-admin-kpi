import { db } from "@/lib/db";
import { esatFeedback, employees } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await db
    .select({
      id: esatFeedback.id,
      staffId: esatFeedback.staffId,
      staffName: employees.name,
      score: esatFeedback.score,
      productWorking: esatFeedback.productWorking,
      equivalentScore: esatFeedback.equivalentScore,
      remarks: esatFeedback.remarks,
      submittedAt: esatFeedback.submittedAt,
    })
    .from(esatFeedback)
    .innerJoin(employees, eq(esatFeedback.staffId, employees.id))
    .orderBy(desc(esatFeedback.submittedAt));
  return NextResponse.json(rows);
}
