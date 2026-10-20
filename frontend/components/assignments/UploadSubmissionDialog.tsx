"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Submission } from "@/lib/types";
import { UPLOAD_ACCEPT, UPLOAD_HINT } from "@/lib/fileTypes";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Input";

export function UploadSubmissionDialog({
  open,
  onClose,
  assignmentId,
  assignmentTitle,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  assignmentId: string;
  assignmentTitle: string;
  onUploaded: (submission: Submission) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError(`Choose a file first (${UPLOAD_HINT}).`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getToken() ?? undefined;
      const submission = await apiFetch<Submission>(`/assignments/${assignmentId}/submission`, {
        method: "POST",
        body: formData,
        token,
      });
      onUploaded(submission);
      setSelectedFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Submit your work" description={assignmentTitle}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-center gap-3 rounded-[3px] border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 hover:border-sky-300 hover:bg-sky-50/40">
          <Upload className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{selectedFileName ?? `Choose a file (${UPLOAD_HINT})`}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
        <p className="text-xs text-zinc-500">
          Resubmitting replaces your previous file. Your oral exam questions on this assignment will
          be grounded in whatever you submit here.
        </p>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Uploading..." : "Submit"}
        </Button>
      </form>
    </Dialog>
  );
}
