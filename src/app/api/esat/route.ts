import { db } from "@/lib/db";
import { esatFeedback, employees } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawType = searchParams.get("type");
  const esatType = rawType === "client" ? "client" : "agents";

  try {
    const rows = await db
      .select({
        id: esatFeedback.id,
        staffId: esatFeedback.staffId,
        staffName: employees.name,
        score: esatFeedback.score,
        equivalentScore: esatFeedback.equivalentScore,
        remarks: esatFeedback.remarks,
        rater: esatFeedback.rater,
        submittedAt: esatFeedback.submittedAt,
      })
      .from(esatFeedback)
      .innerJoin(employees, eq(esatFeedback.staffId, employees.id))
      .where(eq(esatFeedback.esatType, esatType))
      .orderBy(asc(esatFeedback.submittedAt), asc(esatFeedback.id));
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[GET /api/esat]", err);
    return NextResponse.json(
      { error: "Failed to load ESAT feedback. Run `npx drizzle-kit push` if the schema has not been migrated." },
      { status: 500 }
    );
  }
}
