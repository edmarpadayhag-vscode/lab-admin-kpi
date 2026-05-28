import { db } from "@/lib/db";
import { employeeSchedules } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = parseInt(searchParams.get("employeeId") ?? "");
  const month      = parseInt(searchParams.get("month") ?? "");
  const year       = parseInt(searchParams.get("year") ?? "");

  if (isNaN(employeeId) || isNaN(month) || isNaN(year)) {
    return NextResponse.json({ schedule: null });
  }

  const [row] = await db
    .select({ schedule: employeeSchedules.schedule, restDays: employeeSchedules.restDays })
    .from(employeeSchedules)
    .where(and(
      eq(employeeSchedules.employeeId, employeeId),
      eq(employeeSchedules.month, month),
      eq(employeeSchedules.year, year),
    ))
    .limit(1);

  return NextResponse.json({
    schedule: row?.schedule ?? null,
    restDays: row?.restDays ? JSON.parse(row.restDays) as number[] : [],
  });
}
