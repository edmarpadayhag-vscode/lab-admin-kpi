import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <h1 className="text-2xl font-bold">KPI Reports</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Monthly KPI score computation and reporting will be built here.</p>
          <p>First add employees, attendance records, tasks, and ESAT feedback — then generate scores.</p>
        </CardContent>
      </Card>
    </div>
  );
}
