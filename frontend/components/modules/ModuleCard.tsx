import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { CourseModule } from "@/lib/types";

export function ModuleCard({ courseId, module }: { courseId: string; module: CourseModule }) {
  return (
    <Link href={`/instructor/courses/${courseId}/modules/${module.id}`}>
      <div className="flex items-center justify-between rounded-[3px] border border-zinc-300 bg-zinc-50 px-4 py-3 transition-colors hover:bg-zinc-100">
        <div className="flex items-center gap-2.5">
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={2} />
          <div>
            <p className="text-[15px] font-bold text-zinc-900">{module.title}</p>
            {module.description && <p className="mt-0.5 text-sm text-zinc-500">{module.description}</p>}
          </div>
        </div>
      </div>
    </Link>
  );
}
