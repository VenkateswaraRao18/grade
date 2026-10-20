import Link from "next/link";
import { GraduationCap, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";

const features = [
  {
    icon: Mic,
    title: "Voice-driven exams",
    description: "An adaptive AI examiner asks follow-ups grounded in your course materials.",
  },
  {
    icon: ShieldCheck,
    title: "Identity verified",
    description: "Lightweight ID-photo check confirms who's actually sitting the exam.",
  },
  {
    icon: Sparkles,
    title: "Instructor in the loop",
    description: "AI drafts the grade; instructors review, adjust, and publish.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-[3px] bg-sky-600 text-white">
            <GraduationCap className="h-4.5 w-4.5" strokeWidth={2} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-zinc-900">ORAL</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            Log in
          </Link>
          <Link href="/register">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <span className="mb-5 inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-600/10">
          AI-powered oral examinations
        </span>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
          Oral exams that scale, without losing the conversation
        </h1>
        <p className="mt-5 max-w-xl text-base text-zinc-600 sm:text-lg">
          Instructors set the scope. AI conducts the live voice exam and drafts a grade.
          Instructors review before anything reaches a student.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link href="/register">
            <Button size="md" className="w-full sm:w-auto">
              Create an account
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" size="md" className="w-full sm:w-auto">
              Log in
            </Button>
          </Link>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-6 pb-20 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-[3px] border border-zinc-200 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-[3px] bg-zinc-100">
              <f.icon className="h-5 w-5 text-zinc-700" strokeWidth={1.75} />
            </div>
            <p className="mt-4 text-sm font-semibold text-zinc-900">{f.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{f.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
