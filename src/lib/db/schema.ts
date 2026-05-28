import {
  pgTable,
  serial,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  date,
  time,
  real,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["employee", "manager", "admin", "lab_admin", "trainer", "qa"]);
export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "in_progress",
  "completed",
  "overdue",
]);
export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
]);
export const facilityStatusEnum = pgEnum("facility_status", [
  "compliant",
  "non_compliant",
  "off",
]);

// ─── Employees ────────────────────────────────────────────────────────────────

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: roleEnum("role").notNull().default("employee"),
  department: varchar("department", { length: 255 }),
  expectedTimeIn: time("expected_time_in").notNull().default("08:00:00"),
  // 0=Sunday … 6=Saturday; null = no rest day set
  restDay1: integer("rest_day_1"),
  restDay2: integer("rest_day_2"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Employee Monthly Schedules ───────────────────────────────────────────────

export const employeeSchedules = pgTable(
  "employee_schedules",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    // Expected time-in for this employee for the given month, e.g. "08:00"
    schedule: varchar("schedule", { length: 20 }).notNull().default("08:00"),
    // JSON-encoded number[]: day-of-week indices (0=Sun … 6=Sat) that are rest days
    restDays: text("rest_days").notNull().default("[]"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.employeeId, t.month, t.year)]
);

// ─── Attendance ───────────────────────────────────────────────────────────────

export const attendanceLogs = pgTable(
  "attendance_logs",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    workDate: date("work_date").notNull(),
    // "HH:MM", "OFF", "PTO", "SL", "Holiday Off", "1stHalf Absent", "2ndHalf Absent", "Half Day PTO", etc.
    schedule: varchar("schedule", { length: 20 }).notNull().default("08:00"),
    // null when schedule = "OFF"
    expectedTimeIn: time("expected_time_in"),
    // expectedTimeIn + 9 hours, null when OFF
    expectedTimeOut: time("expected_time_out"),
    actualTimeIn: time("actual_time_in"),
    actualTimeOut: time("actual_time_out"),
    // MAX(0, actual_time_in - expected_time_in) in minutes; 0 when OFF or absent
    lateMinutes: integer("late_minutes").notNull().default(0),
    remarks: text("remarks"),
  },
  (t) => [unique().on(t.employeeId, t.workDate)]
);

// ─── Facility ─────────────────────────────────────────────────────────────────

export const facilityLogs = pgTable("facility_logs", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  submittedBy: integer("submitted_by").references(() => employees.id),
  timeSubmitted: time("time_submitted"),
  // Free-text name from "Please enter your name" Excel field, or a manually entered value.
  personnelPresent: varchar("personnel_present", { length: 255 }),
  status: facilityStatusEnum("status").notNull().default("compliant"),
  remarks: text("remarks"),
  proofImageUrl: text("proof_image_url"),
  // 'manual' for entries created via the Log Check form; 'import' for Excel-imported rows.
  // Only 'manual' rows are editable in the UI.
  source: varchar("source", { length: 16 }).notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Tasks (TOR) ──────────────────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  requestedBy: varchar("requested_by", { length: 255 }),
  assignedTo: integer("assigned_to")
    .notNull()
    .references(() => employees.id),
  startDate: date("start_date").notNull(),
  dueDate: date("due_date").notNull(),
  completedDate: date("completed_date"),
  status: taskStatusEnum("status").notNull().default("pending"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── ESAT Feedback ────────────────────────────────────────────────────────────

export const esatTypeEnum = pgEnum("esat_type", ["agents", "client"]);

export const esatFeedback = pgTable("esat_feedback", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id")
    .notNull()
    .references(() => employees.id),
  // 'agents' = Agents ESAT, 'client' = Client ESAT
  esatType: esatTypeEnum("esat_type").notNull().default("agents"),
  // 1–5 rating
  score: integer("score").notNull(),
  productWorking: boolean("product_working").notNull().default(true),
  equivalentScore: real("equivalent_score"),
  remarks: text("remarks"),
  // Name of the person who submitted the rating (Client ESAT only; often blank)
  rater: varchar("rater", { length: 255 }),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

// ─── Reddit Activity ──────────────────────────────────────────────────────────

export const redditActivity = pgTable(
  "reddit_activity",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    month: integer("month").notNull().default(1),
    year: integer("year").notNull(),
    // 1–5: week position within the month
    weekNumber: integer("week_number").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    // JSON-encoded string[]: multiple post/reply links per week
    redditPostLink: text("reddit_post_link"),
    replyLink: text("reply_link"),
    // Scoring: >= 3 replies = 5, 2 = 2, 1 = 1, 0 = 0
    replyCount: integer("reply_count").notNull().default(0),
    activityScore: integer("activity_score").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.employeeId, t.month, t.year, t.weekNumber)]
);

// ─── KPI Scores (computed monthly) ───────────────────────────────────────────

export const kpiScores = pgTable(
  "kpi_scores",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    // 1–12
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    facilityScore: real("facility_score"),
    taskScore: real("task_score"),
    inventoryScore: real("inventory_score"),
    timelinessScore: real("timeliness_score"),
    attendanceScore: real("attendance_score"),
    iceScore: real("ice_score"),
    esatScore: real("esat_score"),
    // Weighted final: each category × its weight, all normalized 0–100
    finalScore: real("final_score"),
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.employeeId, t.month, t.year)]
);
