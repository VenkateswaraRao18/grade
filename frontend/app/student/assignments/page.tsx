"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { AvailableAssignment, Submission } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";
import { UploadSubmissionDialog } from "@/components/assignments/UploadSubmissionDialog";

export default function StudentAssignmentsPage() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<AvailableAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadTarget, setUploadTarget] = useState<AvailableAssignment | null>(null);

  function load() {
    const token = getToken() ?? undefined;
    return apiFetch<AvailableAssignment[]>("/assignments/available", { token }).then(setAssignments);
  }

  useEffect(() => {
    if (!user) return;
    load().finally(() => setLoading(false));
  }, [user]);

  function handleUploaded(assignmentId: string, submission: Submission) {
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === assignmentId ? { ...a, submitted: true, submitted_at: submission.submitted_at } : a
      )
    );
  }

  if (!user || loading) return <PageSpinner />;

  return (
    <>
      <PageHeader
        title="Assignments"
        description="Submit your work here — your oral exams will be grounded in what you submit, not general review."
      />

      <div className="mx-auto w-full max-w-2xl px-6 py-8 sm:px-8">
        {assignments.length === 0 && (
          <EmptyState icon={FileText} title="No assignments yet" description="Check back once your instructor adds some." />
        )}

        {assignments.length > 0 && (
          <div className="flex flex-col gap-3">
            {assignments.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-zinc-900">{a.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {a.course_name} · {a.module_title}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
                      {a.due_at && <span>Due {new Date(a.due_at).toLocaleString()}</span>}
                      {a.due_at && a.points_possible != null && <span>·</span>}
                      {a.points_possible != null && <span>{a.points_possible} pts</span>}
                    </div>
                  </div>
                  {a.submitted ? (
                    <Badge tone="success">
                      <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                      Submitted
                    </Badge>
                  ) : (
                    <Badge tone="warning">Not submitted</Badge>
                  )}
                </div>
                <Button
                  variant={a.submitted ? "secondary" : "primary"}
                  size="sm"
                  className="mt-3"
                  onClick={() => setUploadTarget(a)}
                >
                  <Upload className="h-3.5 w-3.5" strokeWidth={2} />
                  {a.submitted ? "Resubmit" : "Submit"}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {uploadTarget && (
        <UploadSubmissionDialog
          open={!!uploadTarget}
          onClose={() => setUploadTarget(null)}
          assignmentId={uploadTarget.id}
          assignmentTitle={uploadTarget.title}
          onUploaded={(submission) => handleUploaded(uploadTarget.id, submission)}
        />
      )}
    </>
  );
}
