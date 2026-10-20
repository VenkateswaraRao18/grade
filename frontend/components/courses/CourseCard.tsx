import Link from "next/link";
import { BookOpen, ChevronRight, ClipboardCheck, FolderOpen, ListChecks } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Course } from "@/lib/types";

export function CourseCard({ course }: { course: Course }) {
  return (
    <Link href={`/instructor/courses/${course.id}`}>
      <Card className="group h-full overflow-hidden p-0 transition-colors hover:bg-zinc-50">
        <div className="h-2 bg-sky-600" />
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-[3px] bg-sky-50">
              <BookOpen className="h-5 w-5 text-sky-600" strokeWidth={1.75} />
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-400 transition-colors group-hover:text-sky-600" />
          </div>
          <p className="mt-4 font-bold text-zinc-900">{course.name}</p>
          <p className="mt-1 text-xs text-zinc-500">Created {new Date(course.created_at).toLocaleDateString()}</p>

          {(course.module_count != null || course.exam_count != null) && (
            <div className="mt-4 flex items-center gap-4 border-t border-zinc-100 pt-3 text-xs font-medium text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" strokeWidth={2} />
                {course.module_count ?? 0} modules
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5" strokeWidth={2} />
                {course.exam_count ?? 0} exams
              </span>
            </div>
          )}

          {!!course.pending_review_count && (
            <div className="mt-3">
              <Badge tone="warning">
                <ClipboardCheck className="h-3 w-3" strokeWidth={2} />
                {course.pending_review_count} pending review
              </Badge>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
