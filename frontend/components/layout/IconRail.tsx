"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Award, BookOpen, ClipboardList, FileText, GraduationCap, LayoutDashboard, LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/cn";

interface RailItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}

const INSTRUCTOR_RAIL: RailItem[] = [
  { href: "/instructor", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/instructor/courses", label: "Courses", icon: BookOpen },
];

const STUDENT_RAIL: RailItem[] = [
  { href: "/student", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/student/assignments", label: "Assignments", icon: FileText },
  { href: "/student/grades", label: "Grades", icon: Award },
];

/** Global icon-only rail, always visible regardless of course context — mirrors
 * Canvas's outer navigation (Dashboard/Courses/Calendar/Inbox). The per-course
 * left nav (Home/Assignments/Exams) renders separately in CourseNav, only once
 * an instructor is inside a specific course. */
export function IconRail() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const items = user.role === "instructor" ? INSTRUCTOR_RAIL : STUDENT_RAIL;
  const homeHref = user.role === "instructor" ? "/instructor" : "/student";
  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <aside className="flex h-full w-[72px] shrink-0 flex-col items-center bg-[#232B35] py-3">
      <Link
        href={homeHref}
        title="ORAL"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-600 text-white"
      >
        <GraduationCap className="h-5 w-5" strokeWidth={2} />
      </Link>

      <nav className="mt-6 flex flex-1 flex-col items-center gap-1">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex w-full flex-col items-center gap-1 border-l-[3px] py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors",
                active
                  ? "border-white bg-[#2D3B45] text-white"
                  : "border-transparent text-[#9BA9B4] hover:bg-[#2D3B45]/60 hover:text-white"
              )}
            >
              <item.icon className="h-5 w-5" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-2 pb-1">
        <div
          title={user.email}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3A4753] text-[11px] font-bold text-zinc-100"
        >
          {initials}
        </div>
        <button
          onClick={logout}
          title="Log out"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#9BA9B4] hover:bg-[#2D3B45] hover:text-white"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </aside>
  );
}
