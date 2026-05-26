/** Special non-time schedule values. */
export const SPECIAL_SCHEDULES = ["PTO", "SL", "OFF", "H-OFF"] as const;

/** All schedule options: special statuses first, then 30-min time slots 00:00–23:30. */
export const SCHEDULE_OPTIONS: string[] = [...SPECIAL_SCHEDULES];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    SCHEDULE_OPTIONS.push(
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    );
  }
}

/** Returns true for schedules that carry no expected-time meaning. */
export function isNonWorkSchedule(schedule: string): boolean {
  return schedule === "OFF" || schedule === "PTO" || schedule === "SL" || schedule === "H-OFF";
}

/** Add hours to "HH:MM", returns "HH:MM". */
export function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + hours * 60;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Expected out = schedule + 9 h. Returns null for non-work schedules. */
export function expectedOut(schedule: string): string | null {
  if (isNonWorkSchedule(schedule)) return null;
  return addHours(schedule, 9);
}

/** Late minutes = MAX(0, actualIn − expectedIn). Returns 0 for non-work schedules or missing times. */
export function calcLateMinutes(schedule: string, actualIn: string | null): number {
  if (isNonWorkSchedule(schedule) || !actualIn) return 0;
  const [eh, em] = schedule.split(":").map(Number);
  const [ah, am] = actualIn.split(":").map(Number);
  return Math.max(0, (ah * 60 + am) - (eh * 60 + em));
}

/** Parse a CSV string into an array of row objects keyed by header. */
export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}
