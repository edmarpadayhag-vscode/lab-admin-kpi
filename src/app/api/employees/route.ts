import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { NextResponse } from "next/server";

export async function GET() {
  const result = await db.select().from(employees).orderBy(employees.name);
  return NextResponse.json(result);
}
