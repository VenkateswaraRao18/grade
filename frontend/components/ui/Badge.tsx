import { cn } from "@/lib/cn";

type Tone = "success" | "warning" | "neutral";

const toneClasses: Record<Tone, string> = {
  success: "bg-white text-emerald-700 border border-emerald-600/40",
  warning: "bg-white text-amber-700 border border-amber-600/40",
  neutral: "bg-white text-zinc-600 border border-zinc-400",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[3px] px-2 py-0.5 text-xs font-bold",
        toneClasses[tone]
      )}
    >
      {children}
    </span>
  );
}
