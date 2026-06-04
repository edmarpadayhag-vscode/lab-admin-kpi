"use server";

import { db } from "@/lib/db";
import { facilityLogs } from "@/lib/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "facility");
const PUBLIC_PREFIX = "/uploads/facility";
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function saveProofImage(file: File): Promise<string> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image exceeds 8 MB limit");
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = file.type === "image/jpeg" ? "jpg"
    : file.type === "image/png" ? "png"
    : file.type === "image/webp" ? "webp"
    : "gif";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return `${PUBLIC_PREFIX}/${filename}`;
}

async function deleteProofImage(url: string | null) {
  if (!url || !url.startsWith(`${PUBLIC_PREFIX}/`)) return;
  const filename = url.slice(PUBLIC_PREFIX.length + 1);
  if (!/^[a-z0-9-]+\.(png|jpg|webp|gif)$/i.test(filename)) return;
  try {
    await unlink(path.join(UPLOAD_DIR, filename));
  } catch {
    // ignore missing files
  }
}

function readManualFields(form: FormData) {
  const date             = String(form.get("date")             ?? "").trim();
  const timeSubmitted    = String(form.get("timeSubmitted")    ?? "").trim();
  const submittedByRaw   = form.get("submittedBy");
  const personnelPresent = String(form.get("personnelPresent") ?? "").trim();
  const remarks          = String(form.get("remarks")          ?? "").trim();
  if (!date) throw new Error("Date is required");
  return {
    date,
    timeSubmitted:   timeSubmitted || null,
    submittedBy:     submittedByRaw && String(submittedByRaw) !== "" ? Number(submittedByRaw) : null,
    personnelPresent: personnelPresent || null,
    remarks:         remarks || null,
  };
}

export async function createFacilityLog(form: FormData) {
  const fields = readManualFields(form);
  const file = form.get("proofImage");
  let proofImageUrl: string | null = null;
  if (file instanceof File && file.size > 0) {
    proofImageUrl = await saveProofImage(file);
  }
  await db.insert(facilityLogs).values({
    ...fields,
    proofImageUrl,
    source: "manual",
  });
  revalidatePath("/facility");
}

export async function updateFacilityLog(id: number, form: FormData) {
  const fields = readManualFields(form);
  // Restrict updates to manual entries.
  const existing = await db
    .select({ id: facilityLogs.id, proofImageUrl: facilityLogs.proofImageUrl })
    .from(facilityLogs)
    .where(and(eq(facilityLogs.id, id), eq(facilityLogs.source, "manual")))
    .limit(1);
  if (existing.length === 0) {
    throw new Error("Entry not found or is not editable");
  }
  const current = existing[0];

  let proofImageUrl: string | null = current.proofImageUrl;
  const removeProof = form.get("removeProofImage") === "1";
  const file = form.get("proofImage");

  if (file instanceof File && file.size > 0) {
    proofImageUrl = await saveProofImage(file);
    await deleteProofImage(current.proofImageUrl);
  } else if (removeProof) {
    await deleteProofImage(current.proofImageUrl);
    proofImageUrl = null;
  }

  await db
    .update(facilityLogs)
    .set({ ...fields, proofImageUrl })
    .where(eq(facilityLogs.id, id));
  revalidatePath("/facility");
}

export async function deleteFacilityLog(id: number) {
  const existing = await db
    .select({ proofImageUrl: facilityLogs.proofImageUrl })
    .from(facilityLogs)
    .where(eq(facilityLogs.id, id))
    .limit(1);
  await db.delete(facilityLogs).where(eq(facilityLogs.id, id));
  if (existing[0]) await deleteProofImage(existing[0].proofImageUrl);
  revalidatePath("/facility");
}

export async function markDayNoWork(date: string) {
  const existing = await db
    .select({ id: facilityLogs.id })
    .from(facilityLogs)
    .where(and(eq(facilityLogs.date, date), eq(facilityLogs.source, "no_work")))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(facilityLogs).values({ date, source: "no_work", status: "off" });
  }
  revalidatePath("/facility");
}

export async function unmarkDayNoWork(date: string) {
  await db
    .delete(facilityLogs)
    .where(and(eq(facilityLogs.date, date), eq(facilityLogs.source, "no_work")));
  revalidatePath("/facility");
}

export async function clearAllFacilityLogs(month: number, year: number) {
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDayNum = new Date(year, month, 0).getDate();
  const lastDay  = `${year}-${String(month).padStart(2, "0")}-${String(lastDayNum).padStart(2, "0")}`;

  const result = await db
    .delete(facilityLogs)
    .where(and(gte(facilityLogs.date, firstDay), lte(facilityLogs.date, lastDay)))
    .returning({ id: facilityLogs.id, proofImageUrl: facilityLogs.proofImageUrl });
  await Promise.all(result.map((r) => deleteProofImage(r.proofImageUrl)));
  revalidatePath("/facility");
  return { deleted: result.length };
}
