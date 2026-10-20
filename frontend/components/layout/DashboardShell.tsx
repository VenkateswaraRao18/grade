"use client";

import { usePathname } from "next/navigation";
import { IconRail } from "./IconRail";
import { CourseNav } from "./CourseNav";

const COURSE_PATH_RE = /^\/instructor\/courses\/([^/]+)/;

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const courseMatch = pathname?.match(COURSE_PATH_RE);
  const courseId = courseMatch?.[1];

  return (
    // h-screen (an absolute viewport unit) instead of min-h-full — the old
    // min-h-full/min-height chain never resolved to a real pixel value
    // through body's min-h-full (percentage heights don't resolve against
    // an ancestor whose own height is itself just min-height + content), so
    // IconRail's h-full silently fell back to its own content height (a few
    // nav icons) instead of the full page. h-screen sidesteps the whole
    // ancestor-chain problem. Only the content pane scrolls internally
    // (overflow-y-auto) — the rail and course nav now stay fixed at exactly
    // the viewport height and never scroll away on a long page.
    <div className="flex h-screen bg-zinc-50">
      <IconRail />
      {courseId && <CourseNav courseId={courseId} />}
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
