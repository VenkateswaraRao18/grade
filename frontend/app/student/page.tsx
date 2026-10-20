"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ChevronRight, Clock, IdCard } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { AvailableExam } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";

export default function StudentDashboard() {
  const { user } = useAuth();
  const [exams, setExams] = useState<AvailableExam[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    apiFetch<AvailableExam[]>("/exams/available", { token })
      .then(setExams)
      .finally(() => setExamsLoading(false));
  }, [user]);

  if (!user) return <PageSpinner />;

  return (
    <>
      <PageHeader title="Exams" description={`Welcome back, ${user.email}`} />

      <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[3px] bg-sky-50">
                <IdCard className="h-5 w-5 text-sky-600" strokeWidth={1.75} />
              </div>
              <div>
                <p className="font-medium text-zinc-900">Identity verification</p>
                <p className="text-sm text-zinc-500">
                  ID on file: <span className="font-mono text-zinc-700">{user.student_id_number}</span>
                </p>
              </div>
            </div>
            {user.id_verified ? (
              <Badge tone="success">
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                Verified
              </Badge>
            ) : (
              <Badge tone="warning">Not verified</Badge>
            )}
          </div>
          <Link href="/student/verify-id">
            <Button variant={user.id_verified ? "secondary" : "primary"} size="sm" className="mt-4">
              {user.id_verified ? "Re-verify ID photo" : "Verify ID photo"}
            </Button>
          </Link>
        </Card>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-900">Available exams</h2>
          <div className="mt-3">
            {examsLoading && <PageSpinner className="py-12" />}

            {!examsLoading && exams.length === 0 && (
              <EmptyState
                icon={CalendarClock}
                title="No exams available yet"
                description="Your instructor hasn't published an exam. Check back later."
              />
            )}

            {!examsLoading && exams.length > 0 && (
              <div className="flex flex-col gap-3">
                {exams.map((exam) => (
                  <Link key={exam.id} href={`/student/exams/${exam.id}`}>
                    <Card className="group flex items-center justify-between p-4 transition-colors hover:bg-zinc-50">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-zinc-900">{exam.name}</p>
                          {exam.already_completed && <Badge tone="success">Completed</Badge>}
                        </div>
                        <p className="mt-0.5 text-sm text-zinc-500">{exam.course_name}</p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                            {exam.duration_minutes} min
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-sky-500" />
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
