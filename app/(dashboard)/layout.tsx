import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen"><Sidebar /><main className="flex-1 p-6">{children}</main></div>;
}
