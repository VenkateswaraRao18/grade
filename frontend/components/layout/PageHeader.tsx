import { Crumb, Breadcrumbs } from "./Breadcrumbs";

export function PageHeader({
  breadcrumbs,
  title,
  description,
  action,
}: {
  breadcrumbs?: Crumb[];
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-b border-zinc-200 bg-white px-6 py-5 sm:px-8">
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      <div className={`flex items-start justify-between gap-4 ${breadcrumbs?.length ? "mt-1.5" : ""}`}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
