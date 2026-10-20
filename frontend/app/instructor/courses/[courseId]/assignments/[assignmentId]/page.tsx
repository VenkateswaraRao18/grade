"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Award,
  CheckCircle2,
  Clock,
  FileText,
  ListChecks,
  Plus,
  Rocket,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { AssignmentDetail, AssignmentResultRow, LinkedExam } from "@/lib/types";
import { UPLOAD_ACCEPT, UPLOAD_HINT } from "@/lib/fileTypes";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/layout/PageHeader";

function initialsOf(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StatPill({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700">
      <Icon className="h-3.5 w-3.5 text-sky-600" strokeWidth={2} />
      {label}
    </span>
  );
}

export default function AssignmentDetailPage(
  props: PageProps<"/instructor/courses/[courseId]/assignments/[assignmentId]">
) {
  const { courseId, assignmentId } = use(props.params);
  const { user } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [linkedExams, setLinkedExams] = useState<LinkedExam[]>([]);
  const [results, setResults] = useState<AssignmentResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [groundTruthDraft, setGroundTruthDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [publishConfirmGradeId, setPublishConfirmGradeId] = useState<string | null>(null);

  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftDueAt, setDraftDueAt] = useState("");
  const [draftPoints, setDraftPoints] = useState("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function load() {
    const token = getToken() ?? undefined;
    return Promise.all([
      apiFetch<AssignmentDetail>(`/assignments/${assignmentId}`, { token }),
      apiFetch<LinkedExam[]>(`/assignments/${assignmentId}/exams`, { token }),
      apiFetch<AssignmentResultRow[]>(`/assignments/${assignmentId}/results`, { token }),
    ]).then(([a, exams, r]) => {
      setAssignment(a);
      setGroundTruthDraft(a.instructor_answer ?? "");
      setLinkedExams(exams);
      setResults(r);
    });
  }

  useEffect(() => {
    if (!user) return;
    load()
      .catch(() => setError("Could not load this assignment."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, assignmentId]);

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getToken() ?? undefined;
      const updated = await apiFetch<AssignmentDetail>(`/assignments/${assignmentId}/ground-truth-upload`, {
        method: "POST",
        body: formData,
        token,
      });
      setGroundTruthDraft(updated.instructor_answer ?? "");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedFileName(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not process that file.");
    } finally {
      setUploading(false);
    }
  }

  async function saveGroundTruth() {
    setSavingAnswer(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/assignments/${assignmentId}/instructor-answer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructor_answer: groundTruthDraft.trim() || null }),
        token,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setSavingAnswer(false);
    }
  }

  async function finalizeGrade(gradeId: string) {
    setTransitioningId(gradeId);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/grades/${gradeId}/finalize`, { method: "POST", token });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not finalize.");
    } finally {
      setTransitioningId(null);
    }
  }

  async function publishGrade() {
    if (!publishConfirmGradeId) return;
    setTransitioningId(publishConfirmGradeId);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/grades/${publishConfirmGradeId}/publish`, { method: "POST", token });
      setPublishConfirmGradeId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not publish.");
    } finally {
      setTransitioningId(null);
    }
  }

  function startEditDetails() {
    if (!assignment) return;
    setDraftTitle(assignment.title);
    setDraftDescription(assignment.description ?? "");
    setDraftDueAt(toDatetimeLocal(assignment.due_at));
    setDraftPoints(assignment.points_possible != null ? String(assignment.points_possible) : "");
    setDetailsError(null);
    setEditingDetails(true);
  }

  async function saveDetails() {
    setSavingDetails(true);
    setDetailsError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle,
          description: draftDescription || null,
          due_at: draftDueAt ? new Date(draftDueAt).toISOString() : null,
          points_possible: draftPoints ? Number(draftPoints) : null,
        }),
        token,
      });
      setEditingDetails(false);
      await load();
    } catch (err) {
      setDetailsError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleDeleteAssignment() {
    setDeleting(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/assignments/${assignmentId}`, { method: "DELETE", token });
      router.push(`/instructor/courses/${courseId}/assignments`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete assignment.");
      setDeleteConfirmOpen(false);
      setDeleting(false);
    }
  }

  if (!user || loading || !assignment) return <PageSpinner />;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Courses", href: "/instructor/courses" },
          { label: assignment.course_name, href: `/instructor/courses/${courseId}` },
          { label: "Assignments", href: `/instructor/courses/${courseId}/assignments` },
          { label: assignment.title },
        ]}
        title={assignment.title}
        description={assignment.module_title}
        action={
          <div className="flex items-center gap-2">
            {!editingDetails && (
              <Button variant="secondary" onClick={startEditDetails}>
                Edit
              </Button>
            )}
            <Button variant="danger" onClick={() => setDeleteConfirmOpen(true)}>
              <Trash2 className="h-4 w-4" strokeWidth={2} />
              Delete
            </Button>
          </div>
        }
      />

      <div className="px-6 py-8 sm:px-8">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {editingDetails ? (
          <Card className="p-6">
            <p className="text-sm font-bold text-zinc-900">Edit assignment</p>
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <Label htmlFor="edit-title">Title</Label>
                <Input id="edit-title" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  rows={3}
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-due">Due date</Label>
                  <Input
                    id="edit-due"
                    type="datetime-local"
                    value={draftDueAt}
                    onChange={(e) => setDraftDueAt(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-points">Points</Label>
                  <Input
                    id="edit-points"
                    type="number"
                    min={0}
                    value={draftPoints}
                    onChange={(e) => setDraftPoints(e.target.value)}
                  />
                </div>
              </div>
              {detailsError && <p className="text-sm text-red-600">{detailsError}</p>}
              <div className="flex gap-2">
                <Button onClick={saveDetails} disabled={savingDetails}>
                  {savingDetails ? "Saving..." : "Save changes"}
                </Button>
                <Button variant="ghost" onClick={() => setEditingDetails(false)} disabled={savingDetails}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        ) : (
        <div className="flex flex-wrap gap-2">
          {assignment.due_at && (
            <StatPill icon={Clock} label={`Due ${new Date(assignment.due_at).toLocaleDateString()}`} />
          )}
          {assignment.points_possible != null && (
            <StatPill icon={Award} label={`${assignment.points_possible} pts`} />
          )}
          <StatPill icon={ListChecks} label={`${linkedExams.length} linked exam${linkedExams.length === 1 ? "" : "s"}`} />
        </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* main column */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Ground truth — instructor&apos;s answer
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Used by the AI as the correct reference when scoping questions and grading — judged on meaning,
                not wording. Without this, grading falls back to the student&apos;s own submission alone.
              </p>

              <div className="mt-3 flex items-center gap-3">
                <label className="flex flex-1 cursor-pointer items-center gap-3 rounded-[3px] border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 hover:border-sky-300 hover:bg-sky-50/40">
                  <Upload className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{selectedFileName ?? `Upload your own solved answer (${UPLOAD_HINT})`}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      setSelectedFileName(e.target.files?.[0]?.name ?? null);
                      handleUpload();
                    }}
                  />
                </label>
                {uploading && <span className="text-xs text-zinc-500">Extracting...</span>}
              </div>

              <Textarea
                rows={6}
                value={groundTruthDraft}
                onChange={(e) => setGroundTruthDraft(e.target.value)}
                placeholder="Type or paste the correct answer directly, or upload a file above to prefill this."
                className="mt-3"
              />
              <Button onClick={saveGroundTruth} disabled={savingAnswer} variant="secondary" size="sm" className="mt-2">
                {savingAnswer ? "Saving..." : "Save"}
              </Button>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-zinc-500" strokeWidth={1.75} />
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Student results</p>
              </div>

              <div className="mt-3">
                {results.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No attempts yet"
                    description="Nothing to show until a student takes an exam covering this assignment."
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {results.map((r) => {
                      const score = r.instructor_score ?? r.ai_score;
                      return (
                        <div
                          key={r.attempt_id}
                          className="flex flex-wrap items-center gap-3 rounded-[3px] border border-zinc-300 bg-white px-4 py-3"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600">
                            {initialsOf(r.student_email)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-zinc-900">{r.student_email}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-zinc-500">{r.exam_name}</span>
                              {r.ended_reason === "integrity_violation" && (
                                <Badge tone="warning">Left early</Badge>
                              )}
                              {r.grade_status && (
                                <Badge tone={r.grade_status === "published" ? "success" : "neutral"}>
                                  {r.grade_status.replace("_", " ")}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {score != null && (
                            <div className="shrink-0 text-right">
                              <p className="text-base font-extrabold text-zinc-900">
                                {score}
                                <span className="text-xs font-medium text-zinc-400"> / {r.ai_max_score ?? 100}</span>
                              </p>
                            </div>
                          )}
                          <div className="flex shrink-0 items-center gap-2">
                            {r.grade_id && (r.grade_status === "ai_graded" || r.grade_status === "instructor_review") && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={transitioningId === r.grade_id}
                                onClick={() => finalizeGrade(r.grade_id!)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                                Finalize
                              </Button>
                            )}
                            {r.grade_id && r.grade_status === "finalized" && (
                              <Button
                                size="sm"
                                disabled={transitioningId === r.grade_id}
                                onClick={() => setPublishConfirmGradeId(r.grade_id)}
                              >
                                <Rocket className="h-3.5 w-3.5" strokeWidth={2} />
                                Publish
                              </Button>
                            )}
                            <Link
                              href={`/instructor/attempts/${r.attempt_id}/grade`}
                              className="text-xs font-bold text-sky-600 hover:text-sky-800"
                            >
                              Review
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* sidebar */}
          <div className="flex flex-col gap-6">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Linked exams</p>
                <Link
                  href={`/instructor/courses/${courseId}/exams/new?assignment=${assignmentId}`}
                  className="flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-800"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  New exam
                </Link>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {linkedExams.length === 0 && (
                  <p className="text-sm text-zinc-500">No exam scopes this assignment yet.</p>
                )}
                {linkedExams.map((e) => (
                  <Link
                    key={e.id}
                    href={`/instructor/courses/${courseId}/exams/${e.id}`}
                    className="flex items-center justify-between rounded-[3px] border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
                  >
                    <span className="flex items-center gap-2 text-zinc-800">
                      <FileText className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.75} />
                      {e.name}
                    </span>
                    <Badge tone={e.status === "published" ? "success" : "neutral"}>{e.status}</Badge>
                  </Link>
                ))}
              </div>
            </Card>

            {assignment.description && (
              <Card className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Description</p>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{assignment.description}</p>
              </Card>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={publishConfirmGradeId !== null}
        onClose={() => setPublishConfirmGradeId(null)}
        onConfirm={publishGrade}
        busy={transitioningId !== null}
        title="Publish this grade to the student?"
        description="The student will immediately be able to see their score and feedback. This can't be un-published from here."
        confirmLabel="Publish grade"
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteAssignment}
        busy={deleting}
        danger
        title="Delete this assignment?"
        description={
          linkedExams.length > 0
            ? `Remove it from ${linkedExams.length} linked exam${linkedExams.length === 1 ? "" : "s"} first — an assignment still scoped by an exam can't be deleted.`
            : "This can't be undone."
        }
        confirmLabel={deleting ? "Deleting..." : "Delete assignment"}
      />
    </>
  );
}
