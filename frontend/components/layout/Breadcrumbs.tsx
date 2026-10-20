import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-zinc-500">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-zinc-300" strokeWidth={2} />}
          {item.href ? (
            <Link href={item.href} className="hover:text-zinc-900">
              {item.label}
            </Link>
          ) : (
            <span className="text-zinc-900">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
