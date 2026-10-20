"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Award,
  BookOpen,
  Clock,
  ListChecks,
  Mic,
  MessageCircleQuestion,
  ShieldCheck,
  Target,
  XCircle,
} from "lucide-react";
import { apiFetch, apiFetchJson, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { AvailableExam } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FieldError } from "@/components/ui/Input";
import { PageSpinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { CameraCapture } from "@/components/exam/CameraCapture";
import { IdCardSample } from "@/components/exam/IdCardSample";

interface AttemptOut {
  id: string;
}

interface VerifyResult {
  matched: boolean;
  id_verified: boolean;
  extracted_text: string;
}

type StartFlow = "idle" | "capturing" | "verifying" | "mismatch" | "confirm";

function StatPill({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700">
      <Icon className="h-3.5 w-3.5 text-sky-600" strokeWidth={2} />
      {label}
    </span>
  );
}

interface RubricCriterion {
  name: string;
  points: number;
  description: string;
}

// Rubric text is free-form instructor prose (e.g. "Conceptual understanding
// (10 pts): does the student grasp why... Clarity (10 pts): are answers
// accurate..." or "(1) conceptual understanding (10 pts), (2) clarity (10
// pts)..."). Pull out each "Name (N pts)" criterion and whatever text
// follows it, so it can render as a scannable list instead of one dense
// paragraph. Falls back to showing the raw text if nothing matches.
function parseRubric(rubric: string): RubricCriterion[] | null {
  const markerRe = /([A-Za-z][^.,:()]{1,80}?)\s*\((\d+)\s*pts?\)/g;
  const matches = [...rubric.matchAll(markerRe)];
  if (matches.length === 0) return null;

  return matches.map((m, i) => {
    const name = m[1].trim();
    const points = parseInt(m[2], 10);
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? rubric.length : rubric.length;
    const description = rubric
      .slice(start, end)
      .replace(/^[:,\s]+/, "")
      .replace(/\(\d+\)\s*$/, "")
      .replace(/\s*(Total:|Points sum to)[^.]*\.?\s*$/i, "")
      .trim();
    return { name, points, description };
  });
}

function RubricCriterionRow({ criterion }: { criterion: RubricCriterion }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] bg-sky-50">
        <Award className="h-4 w-4 text-sky-600" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-900">
          {criterion.name}
          <span className="ml-2 text-xs font-bold text-sky-600">{criterion.points} pts</span>
        </p>
        {criterion.description && (
          <p className="mt-0.5 text-sm leading-relaxed text-zinc-600">{criterion.description}</p>
        )}
      </div>
    </div>
  );
}

function InstructionPoint({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Clock;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] bg-sky-50">
        <Icon className="h-4 w-4 text-sky-600" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-zinc-600">{children}</p>
      </div>
    </div>
  );
}

export default function ExamPreCheckPage(props: PageProps<"/student/exams/[examId]">) {
  const { examId } = use(props.params);
  const router = useRouter();
  const { user } = useAuth();

  const [exam, setExam] = useState<AvailableExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [micGranted, setMicGranted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [instructionsAcknowledged, setInstructionsAcknowledged] = useState(false);

  const [startFlow, setStartFlow] = useState<StartFlow>("idle");
  const [idPhotoPreview, setIdPhotoPreview] = useState<string | null>(null);
  const [idCheckError, setIdCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    apiFetch<AvailableExam>(`/exams/${examId}/public`, { token })
      .then(setExam)
      .catch(() => setError("This exam is not available."))
      .finally(() => setLoading(false));
  }, [user, examId]);

  async function requestMic() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicGranted(true);
    } catch {
      setMicError("Microphone access was denied. You can still type your answers instead.");
    }
  }

  // Clicking "Start Exam" doesn't start anything yet — it opens a mandatory
  // live ID re-check first. This is deliberately separate from the one-time
  // /verify-id flow: that establishes id_verified as a profile-level fact,
  // this confirms the person clicking Start right now is that student, for
  // this specific attempt.
  function beginIdCheck() {
    setError(null);
    setIdCheckError(null);
    setIdPhotoPreview(null);
    setStartFlow("capturing");
  }

  function cancelIdCheck() {
    setStartFlow("idle");
    setIdPhotoPreview(null);
    setIdCheckError(null);
  }

  function retakeIdPhoto() {
    setStartFlow("capturing");
    setIdPhotoPreview(null);
    setIdCheckError(null);
  }

  async function handleIdPhotoCaptured(file: File) {
    setIdPhotoPreview(URL.createObjectURL(file));
    setIdCheckError(null);
    setStartFlow("verifying");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getToken() ?? undefined;
      const res = await apiFetch<VerifyResult>("/identity/verify-id-photo", {
        method: "POST",
        body: formData,
        token,
      });
      if (res.matched) {
        setStartFlow("confirm");
      } else {
        setIdCheckError("No match found in that photo. Try a clearer, well-lit shot of your ID.");
        setStartFlow("mismatch");
      }
    } catch (err) {
      setIdCheckError(err instanceof ApiError ? err.message : "Could not verify that photo. Try again.");
      setStartFlow("mismatch");
    }
  }

  async function handleStart() {
    setError(null);
    setStarting(true);
    try {
      const token = getToken() ?? undefined;
      const attempt = await apiFetchJson<AttemptOut>(`/exams/${examId}/attempts`, {}, { token });
      router.push(`/exam/${attempt.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the exam.");
      setStarting(false);
      setStartFlow("idle");
    }
  }

  if (!user || loading) return <PageSpinner />;

  if (!exam) {
    return (
      <>
        <PageHeader breadcrumbs={[{ label: "Exams", href: "/student" }]} title="Exam" />
        <div className="mx-auto w-full max-w-md px-6 py-8 sm:px-8">
          <FieldError>{error}</FieldError>
        </div>
      </>
    );
  }

  const rubricCriteria = parseRubric(exam.rubric);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Exams", href: "/student" }, { label: exam.name }]}
        title={exam.name}
        description={exam.course_name}
      />

      <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-8">
      {exam.already_completed ? (
        <Card className="mx-auto max-w-md p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-emerald-50">
              <ShieldCheck className="h-4.5 w-4.5 text-emerald-600" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900">You&apos;ve already taken this exam</p>
              <p className="mt-1 text-sm text-zinc-500">
                Each exam can only be taken once. Your instructor will review and publish your grade —
                check{" "}
                <Link href="/student/grades" className="text-sky-600 underline">
                  My Grades
                </Link>{" "}
                to see it once it&apos;s published.
              </p>
            </div>
          </div>
        </Card>
      ) : (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* main column */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="flex flex-wrap gap-2">
            <StatPill icon={Clock} label={`${exam.duration_minutes} minutes`} />
          </div>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4.5 w-4.5 text-sky-600" strokeWidth={1.75} />
              <h2 className="text-sm font-bold text-zinc-900">Before you begin</h2>
            </div>

            <div className="mt-1 flex flex-col divide-y divide-zinc-100">
              <InstructionPoint icon={Clock} title={`Up to ${exam.duration_minutes} minutes`}>
                An AI examiner asks you questions live and may follow up on your answers.
              </InstructionPoint>
              <InstructionPoint icon={ListChecks} title="Warm-up, then your assignment">
                The first two questions are general context and aren&apos;t graded. After that, every
                question focuses on your assignment, with follow-ups to clarify your answers.
              </InstructionPoint>
              <InstructionPoint icon={MessageCircleQuestion} title="Answer naturally">
                Use your own words and explain your reasoning. Don&apos;t know something? Say so honestly
                — and ask the examiner to repeat a question if you need it.
              </InstructionPoint>
              <InstructionPoint icon={Target} title="What&apos;s assessed">
                Whether you understand your own work — be ready to explain your methodology, decisions,
                and results.
              </InstructionPoint>
            </div>

            <label className="mt-2 flex items-start gap-2.5 rounded-[3px] border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={instructionsAcknowledged}
                onChange={(e) => setInstructionsAcknowledged(e.target.checked)}
                className="mt-0.5"
              />
              I have read and understood the instructions above.
            </label>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-900">How you&apos;ll be graded</h2>
              {rubricCriteria && (
                <span className="text-xs font-bold text-zinc-500">
                  Total: {rubricCriteria.reduce((sum, c) => sum + c.points, 0)} pts
                </span>
              )}
            </div>
            {rubricCriteria ? (
              <div className="mt-1 flex flex-col divide-y divide-zinc-100">
                {rubricCriteria.map((c, i) => (
                  <RubricCriterionRow key={i} criterion={c} />
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{exam.rubric}</p>
            )}
          </Card>
        </div>

        {/* sidebar: action panel */}
        <div className="lg:col-span-1">
          <Card className="p-5 lg:sticky lg:top-24">
            <h2 className="text-sm font-bold text-zinc-900">Ready to start?</h2>

            <div className="mt-3 flex flex-col divide-y divide-zinc-100">
              <div className="flex items-start gap-3 py-3 first:pt-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-sky-50">
                  <ShieldCheck className="h-4.5 w-4.5 text-sky-600" strokeWidth={1.75} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-900">Identity verified</p>
                  {user.id_verified ? (
                    <Badge tone="success">Verified</Badge>
                  ) : (
                    <>
                      <Badge tone="warning">Not verified</Badge>
                      <p className="mt-1 text-xs text-zinc-500">
                        <Link href="/student/verify-id" className="text-sky-600 underline">
                          Verify your ID
                        </Link>{" "}
                        before starting, or ask your instructor.
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-sky-50">
                  <Mic className="h-4.5 w-4.5 text-sky-600" strokeWidth={1.75} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-900">Microphone access</p>
                  {micGranted ? (
                    <Badge tone="success">Granted</Badge>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={requestMic} className="mt-1">
                      Allow microphone
                    </Button>
                  )}
                  {micError && (
                    <p className="mt-1.5 flex items-start gap-1 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                      {micError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <FieldError>{error}</FieldError>

            {startFlow === "idle" && (
              <div className="mt-3 border-t border-zinc-100 pt-4">
                <Button onClick={beginIdCheck} disabled={!instructionsAcknowledged} className="w-full">
                  Start Exam
                </Button>
                {!instructionsAcknowledged && (
                  <p className="mt-2 text-center text-xs text-amber-700">
                    Acknowledge the instructions before starting.
                  </p>
                )}
                <p className="mt-2 text-center text-xs text-zinc-500">
                  You&apos;ll take a quick ID photo to confirm it&apos;s you before the timer starts.
                </p>
              </div>
            )}

            {startFlow !== "idle" && (
              <div className="mt-3 rounded-[3px] border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm font-medium text-zinc-900">Confirm it&apos;s you</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Take a photo of your ID — we&apos;ll match it against{" "}
                  <span className="font-mono text-zinc-700">{user.student_id_number}</span> before starting.
                </p>

                {!idPhotoPreview && (
                  <div className="mt-3 rounded-[3px] border border-zinc-200 bg-white py-3">
                    <IdCardSample />
                  </div>
                )}

                <div className="mt-3 rounded-[3px] border border-zinc-200 bg-white p-3">
                  {idPhotoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={idPhotoPreview} alt="ID preview" className="mx-auto max-h-48 rounded-md" />
                  ) : (
                    <CameraCapture onCapture={handleIdPhotoCaptured} />
                  )}
                </div>

                {startFlow === "verifying" && (
                  <p className="mt-3 text-center text-xs text-zinc-500">Checking your photo...</p>
                )}

                {startFlow === "mismatch" && idCheckError && (
                  <>
                    <p className="mt-3 flex items-start gap-1.5 text-xs text-red-600">
                      <XCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                      {idCheckError}
                    </p>
                    <Button variant="secondary" size="sm" onClick={retakeIdPhoto} className="mt-3 w-full">
                      Retake photo
                    </Button>
                  </>
                )}

                <Button variant="ghost" size="sm" onClick={cancelIdCheck} className="mt-2 w-full">
                  Cancel
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
      )}

      <ConfirmDialog
        open={startFlow === "confirm"}
        onClose={cancelIdCheck}
        onConfirm={handleStart}
        title="Start your exam now?"
        description="Your identity photo matched. Once you start, the timer begins immediately and you'll move into full-screen mode."
        confirmLabel={starting ? "Starting..." : "Yes, start exam"}
        busy={starting}
      />
      </div>
    </>
  );
}
