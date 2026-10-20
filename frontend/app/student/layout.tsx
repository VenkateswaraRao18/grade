"use client";

import { AuthProvider } from "@/lib/AuthContext";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider requiredRole="student">
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
