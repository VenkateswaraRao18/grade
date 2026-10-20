"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldError } from "@/components/ui/Input";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";
import { CameraCapture } from "@/components/exam/CameraCapture";
import { IdCardSample } from "@/components/exam/IdCardSample";
import { cn } from "@/lib/cn";

interface VerifyResult {
  matched: boolean;
  id_verified: boolean;
  extracted_text: string;
}

export default function VerifyIdPage() {
  const { user } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return <PageSpinner />;

  async function handlePhoto(file: File) {
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getToken();
      const res = await apiFetch<VerifyResult>("/identity/verify-id-photo", {
        method: "POST",
        body: formData,
        token: token ?? undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function retake() {
    setPreviewUrl(null);
    setResult(null);
    setError(null);
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Exams", href: "/student" }, { label: "Verify ID" }]}
        title="Verify your ID"
        description={
          <>
            Take a clear photo of your student ID card. We&apos;ll match the U-number against the
            one on your account (<span className="font-mono text-zinc-700">{user.student_id_number}</span>).
          </>
        }
      />

      <div className="mx-auto w-full max-w-md px-6 py-8 sm:px-8">
      <Card className="p-5">
        {!previewUrl && (
          <div className="rounded-[3px] border border-zinc-200 bg-white py-3">
            <IdCardSample />
          </div>
        )}

        <div className="mt-3 rounded-[3px] border border-zinc-200 bg-white p-3">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="ID preview" className="mx-auto max-h-64 rounded-md" />
          ) : (
            <CameraCapture onCapture={handlePhoto} />
          )}
        </div>

        {submitting && <p className="mt-3 text-center text-xs text-zinc-500">Verifying...</p>}

        <FieldError>{error}</FieldError>

        {previewUrl && !submitting && (
          <Button variant="secondary" size="sm" onClick={retake} className="mt-3 w-full">
            Retake photo
          </Button>
        )}
      </Card>

      {result && (
        <div
          className={cn(
            "mt-5 flex items-start gap-3 rounded-[3px] p-4 text-sm",
            result.matched ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          )}
        >
          {result.matched ? (
            <CheckCircle2 className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
          ) : (
            <XCircle className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
          )}
          <span>
            {result.matched
              ? "Match found — your ID is now verified."
              : "No match found in the photo. Try a clearer photo, or contact your instructor if this keeps failing."}
          </span>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-[3px] border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Text OCR read from your photo
          </p>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-zinc-700">
            {result.extracted_text || "(no text detected)"}
          </pre>
          <p className="mt-2 text-xs text-zinc-500">
            We check whether{" "}
            <span className="font-mono text-zinc-700">{user.student_id_number}</span> appears
            anywhere in the text above (ignoring spacing/case). This is the real OCR output — not
            a placeholder.
          </p>
        </div>
      )}
      </div>
    </>
  );
}
