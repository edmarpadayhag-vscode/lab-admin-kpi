"use server";

import { db } from "@/lib/db";
import { esatFeedback } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function clearEsatFeedback(esatType: "agents" | "client") {
  await db.delete(esatFeedback).where(eq(esatFeedback.esatType, esatType));
  revalidatePath("/esat/agents");
  revalidatePath("/esat/client");
}

export async function createEsatFeedback(data: {
  staffId: number;
  score: number;
  productWorking: boolean;
  equivalentScore: number | null;
  remarks: string;
  esatType: "agents" | "client";
}) {
  await db.insert(esatFeedback).values(data);
  revalidatePath("/esat/agents");
  revalidatePath("/esat/pmo");
}

export async function deleteEsatFeedback(id: number, _esatType?: "agents" | "client") {
  await db.delete(esatFeedback).where(eq(esatFeedback.id, id));
  revalidatePath("/esat/agents");
  revalidatePath("/esat/pmo");
}
