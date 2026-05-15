import { db } from "@/lib/db";
import { employees, kpiScores, tasks } from "@/lib/db/schema";
import { eq, count, avg, and } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ClipboardList, Star, TrendingUp } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";

async function getStats() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [totalEmployees] = await db
    .select({ count: count() })
    .from(employees)
    .where(eq(employees.isActive, true));

  const [pendingTasks] = await db
    .select({ count: count() })
    .from(tasks)
    .where(eq(tasks.status, "pending"));

  const [avgKpi] = await db
    .select({ avg: avg(kpiScores.finalScore) })
    .from(kpiScores)
    .where(and(eq(kpiScores.month, month), eq(kpiScores.year, year)));

  return {
    totalEmployees: totalEmployees.count,
    pendingTasks: pendingTasks.count,
    avgKpi: avgKpi.avg ? Number(avgKpi.avg).toFixed(1) : "—",
    month,
    year,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();
  const monthName = new Date(stats.year, stats.month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{monthName}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalEmployees}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.pendingTasks}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg KPI Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.avgKpi}</p>
            <p className="text-xs text-muted-foreground">this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">KPI Period</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{monthName}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>1. Add your team members under <strong>Employees</strong>.</p>
          <p>2. Log attendance records under <strong>Attendance</strong>.</p>
          <p>3. Track tasks under <strong>Tasks (TOR)</strong>.</p>
          <p>4. Collect feedback under <strong>ESAT Feedback</strong>.</p>
          <p>5. Generate monthly scores under <strong>KPI Reports</strong>.</p>
        </CardContent>
      </Card>
    </div>
  );
}
