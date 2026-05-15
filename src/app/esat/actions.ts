"use server";

import { db } from "@/lib/db";
import { esatFeedback } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createEsatFeedback(data: {
  staffId: number;
  score: number;
  productWorking: boolean;
  equivalentScore: number | null;
  remarks: string;
}) {
  await db.insert(esatFeedback).values(data);
  revalidatePath("/esat");
}

export async function deleteEsatFeedback(id: number) {
  await db.delete(esatFeedback).where(eq(esatFeedback.id, id));
  revalidatePath("/esat");
}
