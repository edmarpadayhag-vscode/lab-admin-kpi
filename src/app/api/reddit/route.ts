import { db } from "@/lib/db";
import { redditActivity } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = parseInt(searchParams.get("employeeId") ?? "");
  const month      = parseInt(searchParams.get("month") ?? "");
  const year       = parseInt(searchParams.get("year") ?? "");

  if (isNaN(employeeId) || isNaN(month) || isNaN(year)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(redditActivity)
    .where(and(
      eq(redditActivity.employeeId, employeeId),
      eq(redditActivity.month, month),
      eq(redditActivity.year, year),
    ))
    .orderBy(redditActivity.weekNumber);

  return NextResponse.json(rows);
}
