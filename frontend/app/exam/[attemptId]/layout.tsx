"use client";

import { AuthProvider } from "@/lib/AuthContext";

// Deliberately outside the /student route group and its DashboardShell — a
// live exam shouldn't show the app's normal navigation chrome at all. This
// is the dedicated, full-bleed "exam mode" experience (see the page itself
// for the full-screen lock/exit-detection that pairs with it).
export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider requiredRole="student">{children}</AuthProvider>;
}
