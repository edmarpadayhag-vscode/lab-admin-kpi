"use server";

import { db } from "@/lib/db";
import { facilityLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createFacilityLog(data: {
  date: string;
  submittedBy: number;
  timeSubmitted: string;
  personnelPresent: boolean;
  status: "compliant" | "non_compliant" | "off";
  remarks: string;
}) {
  await db.insert(facilityLogs).values(data);
  revalidatePath("/facility");
}

export async function deleteFacilityLog(id: number) {
  await db.delete(facilityLogs).where(eq(facilityLogs.id, id));
  revalidatePath("/facility");
}
