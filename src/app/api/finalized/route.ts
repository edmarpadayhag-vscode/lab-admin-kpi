import { db } from "@/lib/db";
import { finalizedModules } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const module = searchParams.get("module") ?? "";
  const month  = parseInt(searchParams.get("month") ?? "");
  const year   = parseInt(searchParams.get("year")  ?? "");

  if (!module || isNaN(month) || isNaN(year)) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(finalizedModules)
    .where(and(
      eq(finalizedModules.module, module),
      eq(finalizedModules.month,  month),
      eq(finalizedModules.year,   year),
    ))
    .limit(1);

  return NextResponse.json({
    finalized:   rows.length > 0,
    finalizedAt: rows[0]?.finalizedAt?.toISOString() ?? null,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { module?: string; month?: number; year?: number };

  if (!body.module || !body.month || !body.year) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  await db
    .insert(finalizedModules)
    .values({ module: body.module, month: body.month, year: body.year })
    .onConflictDoNothing();

  return NextResponse.json({ finalized: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const module = searchParams.get("module") ?? "";
  const month  = parseInt(searchParams.get("month") ?? "");
  const year   = parseInt(searchParams.get("year")  ?? "");

  if (!module || isNaN(month) || isNaN(year)) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  await db
    .delete(finalizedModules)
    .where(and(
      eq(finalizedModules.module, module),
      eq(finalizedModules.month,  month),
      eq(finalizedModules.year,   year),
    ));

  return NextResponse.json({ finalized: false });
}
