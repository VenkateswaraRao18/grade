"use client";

import { useState } from "react";
import { apiFetchJson, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Assignment } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/Input";

export function CreateAssignmentDialog({
  open,
  onClose,
  moduleId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  moduleId: string;
  onCreated: (assignment: Assignment) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pointsPossible, setPointsPossible] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const token = getToken() ?? undefined;
      const assignment = await apiFetchJson<Assignment>(
        `/modules/${moduleId}/assignments`,
        {
          title,
          description: description || undefined,
          due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
          points_possible: pointsPossible ? Number(pointsPossible) : undefined,
        },
        { token }
      );
      onCreated(assignment);
      setTitle("");
      setDescription("");
      setDueAt("");
      setPointsPossible("");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create assignment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add an assignment"
      description="Oral exams will be scoped to assignments like this one."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="assignment-title">Title</Label>
          <Input
            id="assignment-title"
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. A3. Probability Distributions"
          />
        </div>
        <div>
          <Label htmlFor="assignment-description">Description</Label>
          <Textarea
            id="assignment-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional — what the assignment asks students to do"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="assignment-due">Due date</Label>
            <Input
              id="assignment-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="assignment-points">Points</Label>
            <Input
              id="assignment-points"
              type="number"
              min={0}
              value={pointsPossible}
              onChange={(e) => setPointsPossible(e.target.value)}
            />
          </div>
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Adding..." : "Add assignment"}
        </Button>
      </form>
    </Dialog>
  );
}
