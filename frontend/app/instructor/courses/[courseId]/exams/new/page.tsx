"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, apiFetchJson, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { AssignmentWithModule, Course } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldError, Input, Label, Textarea } from "@/components/ui/Input";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/cn";

interface ExamOut {
  id: string;
}

const DEFAULT_RUBRIC =
  "Conceptual understanding (10 pts): does the student grasp why their approach works, not just what they did. " +
  "Clarity and correctness of explanation (10 pts): are their answers accurate and easy to follow. " +
  "Use of terminology (10 pts): correct, appropriate use of course/field vocabulary. Total: 30 points.";

export default function NewExamPage(props: PageProps<"/instructor/courses/[courseId]/exams/new">) {
  const { courseId } = use(props.params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectAssignmentId = searchParams.get("assignment");
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [assignments, setAssignments] = useState<AssignmentWithModule[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [minQuestions, setMinQuestions] = useState(4);
  const [maxQuestions, setMaxQuestions] = useState(8);
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(true);
  const [thinkingTimeSeconds, setThinkingTimeSeconds] = useState(30);
  const [rubric, setRubric] = useState(DEFAULT_RUBRIC);
  const [sampleQuestions, setSampleQuestions] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        if (preselectAssignmentId && a.some((x) => x.id === preselectAssignmentId)) {
          setSelectedAssignmentIds([preselectAssignmentId]);
        }
      })
      .finally(() => setAssignmentsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, courseId]);

  function toggleAssignment(id: string) {
    setSelectedAssignmentIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selectedAssignmentIds.length === 0) {
      setError("Select at least one assignment to scope this exam to.");
      return;
    }
    setSubmitting(true);
    try {
      const token = getToken() ?? undefined;
      const exam = await apiFetchJson<ExamOut>(
        `/courses/${courseId}/exams`,
        {
          name,
          assignment_ids: selectedAssignmentIds,
          duration_minutes: durationMinutes,
          difficulty,
          min_questions: minQuestions,
          max_questions: maxQuestions,
          adaptive_enabled: adaptiveEnabled,
          thinking_time_seconds: thinkingTimeSeconds,
          rubric,
          sample_questions: sampleQuestions || undefined,
        },
        { token }
      );
      router.push(`/instructor/courses/${courseId}/exams/${exam.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create exam.");
      setSubmitting(false);
    }
  }

  if (!user || assignmentsLoading) return <PageSpinner />;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Courses", href: "/instructor/courses" },
          { label: course?.name ?? "", href: `/instructor/courses/${courseId}` },
          { label: "New exam" },
        ]}
        title="New exam"
        description="This oral exam will examine students on the assignments you select — questions are grounded in that work, not general course review."
      />

      <div className="mx-auto w-full max-w-2xl px-6 py-8 sm:px-8">
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <Label htmlFor="name">Exam name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>
                Scope (assignments)
                {selectedAssignmentIds.length > 0 && (
                  <span className="ml-1.5 font-normal text-zinc-500">
                    · {selectedAssignmentIds.length} selected
                  </span>
                )}
              </Label>
              {assignments.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedAssignmentIds(
                      selectedAssignmentIds.length === assignments.length ? [] : assignments.map((a) => a.id)
                    )
                  }
                  className="text-xs font-bold text-sky-600 hover:text-sky-800"
                >
                  {selectedAssignmentIds.length === assignments.length ? "Clear all" : "Select all"}
                </button>
              )}
            </div>
            {assignments.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No assignments yet — add one from a module page before creating an exam.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {assignments.map((a) => (
                  <label
                    key={a.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-[3px] border px-3 py-2.5 text-sm",
                      selectedAssignmentIds.includes(a.id)
                        ? "border-sky-600 bg-sky-50 text-sky-700"
                        : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selectedAssignmentIds.includes(a.id)}
                      onChange={() => toggleAssignment(a.id)}
                    />
                    <span>
                      <span className="block">{a.title}</span>
                      <span className="block text-xs text-zinc-500">{a.module_title}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min={1}
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="difficulty">Difficulty</Label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                className="w-full rounded-[3px] border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="min-q">Min questions</Label>
              <Input
                id="min-q"
                type="number"
                min={1}
                required
                value={minQuestions}
                onChange={(e) => setMinQuestions(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="max-q">Max questions</Label>
              <Input
                id="max-q"
                type="number"
                min={1}
                required
                value={maxQuestions}
                onChange={(e) => setMaxQuestions(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="thinking">Thinking time (s)</Label>
              <Input
                id="thinking"
                type="number"
                min={1}
                required
                value={thinkingTimeSeconds}
                onChange={(e) => setThinkingTimeSeconds(Number(e.target.value))}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={adaptiveEnabled}
              onChange={(e) => setAdaptiveEnabled(e.target.checked)}
            />
            Adaptive follow-ups (examiner probes deeper based on answers)
          </label>

          <div>
            <Label htmlFor="rubric">Grading rubric</Label>
            <Textarea id="rubric" rows={3} value={rubric} onChange={(e) => setRubric(e.target.value)} />
            <p className="mt-1.5 text-xs text-zinc-500">
              The platform standard is 10 points per criterion (so 3 criteria sum to 30) — that&apos;s the default
              if you don&apos;t specify points. To use a different scale, give each criterion its own point value
              in parentheses, e.g. &quot;Conceptual understanding (25 pts)&quot;. The AI grader scores each
              criterion out of its stated points and the overall score is their sum.
            </p>
          </div>

          <div>
            <Label htmlFor="sample-questions">Sample questions (optional)</Label>
            <Textarea
              id="sample-questions"
              rows={3}
              value={sampleQuestions}
              onChange={(e) => setSampleQuestions(e.target.value)}
              placeholder={
                'e.g. "Why did you choose that approach? What did you observe in your results? ' +
                'Would an alternate approach have worked as well?"'
              }
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Guides the style and depth of generated questions — the examiner won&apos;t just copy these verbatim.
            </p>
          </div>

          <FieldError>{error}</FieldError>

          <Button type="submit" disabled={submitting || assignments.length === 0} className="w-full">
            {submitting ? "Creating..." : "Create exam"}
          </Button>
        </form>
      </Card>
      </div>
    </>
  );
}
