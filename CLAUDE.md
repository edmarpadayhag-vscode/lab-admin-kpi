@AGENTS.md

# CLAUDE.md — Lab Admin KPI Automation System

## Project Purpose

Automate the monthly KPI scoring process for a laboratory administration team. Replace a manual Excel-based workbook with a web application that collects data, calculates scores, and generates reports automatically.

---

## Tech Stack

- **Frontend**: Next.js (App Router), Tailwind CSS, shadcn/ui
- **Backend**: Next.js API routes / Server Actions
- **Database**: Amazon Aurora PostgreSQL
- **ORM**: Drizzle ORM
- **Auth**: None — internal tool, no login required
- **Deployment**: Vercel
- **Reports**: PDF export, Excel export

---

## KPI Categories and Weights

| Category               | Weight | Source Sheet |
|------------------------|--------|--------------|
| Facility & Orderliness | 15%    | Facility     |
| Task Completion        | 10%    | TOR          |
| Inventory              | 15%    | (TBD)        |
| Timeliness of Response | 15%    | TOR          |
| Attendance             | 15%    | Attendance   |
| ICE                    | 15%    | (TBD)        |
| ESAT                   | 15%    | ESAT / ESAT PM |

### Master Score Formula

```
Final KPI Score =
  (Facility × 0.15) +
  (Task Completion × 0.10) +
  (Inventory × 0.15) +
  (Timeliness × 0.15) +
  (Attendance × 0.15) +
  (ICE × 0.15) +
  (ESAT × 0.15)
```

Score is computed monthly per employee.

---

## Database Schema

### employees
```sql
id, name, email, role, department, is_active, created_at
```

### facility_logs
```sql
id, date, submitted_by (→ employees.id), time_submitted,
personnel_present, status, remarks, proof_image_url, created_at
```

### attendance_logs
```sql
id, employee_id (→ employees.id), work_date, expected_time_in,
actual_time_in, actual_time_out, late_minutes, attendance_status,
remarks
-- late_minutes = MAX(0, (actual_time_in - expected_time_in) in minutes)
```

### tasks (TOR)
```sql
id, title, description, requested_by, assigned_to (→ employees.id),
start_date, due_date, completed_date, status, priority, remarks
-- statuses: pending | in_progress | completed | overdue
```

### esat_feedback
```sql
id, staff_id (→ employees.id), score (1–5), product_working (bool),
equivalent_score, remarks, submitted_at
```

### reddit_activity
```sql
id, employee_id (→ employees.id), week_number, year,
reddit_post_link, reply_link, reply_count, activity_score, created_at
-- scoring: 3+ replies = 5, 2 replies = 2, 1 reply = 1
```

### kpi_scores (computed monthly)
```sql
id, employee_id (→ employees.id), month, year,
facility_score, task_score, inventory_score, timeliness_score,
attendance_score, ice_score, esat_score, final_score, generated_at
```

---

## Key Business Rules

### Attendance
- Late minutes = MAX(0, actual_time_in − expected_time_in) in minutes
- Holidays and rest days are excluded from computation
- Absence counts as 0 for that day

### Facility
- Weekends and off-days = auto-marked as OFF (not penalized)
- Expected: form submitted + completion = Yes
- Missing submission = non-compliant

### TOR (Task Operations Report)
- Task Completion Rate = Completed / Total Tasks
- On-Time Rate = Tasks completed on or before due date / Completed Tasks
- Timeliness of Response is a separate KPI from Task Completion

### Reddit
- Score based on reply count per week: ≥3 replies = 5pts, 2 = 2pts, 1 = 1pt

### ESAT
- Average score per staff member across all submissions in the month
- Product working score weighted separately

---

## Application Architecture

```
Employee → Web Form / Input UI
              ↓
         API Routes / Server Actions
              ↓
         Aurora PostgreSQL
              ↓
         KPI Calculation Engine (monthly batch + on-demand)
              ↓
         Dashboard + PDF/Excel Reports
```

---

## User Roles

No authentication. Navigation between views is done via the UI directly.

| Role     | Access                                              |
|----------|-----------------------------------------------------|
| Employee | Submit forms, view own KPI scores and trends        |
| Manager  | View all employee KPIs, team analytics, export reports |
| Admin    | Manage employees, configure weights, generate reports |

---

## Build Phases

### Phase 1 — Core (current focus)
- Employee management
- Attendance data entry / import
- TOR task tracking
- ESAT form submission
- Monthly KPI score computation
- Basic manager dashboard

### Phase 2 — Polish
- Facility daily check-in with image upload
- Reddit activity logging
- Inventory KPI module
- ICE module
- Email alerts and notifications
- PDF/Excel report export

### Phase 3 — Future
- Biometrics integration for attendance
- AI-generated monthly summaries
- Mobile-friendly PWA
- Predictive performance analytics

---

## Conventions

- All scores normalized to 0–100 range before applying weights
- Months stored as `month` (1–12) + `year` (YYYY) integer columns — no ambiguous date strings
- All times stored in UTC; display converts to local timezone
- Soft deletes on employees (`is_active` flag), never hard delete
- KPI recalculation is idempotent — re-running overwrites the existing `kpi_scores` row for that employee/month/year

---

## File Structure

```
src/
  app/                  # Next.js App Router pages and layouts
    api/                # API route handlers
  components/           # Shared UI components
  lib/
    kpi/                # KPI calculation engine logic
    db/                 # Drizzle schema + query helpers
  types/                # Shared TypeScript types
drizzle/                # Migration files
```

---

## Security Notes

- All DB queries go through Drizzle ORM — no raw string interpolation
- Role checks enforced server-side on every API route and Server Action
- File uploads (facility proof images) validated for type and size before storage
- No PII logged to application logs
