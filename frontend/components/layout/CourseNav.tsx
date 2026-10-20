"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, FileText, Home } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Course } from "@/lib/types";
import { cn } from "@/lib/cn";

/** Secondary, course-scoped nav — only renders once an instructor is inside a
 * specific course, mirroring Canvas's Home/Assignments/Grades pattern. There is
 * no student equivalent: students have no per-course drill-down in this app
 * (exams/assignments/grades are all platform-wide lists), so IconRail alone
 * covers their navigation. */
export function CourseNav({ courseId }: { courseId: string }) {
  const pathname = usePathname();
  const [course, setCourse] = useState<Course | null>(null);

  useEffect(() => {
    const token = getToken() ?? undefined;
    apiFetch<Course>(`/courses/${courseId}`, { token })
      .then(setCourse)
      .catch(() => setCourse(null));
  }, [courseId]);

  const base = `/instructor/courses/${courseId}`;
  const isExams = pathname?.startsWith(`${base}/exams`);
  const isAssignments = pathname?.startsWith(`${base}/assignments`);
  const isHome = !isExams && !isAssignments;

  const items = [
    { href: base, label: "Home", icon: Home, active: isHome },
    { href: `${base}/assignments`, label: "Assignments", icon: FileText, active: isAssignments },
    { href: `${base}/exams`, label: "Exams", icon: ClipboardList, active: isExams },
  ];

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-zinc-300 bg-white">
      <div className="border-b border-zinc-200 px-5 pb-4 pt-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Course</p>
        <p className="mt-0.5 truncate text-[15px] font-bold text-zinc-900">{course?.name ?? " "}</p>
      </div>
      <nav className="flex flex-col">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 border-l-4 px-4 py-3 text-sm transition-colors",
              item.active
                ? "border-sky-600 bg-zinc-50 font-bold text-zinc-900"
                : "border-transparent font-medium text-zinc-700 hover:bg-zinc-50"
            )}
          >
            <item.icon className="h-4 w-4" strokeWidth={2} />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
