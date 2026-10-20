"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  ChevronRight,
  Clock,
  FileText,
  ListChecks,
  Rocket,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { AssignmentWithModule, Course, Exam, AttemptRow } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/cn";

function initialsOf(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

function StatPill({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700">
      <Icon className="h-3.5 w-3.5 text-sky-600" strokeWidth={2} />
      {label}
    </span>
  );
}

export default function ExamDetailPage(props: PageProps<"/instructor/courses/[courseId]/exams/[examId]">) {
  const { courseId, examId } = use(props.params);
  const { user } = useAuth();
  const router = useRouter();

  const [course, setCourse] = useState<Course | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [allAssignments, setAllAssignments] = useState<AssignmentWithModule[]>([]);
  const [scopedAssignments, setScopedAssignments] = useState<AssignmentWithModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingRubric, setEditingRubric] = useState(false);
  const [rubricDraft, setRubricDraft] = useState("");
  const [savingRubric, setSavingRubric] = useState(false);
  const [rubricError, setRubricError] = useState<string | null>(null);

  const [editingExam, setEditingExam] = useState(false);
  const [savingExam, setSavingExam] = useState(false);
  const [examError, setExamError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftAssignmentIds, setDraftAssignmentIds] = useState<string[]>([]);
  const [draftDuration, setDraftDuration] = useState(20);
  const [draftDifficulty, setDraftDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [draftMinQuestions, setDraftMinQuestions] = useState(4);
  const [draftMaxQuestions, setDraftMaxQuestions] = useState(8);
  const [draftAdaptive, setDraftAdaptive] = useState(true);
  const [draftThinkingTime, setDraftThinkingTime] = useState(30);
  const [draftSampleQuestions, setDraftSampleQuestions] = useState("");

  function load() {
    const token = getToken() ?? undefined;
    return Promise.all([
      apiFetch<Course>(`/courses/${courseId}`, { token }),
      apiFetch<Exam>(`/exams/${examId}`, { token }),
      apiFetch<AttemptRow[]>(`/exams/${examId}/attempts`, { token }),
      apiFetch<AssignmentWithModule[]>(`/courses/${courseId}/assignments`, { token }),
    ]).then(([c, e, a, assignments]) => {
      setCourse(c);
      setExam(e);
      setAttempts(a);
      setAllAssignments(assignments);
      setScopedAssignments(assignments.filter((x) => e.assignment_ids.includes(x.id)));
    });
  }

  useEffect(() => {
    if (!user) return;
    load()
      .catch(() => setError("Could not load this exam."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, examId]);

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/exams/${examId}/publish`, { method: "POST", token });
      setConfirmOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not publish exam.");
    } finally {
      setPublishing(false);
    }
  }

  function startEditRubric() {
    setRubricDraft(exam!.rubric);
    setRubricError(null);
    setEditingRubric(true);
  }

  async function saveRubric() {
    setSavingRubric(true);
    setRubricError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/exams/${examId}/rubric`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubric: rubricDraft }),
        token,
      });
      setEditingRubric(false);
      await load();
    } catch (err) {
      setRubricError(err instanceof ApiError ? err.message : "Could not save rubric.");
    } finally {
      setSavingRubric(false);
    }
  }

  function startEditExam() {
    if (!exam) return;
    setDraftName(exam.name);
    setDraftAssignmentIds(exam.assignment_ids);
    setDraftDuration(exam.duration_minutes);
    setDraftDifficulty(exam.difficulty);
    setDraftMinQuestions(exam.min_questions);
    setDraftMaxQuestions(exam.max_questions);
    setDraftAdaptive(exam.adaptive_enabled);
    setDraftThinkingTime(exam.thinking_time_seconds);
    setDraftSampleQuestions(exam.sample_questions ?? "");
    setExamError(null);
    setEditingExam(true);
  }

  function toggleDraftAssignment(id: string) {
    setDraftAssignmentIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  async function saveExam() {
    if (draftAssignmentIds.length === 0) {
      setExamError("Select at least one assignment to scope this exam to.");
      return;
    }
    if (draftMaxQuestions < draftMinQuestions) {
      setExamError("Max questions must be >= min questions.");
      return;
    }
    setSavingExam(true);
    setExamError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/exams/${examId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName,
          assignment_ids: draftAssignmentIds,
          duration_minutes: draftDuration,
          difficulty: draftDifficulty,
          min_questions: draftMinQuestions,
          max_questions: draftMaxQuestions,
          adaptive_enabled: draftAdaptive,
          thinking_time_seconds: draftThinkingTime,
          sample_questions: draftSampleQuestions || null,
        }),
        token,
      });
      setEditingExam(false);
      await load();
    } catch (err) {
      setExamError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setSavingExam(false);
    }
  }

  async function handleDeleteExam() {
    setDeleting(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/exams/${examId}`, { method: "DELETE", token });
      router.push(`/instructor/courses/${courseId}/exams`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete exam.");
      setDeleteConfirmOpen(false);
      setDeleting(false);
    }
  }

  if (!user || loading || !exam) return <PageSpinner />;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Courses", href: "/instructor/courses" },
          { label: course?.name ?? "", href: `/instructor/courses/${courseId}` },
          { label: exam.name },
        ]}
        title={exam.name}
        action={
          <div className="flex items-center gap-2">
            {exam.status === "draft" ? (
              <Button onClick={() => setConfirmOpen(true)} disabled={publishing}>
                <Rocket className="h-4 w-4" strokeWidth={2} />
                Publish
              </Button>
            ) : (
              <Badge tone="success">Published</Badge>
            )}
            {!editingExam && (
              <Button variant="secondary" onClick={startEditExam}>
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

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handlePublish}
        busy={publishing}
        title="Publish this exam?"
        description="Students in this course will be able to see and start it immediately. Question generation stays server-side, so nothing is exposed ahead of time — only that the exam exists."
        confirmLabel="Publish exam"
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteExam}
        busy={deleting}
        danger
        title="Delete this exam?"
        description={
          attempts.length > 0
            ? `This exam has ${attempts.length} attempt${attempts.length === 1 ? "" : "s"} — deleting it permanently removes all of their transcripts, grades, and feedback too. This can't be undone.`
            : "This exam has no attempts yet. This can't be undone."
        }
        confirmLabel={deleting ? "Deleting..." : "Delete exam"}
      />

      <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-8">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {editingExam ? (
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-zinc-900">Edit exam</p>
              {attempts.length > 0 && (
                <p className="text-xs text-amber-700">
                  This exam already has {attempts.length} attempt{attempts.length === 1 ? "" : "s"} — changes
                  here only affect new attempts going forward.
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-5">
              <div>
                <Label htmlFor="edit-name">Exam name</Label>
                <Input id="edit-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>
                    Scope (assignments)
                    {draftAssignmentIds.length > 0 && (
                      <span className="ml-1.5 font-normal text-zinc-500">
                        · {draftAssignmentIds.length} selected
                      </span>
                    )}
                  </Label>
                </div>
                <div className="flex flex-col gap-2">
                  {allAssignments.map((a) => (
                    <label
                      key={a.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-[3px] border px-3 py-2.5 text-sm",
                        draftAssignmentIds.includes(a.id)
                          ? "border-sky-600 bg-sky-50 text-sky-700"
                          : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={draftAssignmentIds.includes(a.id)}
                        onChange={() => toggleDraftAssignment(a.id)}
                      />
                      <span>
                        <span className="block">{a.title}</span>
                        <span className="block text-xs text-zinc-500">{a.module_title}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-duration">Duration (minutes)</Label>
                  <Input
                    id="edit-duration"
                    type="number"
                    min={1}
                    value={draftDuration}
                    onChange={(e) => setDraftDuration(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-difficulty">Difficulty</Label>
                  <select
                    id="edit-difficulty"
                    value={draftDifficulty}
                    onChange={(e) => setDraftDifficulty(e.target.value as typeof draftDifficulty)}
                    className="w-full rounded-[3px] border border-zinc-400 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="edit-min-q">Min questions</Label>
                  <Input
                    id="edit-min-q"
                    type="number"
                    min={1}
                    value={draftMinQuestions}
                    onChange={(e) => setDraftMinQuestions(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-max-q">Max questions</Label>
                  <Input
                    id="edit-max-q"
                    type="number"
                    min={1}
                    value={draftMaxQuestions}
                    onChange={(e) => setDraftMaxQuestions(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-thinking">Thinking time (s)</Label>
                  <Input
                    id="edit-thinking"
                    type="number"
                    min={1}
                    value={draftThinkingTime}
                    onChange={(e) => setDraftThinkingTime(Number(e.target.value))}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={draftAdaptive}
                  onChange={(e) => setDraftAdaptive(e.target.checked)}
                />
                Adaptive follow-ups (examiner probes deeper based on answers)
              </label>

              <div>
                <Label htmlFor="edit-sample-questions">Sample questions (optional)</Label>
                <Textarea
                  id="edit-sample-questions"
                  rows={3}
                  value={draftSampleQuestions}
                  onChange={(e) => setDraftSampleQuestions(e.target.value)}
                />
              </div>

              {examError && <p className="text-sm text-red-600">{examError}</p>}

              <div className="flex gap-2">
                <Button onClick={saveExam} disabled={savingExam}>
                  {savingExam ? "Saving..." : "Save changes"}
                </Button>
                <Button variant="ghost" onClick={() => setEditingExam(false)} disabled={savingExam}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        ) : (
        <>
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <StatPill icon={Clock} label={`${exam.duration_minutes} min`} />
          <StatPill icon={BarChart3} label={exam.difficulty[0].toUpperCase() + exam.difficulty.slice(1)} />
          <StatPill icon={ListChecks} label={`${exam.min_questions}–${exam.max_questions} questions`} />
          {exam.adaptive_enabled && <StatPill icon={Sparkles} label="Adaptive" />}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            {exam.sample_questions && (
              <Card className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Sample questions</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700">
                  {exam.sample_questions}
                </p>
              </Card>
            )}

            <div>
              <h2 className="text-sm font-bold text-zinc-900">Attempts</h2>
              <div className="mt-3">
                {attempts.length === 0 && (
                  <EmptyState
                    icon={Users}
                    title="No attempts yet"
                    description="Nothing to review until a student takes this exam."
                  />
                )}
                {attempts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {attempts.map((a) => {
                      const score = a.instructor_score ?? a.ai_score;
                      return (
                        <Link key={a.attempt_id} href={`/instructor/attempts/${a.attempt_id}/grade`}>
                          <div className="group flex items-center gap-3.5 rounded-[3px] border border-zinc-300 bg-white px-4 py-3 transition-colors hover:bg-zinc-50">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600">
                              {initialsOf(a.student_email)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-zinc-900">{a.student_email}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="text-xs capitalize text-zinc-500">
                                  {a.status.replace("_", " ")}
                                </span>
                                {a.ended_reason === "integrity_violation" && (
                                  <Badge tone="warning">Left exam early</Badge>
                                )}
                                {a.grade_status && (
                                  <Badge tone={a.grade_status === "published" ? "success" : "neutral"}>
                                    {a.grade_status.replace("_", " ")}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {score != null && (
                              <div className="shrink-0 text-right">
                                <p className="text-lg font-extrabold text-zinc-900">
                                  {score}
                                  <span className="text-xs font-medium text-zinc-400">
                                    {" "}
                                    / {a.ai_max_score ?? 100}
                                  </span>
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                                  Score
                                </p>
                              </div>
                            )}
                            <ChevronRight
                              className="h-4 w-4 shrink-0 text-zinc-400 transition-colors group-hover:text-sky-600"
                              strokeWidth={2}
                            />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Grading rubric</p>
                {!editingRubric && (
                  <button
                    onClick={startEditRubric}
                    className="text-xs font-bold text-sky-600 hover:text-sky-800"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingRubric ? (
                <>
                  <Textarea
                    rows={4}
                    value={rubricDraft}
                    onChange={(e) => setRubricDraft(e.target.value)}
                    className="mt-2"
                  />
                  <p className="mt-1.5 text-xs text-zinc-500">
                    Give each criterion a point value in parentheses, e.g. &quot;Conceptual understanding (35
                    pts)&quot;, summing to 100.
                  </p>
                  {rubricError && <p className="mt-1.5 text-xs text-red-600">{rubricError}</p>}
                  <div className="mt-2.5 flex gap-2">
                    <Button size="sm" onClick={saveRubric} disabled={savingRubric}>
                      {savingRubric ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingRubric(false)}
                      disabled={savingRubric}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-zinc-700">{exam.rubric}</p>
              )}
            </Card>

            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Scope &middot; {scopedAssignments.length} assignment{scopedAssignments.length === 1 ? "" : "s"}
              </p>
              <div className="mt-2.5 flex flex-col gap-2">
                {scopedAssignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm text-zinc-700">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={2} />
                    <span className="truncate">{a.title}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
        </>
        )}
      </div>
    </>
  );
}
