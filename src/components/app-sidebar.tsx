"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Star,
  CalendarCheck,
  Building2,
  BarChart3,
  MessageCircle,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Employees", url: "/employees", icon: Users },
  { title: "Attendance", url: "/attendance", icon: CalendarCheck },
  { title: "Tasks", url: "/tasks", icon: ClipboardList },
  { title: "Agents ESAT", url: "/esat/agents", icon: Star },
  { title: "Client ESAT", url: "/esat/client", icon: Star },
  { title: "Facility and Orderliness", url: "/facility", icon: Building2 },
  { title: "Reddit", url: "/reddit", icon: MessageCircle },
  { title: "KPI Reports", url: "/reports", icon: BarChart3 },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="LabOps KPI logo"
            width={33}
            height={36}
            className="h-8 w-auto dark:invert"
            priority
          />
          <div>
            <p className="text-sm font-semibold leading-none">LabOps KPI</p>
            <p className="text-xs text-muted-foreground">Portal</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    render={<Link href={item.url} />}
                    isActive={pathname === item.url}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-3">
        <p className="text-xs text-muted-foreground">Lab Administration Team</p>
      </SidebarFooter>
    </Sidebar>
  );
}
