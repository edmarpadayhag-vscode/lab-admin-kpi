"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

export default function RedditPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <h1 className="text-2xl font-bold">Reddit</h1>
      </div>
    </div>
  );
}
