"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { MyGrade } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";

export default function MyGradesPage() {
  const { user } = useAuth();
  const [grades, setGrades] = useState<MyGrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    apiFetch<MyGrade[]>("/my-grades", { token })
      .then(setGrades)
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || loading) return <PageSpinner />;

  return (
    <>
      <PageHeader title="My grades" description="Only grades your instructor has published appear here." />

      <div className="mx-auto w-full max-w-2xl px-6 py-8 sm:px-8">
        {grades.length === 0 && (
          <EmptyState
            icon={Award}
            title="No published grades yet"
            description="Once your instructor reviews and publishes a grade, it'll show up here."
          />
        )}
        {grades.length > 0 && (
          <div className="flex flex-col gap-3">
            {grades.map((g) => (
              <Link key={g.attempt_id} href={`/student/grades/${g.attempt_id}`}>
                <Card className="flex items-center justify-between p-4 transition-colors hover:bg-zinc-50">
                  <div>
                    <p className="font-medium text-zinc-900">{g.exam_name}</p>
                    <p className="text-sm text-zinc-500">{g.course_name}</p>
                  </div>
                  <p className="text-lg font-semibold text-sky-600">
                    {g.score}
                    <span className="text-sm font-medium text-sky-300"> / {g.max_score ?? 100}</span>
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
