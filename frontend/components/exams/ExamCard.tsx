import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Exam } from "@/lib/types";

export function ExamCard({ courseId, exam }: { courseId: string; exam: Exam }) {
  return (
    <Link href={`/instructor/courses/${courseId}/exams/${exam.id}`}>
      <div className="group flex items-center justify-between rounded-[3px] border border-zinc-300 bg-white px-4 py-3 transition-colors hover:bg-zinc-50">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-4 w-4 shrink-0 text-sky-600" strokeWidth={2} />
          <div>
            <p className="text-sm font-bold text-sky-700 group-hover:underline">{exam.name}</p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
              <span>{exam.duration_minutes} min</span>
              <span className="capitalize">{exam.difficulty}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={exam.status === "published" ? "success" : "neutral"}>{exam.status}</Badge>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" strokeWidth={2} />
        </div>
      </div>
    </Link>
  );
}
