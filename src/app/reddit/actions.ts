"use server";

import { db } from "@/lib/db";
import { redditActivity } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function calcActivityScore(replyCount: number): number {
  if (replyCount >= 3) return 5;
  if (replyCount === 2) return 3;
  if (replyCount === 1) return 2;
  return 1; // 0 replies
}

export async function upsertRedditWeek(input: {
  employeeId: number;
  month: number;
  year: number;
  weekNumber: number;
  isActive: boolean;
  entries: { date: string; post: string; reply: string; resolved: string }[];
}) {
  const cleanEntries = input.entries
    .map(e => ({ date: e.date.trim(), post: e.post.trim(), reply: e.reply.trim(), resolved: e.resolved.trim() }))
    .filter(e => e.post || e.reply);

  const replyCount    = cleanEntries.filter(e => e.reply).length;
  const activityScore = input.isActive ? calcActivityScore(replyCount) : 0;

  // Store as [{date,post,reply}] in redditPostLink; keep replyLink for backward compat
  const entriesJson  = JSON.stringify(cleanEntries);
  const replyLinks   = JSON.stringify(cleanEntries.map(e => e.reply));

  await db
    .insert(redditActivity)
    .values({
      employeeId:     input.employeeId,
      month:          input.month,
      year:           input.year,
      weekNumber:     input.weekNumber,
      isActive:       input.isActive,
      redditPostLink: entriesJson,
      replyLink:      replyLinks,
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
        redditPostLink: entriesJson,
        replyLink:      replyLinks,
        replyCount,
        activityScore,
      },
    });
  revalidatePath("/reddit");
}

export async function clearRedditMonth(input: {
  employeeId: number;
  month:      number;
  year:       number;
}) {
  await db
    .delete(redditActivity)
    .where(and(
      eq(redditActivity.employeeId, input.employeeId),
      eq(redditActivity.month,      input.month),
      eq(redditActivity.year,       input.year),
    ));
  revalidatePath("/reddit");
}
