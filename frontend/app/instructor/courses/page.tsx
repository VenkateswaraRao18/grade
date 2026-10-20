"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { Course } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";
import { CourseCard } from "@/components/courses/CourseCard";
import { CreateCourseDialog } from "@/components/courses/CreateCourseDialog";

export default function CoursesIndexPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    apiFetch<Course[]>("/courses", { token }).then(setCourses).finally(() => setLoading(false));
  }, [user]);

  if (!user || loading) return <PageSpinner />;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: "/instructor" }, { label: "Courses" }]}
        title="Courses"
        description="Manage modules, materials, and exams for each course."
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            New course
          </Button>
        }
      />

      <div className="px-6 py-8 sm:px-8">
        {courses.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            description="Create your first course to start adding modules and materials."
            action={<Button onClick={() => setDialogOpen(true)}>New course</Button>}
          />
        )}

        {courses.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </div>

      <CreateCourseDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(course) => setCourses((prev) => [course, ...prev])}
      />
    </>
  );
}
