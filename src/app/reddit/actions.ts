"use server";

import { db } from "@/lib/db";
import { redditActivity } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function calcActivityScore(replyCount: number): number {
  if (replyCount >= 3) return 5;
  if (replyCount === 2) return 3;
  return 1; // 0 or 1 entries
}

export async function upsertRedditWeek(input: {
  employeeId: number;
  month: number;
  year: number;
  weekNumber: number;
  isActive: boolean;
  postLinks: string[];
  replyLinks: string[];
}) {
  const cleanPost  = input.postLinks.map(l => l.trim()).filter(Boolean);
  const cleanReply = input.replyLinks.map(l => l.trim()).filter(Boolean);
  const replyCount   = cleanReply.length;
  const activityScore = input.isActive ? calcActivityScore(replyCount) : 0;

  await db
    .insert(redditActivity)
    .values({
      employeeId:    input.employeeId,
      month:         input.month,
      year:          input.year,
      weekNumber:    input.weekNumber,
      isActive:      input.isActive,
      redditPostLink: JSON.stringify(cleanPost),
      replyLink:      JSON.stringify(cleanReply),
      replyCount,
      activityScore,
    })
    .onConflictDoUpdate({
      target: [
        redditActivity.employeeId,
        redditActivity.month,
        redditActivity.year,
        redditActivity.weekNumber,
      ],
      set: {
        isActive:       input.isActive,
        redditPostLink: JSON.stringify(cleanPost),
        replyLink:      JSON.stringify(cleanReply),
        replyCount,
        activityScore,
      },
    });
  revalidatePath("/reddit");
}
