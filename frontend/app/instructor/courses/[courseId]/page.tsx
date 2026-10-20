"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardList, FileText, Layers, Plus, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { AssignmentWithModule, Course, CourseModule, Exam } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { ModuleCard } from "@/components/modules/ModuleCard";
import { CreateModuleDialog } from "@/components/modules/CreateModuleDialog";

export default function CoursePage(props: PageProps<"/instructor/courses/[courseId]">) {
  const { courseId } = use(props.params);
  const { user } = useAuth();
  const router = useRouter();

  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithModule[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);

  const [editingCourse, setEditingCourse] = useState(false);
  const [savingCourse, setSavingCourse] = useState(false);
  const [courseError, setCourseError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    Promise.all([
      apiFetch<Course>(`/courses/${courseId}`, { token }),
      apiFetch<CourseModule[]>(`/courses/${courseId}/modules`, { token }),
      apiFetch<AssignmentWithModule[]>(`/courses/${courseId}/assignments`, { token }),
      apiFetch<Exam[]>(`/courses/${courseId}/exams`, { token }),
    ])
      .then(([c, m, a, e]) => {
        setCourse(c);
        setModules(m);
        setAssignments(a);
        setExams(e);
      })
      .catch(() => setError("Could not load this course."))
      .finally(() => setDataLoading(false));
  }, [user, courseId]);

  function startEditCourse() {
    if (!course) return;
    setDraftName(course.name);
    setCourseError(null);
    setEditingCourse(true);
  }

  async function saveCourse() {
    setSavingCourse(true);
    setCourseError(null);
    try {
      const token = getToken() ?? undefined;
      const updated = await apiFetch<Course>(`/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName }),
        token,
      });
      setCourse(updated);
      setEditingCourse(false);
    } catch (err) {
      setCourseError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setSavingCourse(false);
    }
  }

  async function handleDeleteCourse() {
    setDeleting(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/courses/${courseId}`, { method: "DELETE", token });
      router.push("/instructor/courses");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete course.");
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
          { label: course?.name ?? "" },
        ]}
        title={course?.name ?? ""}
        action={
          <div className="flex items-center gap-2">
            {!editingCourse && (
              <Button variant="secondary" onClick={startEditCourse}>
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

      {editingCourse && (
        <div className="px-6 pt-4 sm:px-8">
          <Card className="flex flex-col gap-3 p-6 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="course-name">
                Course name
              </label>
              <Input id="course-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
              {courseError && <p className="mt-1.5 text-sm text-red-600">{courseError}</p>}
            </div>
            <div className="flex gap-2">
              <Button onClick={saveCourse} disabled={savingCourse}>
                {savingCourse ? "Saving..." : "Save"}
              </Button>
              <Button variant="ghost" onClick={() => setEditingCourse(false)} disabled={savingCourse}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      <div className="px-6 py-8 sm:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href={`/instructor/courses/${courseId}/assignments`}>
            <Card className="group flex items-center justify-between p-4 transition-colors hover:bg-zinc-50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-50">
                  <FileText className="h-5 w-5 text-sky-600" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="font-medium text-zinc-900">Assignments</p>
                  <p className="text-xs text-zinc-500">{assignments.length} total</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-sky-500" />
            </Card>
          </Link>
          <Link href={`/instructor/courses/${courseId}/exams`}>
            <Card className="group flex items-center justify-between p-4 transition-colors hover:bg-zinc-50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-50">
                  <ClipboardList className="h-5 w-5 text-sky-600" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="font-medium text-zinc-900">Exams</p>
                  <p className="text-xs text-zinc-500">{exams.length} total</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-sky-500" />
            </Card>
          </Link>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Modules</h2>
            <Button variant="secondary" size="sm" onClick={() => setModuleDialogOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Add module
            </Button>
          </div>
          <div className="mt-3">
            {modules.length === 0 && (
              <EmptyState
                icon={Layers}
                title="No modules yet"
                description="Add a module to organize this course's material."
              />
            )}
            {modules.length > 0 && (
              <div className="flex flex-col gap-3">
                {modules.map((module) => (
                  <ModuleCard key={module.id} courseId={courseId} module={module} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateModuleDialog
        open={moduleDialogOpen}
        onClose={() => setModuleDialogOpen(false)}
        courseId={courseId}
        onCreated={(module) => setModules((prev) => [...prev, module])}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteCourse}
        busy={deleting}
        danger
        title="Delete this course?"
        description={
          modules.length > 0 || exams.length > 0
            ? `Remove its ${modules.length} module${modules.length === 1 ? "" : "s"} and ${exams.length} exam${exams.length === 1 ? "" : "s"} first — a course with content can't be deleted.`
            : "This can't be undone."
        }
        confirmLabel={deleting ? "Deleting..." : "Delete course"}
      />
    </>
  );
}
