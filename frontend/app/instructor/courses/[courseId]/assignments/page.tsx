"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { AssignmentWithModule, Course } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";

/** Aggregate view across every module's assignments in this course — rows
 * link to each assignment's own detail page (ground truth, linked exams,
 * student results). Assignment metadata (title/description/due/points) is
 * still edited from the module page; this is the grading-facing view. */
export default function CourseAssignmentsPage(props: PageProps<"/instructor/courses/[courseId]/assignments">) {
  const { courseId } = use(props.params);
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [assignments, setAssignments] = useState<AssignmentWithModule[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    Promise.all([
      apiFetch<Course>(`/courses/${courseId}`, { token }),
      apiFetch<AssignmentWithModule[]>(`/courses/${courseId}/assignments`, { token }),
    ])
      .then(([c, a]) => {
        setCourse(c);
        setAssignments(a);
      })
      .catch(() => setError("Could not load assignments for this course."))
      .finally(() => setDataLoading(false));
  }, [user, courseId]);

  if (!user || dataLoading) return <PageSpinner />;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Courses", href: "/instructor/courses" },
          { label: course?.name ?? "", href: `/instructor/courses/${courseId}` },
          { label: "Assignments" },
        ]}
        title="Assignments"
        description="Across all modules in this course. Click into one for ground truth, linked exams, and student results."
      />

      <div className="px-6 py-8 sm:px-8">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {assignments.length === 0 && (
          <EmptyState
            icon={FileText}
            title="No assignments yet"
            description="Add assignments from within a module."
          />
        )}
        {assignments.length > 0 && (
          <div className="flex flex-col gap-3">
            {assignments.map((a) => (
              <Link key={a.id} href={`/instructor/courses/${courseId}/assignments/${a.id}`}>
                <Card className="group flex items-center justify-between p-4 transition-colors hover:bg-zinc-50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-zinc-100">
                      <FileText className="h-4 w-4 text-zinc-500" strokeWidth={1.75} />
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900">{a.title}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                        <span>{a.module_title}</span>
                        {a.due_at && <span>Due {new Date(a.due_at).toLocaleDateString()}</span>}
                        {a.points_possible != null && <span>{a.points_possible} pts</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {a.instructor_answer ? (
                      <Badge tone="success">Ground truth set</Badge>
                    ) : (
                      <Badge tone="neutral">No ground truth</Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-zinc-300 transition-colors group-hover:text-sky-500" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
