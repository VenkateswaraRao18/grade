"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  CircleDollarSign,
  GraduationCap,
  Mic,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { ApiUsage, InstructorStats, PendingReview } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";

const CALL_TYPE_LABEL: Record<string, string> = {
  examiner_question: "Exam questions",
  warmup_question: "Warm-up questions",
  grading: "Grading",
};

function formatUsd(n: number | null): string {
  if (n === null) return "—";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

export default function InstructorOverviewPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<InstructorStats | null>(null);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [usage, setUsage] = useState<ApiUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    Promise.all([
      apiFetch<InstructorStats>("/instructor/stats", { token }),
      apiFetch<PendingReview[]>("/instructor/attempts/pending-review", { token }),
      apiFetch<ApiUsage>("/instructor/usage", { token }),
    ])
      .then(([s, p, u]) => {
        setStats(s);
        setPendingReviews(p);
        setUsage(u);
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || loading || !stats) return <PageSpinner />;

  return (
    <>
      <PageHeader title="Overview" description={`Welcome back, ${user.email}`} />

      <div className="px-6 py-8 sm:px-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={BookOpen} label="Courses" value={stats.course_count} />
          <StatCard icon={ClipboardList} label="Exams" value={stats.exam_count} />
          <StatCard icon={GraduationCap} label="Completed attempts" value={stats.completed_attempt_count} />
          <StatCard icon={Sparkles} label="Published grades" value={stats.published_grade_count} />
        </div>

        <div className="mt-8">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-amber-600" strokeWidth={2} />
            <h2 className="text-sm font-semibold text-zinc-900">Pending review</h2>
            {pendingReviews.length > 0 && <Badge tone="warning">{pendingReviews.length}</Badge>}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Students have completed these exams. Nothing is graded until you review it.
          </p>

          <div className="mt-3">
            {pendingReviews.length === 0 && (
              <EmptyState
                icon={ClipboardCheck}
                title="Nothing waiting on you"
                description="Completed exam attempts that still need grading will show up here."
              />
            )}
            {pendingReviews.length > 0 && (
              <div className="flex flex-col gap-2">
                {pendingReviews.map((r) => (
                  <Link key={r.attempt_id} href={`/instructor/attempts/${r.attempt_id}/grade`}>
                    {/* Plain div, not <Card>, on purpose: Card's own default
                        border-zinc-300/bg-white classes otherwise win over
                        these amber overrides in the compiled stylesheet
                        regardless of className order (verified — the tint
                        silently never rendered). */}
                    <div className="group flex items-center justify-between gap-3 rounded-[3px] border border-amber-200 bg-amber-50/40 p-4 transition-colors hover:border-amber-300">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-zinc-900">
                          {r.student_email} — {r.exam_name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span>{r.course_name}</span>
                          <span>·</span>
                          <span>Completed {new Date(r.ended_at).toLocaleString()}</span>
                          {r.ended_reason === "integrity_violation" && (
                            <Badge tone="warning">
                              <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                              Left early
                            </Badge>
                          )}
                          {r.grade_status && <Badge tone="neutral">{r.grade_status.replace("_", " ")}</Badge>}
                        </div>
                      </div>
                      {r.ai_score != null && (
                        <div className="shrink-0 text-right">
                          <p className="text-lg font-extrabold text-zinc-900">
                            {r.ai_score}
                            <span className="text-xs font-medium text-zinc-400"> / {r.ai_max_score ?? 100}</span>
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">AI score</p>
                        </div>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-amber-600" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {usage && (
          <div className="mt-8">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-zinc-500" strokeWidth={2} />
              <h2 className="text-sm font-semibold text-zinc-900">API usage</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Audit trail of AI provider spend across every exam — not a per-exam breakdown.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-600" strokeWidth={2} />
                    <p className="text-sm font-bold text-zinc-900">Claude</p>
                    <Badge tone="neutral">{usage.claude.model}</Badge>
                  </div>
                  <p className="text-lg font-extrabold text-zinc-900">
                    {formatUsd(usage.claude.total_estimated_cost_usd)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {usage.claude.total_calls} {usage.claude.total_calls === 1 ? "call" : "calls"} ·{" "}
                  {usage.claude.total_input_tokens.toLocaleString()} in /{" "}
                  {usage.claude.total_output_tokens.toLocaleString()} out tokens
                </p>

                {usage.claude.by_call_type.length > 0 && (
                  <div className="mt-3 flex flex-col divide-y divide-zinc-100 border-t border-zinc-100">
                    {usage.claude.by_call_type.map((row) => (
                      <div key={row.call_type} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-zinc-600">
                          {CALL_TYPE_LABEL[row.call_type] ?? row.call_type}
                          <span className="ml-1.5 text-xs text-zinc-400">× {row.call_count}</span>
                        </span>
                        <span className="font-medium text-zinc-900">{formatUsd(row.estimated_cost_usd)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
                  {usage.claude.note}
                  {usage.claude.has_unpriced_calls && " Some calls used a model not in our pricing table — shown as — above."}
                </p>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                    <p className="text-sm font-bold text-zinc-900">ElevenLabs (voice)</p>
                    {usage.elevenlabs?.tier && <Badge tone="neutral">{usage.elevenlabs.tier}</Badge>}
                  </div>
                </div>

                {usage.elevenlabs ? (
                  <>
                    <p className="mt-1 text-xs text-zinc-500">
                      {usage.elevenlabs.characters_used.toLocaleString()} /{" "}
                      {usage.elevenlabs.characters_limit.toLocaleString()} characters used this period
                    </p>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${Math.min(
                            100,
                            (usage.elevenlabs.characters_used / Math.max(usage.elevenlabs.characters_limit, 1)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-zinc-900">
                      {usage.elevenlabs.characters_remaining?.toLocaleString() ?? "—"} characters remaining
                    </p>
                    <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
                      Pulled live from ElevenLabs&apos; own account API on every load — not something we track
                      ourselves, since they already expose real remaining quota.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-zinc-500">
                    {usage.elevenlabs_error ?? "ElevenLabs isn't configured."}
                  </p>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
