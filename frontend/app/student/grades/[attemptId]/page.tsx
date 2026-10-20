"use client";

import { use, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { PublishedGrade } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";

export default function MyGradeDetailPage(props: PageProps<"/student/grades/[attemptId]">) {
  const { attemptId } = use(props.params);
  const { user } = useAuth();
  const [grade, setGrade] = useState<PublishedGrade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    apiFetch<PublishedGrade>(`/attempts/${attemptId}/my-grade`, { token })
      .then(setGrade)
      .catch(() => setError("This grade isn't available."))
      .finally(() => setLoading(false));
  }, [user, attemptId]);

  if (!user || loading) return <PageSpinner />;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "My Grades", href: "/student/grades" }, { label: grade?.exam_name ?? "" }]}
        title={grade?.exam_name ?? "Grade"}
        description={grade?.course_name}
      />

      <div className="mx-auto w-full max-w-2xl px-6 py-8 sm:px-8">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {grade && (
          <>
            <Card className="p-6 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Score</p>
              <p className="mt-1 text-4xl font-semibold text-sky-600">
                {grade.score}
                <span className="text-lg font-medium text-sky-300"> / {grade.max_score ?? 100}</span>
              </p>
            </Card>

            {grade.strengths && (
              <Card className="mt-4 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Strengths</p>
                <p className="mt-1.5 text-sm text-zinc-700">{grade.strengths}</p>
              </Card>
            )}
            {grade.weaknesses && (
              <Card className="mt-4 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Areas to improve</p>
                <p className="mt-1.5 text-sm text-zinc-700">{grade.weaknesses}</p>
              </Card>
            )}
            {grade.instructor_feedback && (
              <Card className="mt-4 border-2 border-sky-200 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-sky-700">Note from your instructor</p>
                <p className="mt-1.5 text-sm text-zinc-700">{grade.instructor_feedback}</p>
              </Card>
            )}

            {grade.details.length > 0 && (
              <Card className="mt-4 p-5">
                <p className="text-sm font-medium text-zinc-900">Criterion breakdown</p>
                <div className="mt-3 flex flex-col gap-3">
                  {grade.details.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between border-b border-zinc-100 pb-3 last:border-0 last:pb-0"
                    >
                      <p className="text-sm text-zinc-700">{d.criterion}</p>
                      <p className="text-sm font-medium text-zinc-900">
                        {d.score} <span className="text-zinc-400">/ {d.max_score}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
