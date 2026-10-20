"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, ClipboardList, FileText, Plus, Trash2, Upload } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { Assignment, Course, CourseModule, CourseMaterial } from "@/lib/types";
import { UPLOAD_ACCEPT, UPLOAD_HINT } from "@/lib/fileTypes";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FieldError, Input, Label, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { CreateAssignmentDialog } from "@/components/assignments/CreateAssignmentDialog";

export default function ModulePage(
  props: PageProps<"/instructor/courses/[courseId]/modules/[moduleId]">
) {
  const { courseId, moduleId } = use(props.params);
  const { user } = useAuth();
  const router = useRouter();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [currentModule, setCurrentModule] = useState<CourseModule | null>(null);
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);

  const [editingModule, setEditingModule] = useState(false);
  const [savingModule, setSavingModule] = useState(false);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function loadMaterials() {
    const token = getToken() ?? undefined;
    return apiFetch<CourseMaterial[]>(`/modules/${moduleId}/materials`, { token }).then(setMaterials);
  }

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    Promise.all([
      apiFetch<Course>(`/courses/${courseId}`, { token }),
      apiFetch<CourseModule[]>(`/courses/${courseId}/modules`, { token }),
      apiFetch<Assignment[]>(`/modules/${moduleId}/assignments`, { token }),
      loadMaterials(),
    ])
      .then(([c, modules, a]) => {
        setCourse(c);
        setCurrentModule(modules.find((m) => m.id === moduleId) ?? null);
        setAssignments(a);
      })
      .catch(() => setError("Could not load this module."))
      .finally(() => setDataLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, moduleId]);

  async function handleUpload(e: React.FormEvent) {
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
      await apiFetch(`/modules/${moduleId}/materials`, { method: "POST", body: formData, token });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedFileName(null);
      await loadMaterials();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditModule() {
    if (!currentModule) return;
    setDraftTitle(currentModule.title);
    setDraftDescription(currentModule.description ?? "");
    setModuleError(null);
    setEditingModule(true);
  }

  async function saveModule() {
    setSavingModule(true);
    setModuleError(null);
    try {
      const token = getToken() ?? undefined;
      const updated = await apiFetch<CourseModule>(`/modules/${moduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle, description: draftDescription || null }),
        token,
      });
      setCurrentModule(updated);
      setEditingModule(false);
    } catch (err) {
      setModuleError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setSavingModule(false);
    }
  }

  async function handleDeleteModule() {
    setDeleting(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/modules/${moduleId}`, { method: "DELETE", token });
      router.push(`/instructor/courses/${courseId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete module.");
      setDeleteConfirmOpen(false);
      setDeleting(false);
    }
  }

  if (!user || dataLoading) return <PageSpinner />;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Courses", href: "/instructor/courses" },
          { label: course?.name ?? "", href: `/instructor/courses/${courseId}` },
          { label: currentModule?.title ?? "Module" },
        ]}
        title={currentModule?.title ?? "Module"}
        action={
          <div className="flex items-center gap-2">
            {!editingModule && (
              <Button variant="secondary" onClick={startEditModule}>
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

      {error && <p className="px-6 pt-4 text-sm text-red-600 sm:px-8">{error}</p>}

      {editingModule && (
        <div className="px-6 pt-4 sm:px-8">
          <Card className="p-6">
            <p className="text-sm font-bold text-zinc-900">Edit module</p>
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <Label htmlFor="module-title">Title</Label>
                <Input id="module-title" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="module-description">Description</Label>
                <Textarea
                  id="module-description"
                  rows={2}
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                />
              </div>
              {moduleError && <p className="text-sm text-red-600">{moduleError}</p>}
              <div className="flex gap-2">
                <Button onClick={saveModule} disabled={savingModule}>
                  {savingModule ? "Saving..." : "Save changes"}
                </Button>
                <Button variant="ghost" onClick={() => setEditingModule(false)} disabled={savingModule}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 px-6 py-8 sm:px-8 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Course materials</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Uploads are chunked, embedded, and indexed for question generation.
          </p>

          <Card className="mt-3 p-5">
            <form onSubmit={handleUpload} className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <label className="flex flex-1 cursor-pointer items-center gap-3 rounded-[3px] border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 hover:border-sky-300 hover:bg-sky-50/40">
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
              <Button type="submit" disabled={submitting} className="sm:w-auto">
                {submitting ? "Uploading..." : "Upload"}
              </Button>
            </form>
            <FieldError>{error}</FieldError>
          </Card>

          <div className="mt-3">
            {materials.length === 0 && <EmptyState icon={FileText} title="No materials uploaded yet" />}
            {materials.length > 0 && (
              <div className="flex flex-col gap-2">
                {materials.map((material) => (
                  <Card key={material.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[3px] bg-zinc-100">
                        <FileText className="h-4 w-4 text-zinc-500" strokeWidth={1.75} />
                      </div>
                      <span className="text-sm font-medium text-zinc-900">{material.original_filename}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {material.indexed ? (
                        <Badge tone="success">
                          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                          Indexed
                        </Badge>
                      ) : (
                        <Badge tone="warning">Indexing failed</Badge>
                      )}
                      <span className="text-xs text-zinc-500">
                        {new Date(material.ingested_at).toLocaleString()}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Assignments</h2>
              <p className="mt-1 text-xs text-zinc-500">Oral exams are scoped to these, not to modules directly.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setAssignmentDialogOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Add assignment
            </Button>
          </div>

          <div className="mt-3">
            {assignments.length === 0 && (
              <EmptyState
                icon={ClipboardList}
                title="No assignments yet"
                description="Add an assignment here so it can be selected as oral exam scope."
              />
            )}
            {assignments.length > 0 && (
              <div className="flex flex-col gap-2">
                {assignments.map((a) => (
                  <Link key={a.id} href={`/instructor/courses/${courseId}/assignments/${a.id}`}>
                    <Card className="group flex items-center justify-between p-4 transition-colors hover:bg-zinc-50">
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">{a.title}</p>
                        {a.description && (
                          <p className="mt-1 truncate text-sm text-zinc-600">{a.description}</p>
                        )}
                        {(a.due_at || a.points_possible != null) && (
                          <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
                            {a.due_at && <span>Due {new Date(a.due_at).toLocaleString()}</span>}
                            {a.due_at && a.points_possible != null && <span>·</span>}
                            {a.points_possible != null && <span>{a.points_possible} pts</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {a.instructor_answer ? (
                          <Badge tone="success">Ground truth set</Badge>
                        ) : (
                          <Badge tone="neutral">No ground truth</Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-zinc-300 transition-colors group-hover:text-sky-500" />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateAssignmentDialog
        open={assignmentDialogOpen}
        onClose={() => setAssignmentDialogOpen(false)}
        moduleId={moduleId}
        onCreated={(a) => setAssignments((prev) => [...prev, a])}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteModule}
        busy={deleting}
        danger
        title="Delete this module?"
        description={
          assignments.length > 0
            ? `Remove its ${assignments.length} assignment${assignments.length === 1 ? "" : "s"} first — a module with assignments can't be deleted.`
            : "Its uploaded materials will be removed too. This can't be undone."
        }
        confirmLabel={deleting ? "Deleting..." : "Delete module"}
      />
    </>
  );
}
