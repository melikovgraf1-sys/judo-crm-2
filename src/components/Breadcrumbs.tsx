import React from "react";

export default function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <nav className="text-sm" aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {items.map((it, index) => (
          <li key={index} className="flex items-center gap-2">
            <span
              className={
                index === items.length - 1
                  ? "rounded-full bg-sky-500/10 px-3 py-1 text-sky-600 shadow-sm dark:bg-sky-500/20 dark:text-sky-200"
                  : "text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }
            >
              {it}
            </span>
            {index < items.length - 1 && <span className="text-slate-300 dark:text-slate-600">›</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
