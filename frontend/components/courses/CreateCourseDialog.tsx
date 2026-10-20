"use client";

import { useState } from "react";
import { apiFetchJson, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Course } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Input";

export function CreateCourseDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (course: Course) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const token = getToken() ?? undefined;
      const course = await apiFetchJson<Course>("/courses", { name }, { token });
      onCreated(course);
      setName("");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create course.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New course" description="Give it a name — you can add modules next.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="course-name">Course name</Label>
          <Input
            id="course-name"
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Operating Systems"
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Creating..." : "Create course"}
        </Button>
      </form>
    </Dialog>
  );
}
