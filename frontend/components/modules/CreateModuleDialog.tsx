"use client";

import { useState } from "react";
import { apiFetchJson, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { CourseModule } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/Input";

export function CreateModuleDialog({
  open,
  onClose,
  courseId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  courseId: string;
  onCreated: (module: CourseModule) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const token = getToken() ?? undefined;
      const newModule = await apiFetchJson<CourseModule>(
        `/courses/${courseId}/modules`,
        { title, description: description || undefined },
        { token }
      );
      onCreated(newModule);
      setTitle("");
      setDescription("");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create module.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add a module" description="Organize this course's material by topic.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="module-title">Title</Label>
          <Input id="module-title" autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="module-description">Description</Label>
          <Textarea
            id="module-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Adding..." : "Add module"}
        </Button>
      </form>
    </Dialog>
  );
}
