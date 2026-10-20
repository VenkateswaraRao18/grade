"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { Course, Exam } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";
import { ExamCard } from "@/components/exams/ExamCard";

export default function CourseExamsPage(props: PageProps<"/instructor/courses/[courseId]/exams">) {
  const { courseId } = use(props.params);
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    Promise.all([
      apiFetch<Course>(`/courses/${courseId}`, { token }),
      apiFetch<Exam[]>(`/courses/${courseId}/exams`, { token }),
    ])
      .then(([c, e]) => {
        setCourse(c);
        setExams(e);
      })
      .catch(() => setError("Could not load exams for this course."))
      .finally(() => setDataLoading(false));
  }, [user, courseId]);

  if (!user || dataLoading) return <PageSpinner />;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Courses", href: "/instructor/courses" },
          { label: course?.name ?? "", href: `/instructor/courses/${courseId}` },
          { label: "Exams" },
        ]}
        title="Exams"
        action={
          <Link href={`/instructor/courses/${courseId}/exams/new`}>
            <Button size="sm">
              <Plus className="h-4 w-4" strokeWidth={2} />
              New exam
            </Button>
          </Link>
        }
      />

      <div className="px-6 py-8 sm:px-8">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {exams.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="No exams yet"
            description="Configure an oral exam scoped to one or more assignments."
          />
        )}
        {exams.length > 0 && (
          <div className="flex flex-col gap-3">
            {exams.map((exam) => (
              <ExamCard key={exam.id} courseId={courseId} exam={exam} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
