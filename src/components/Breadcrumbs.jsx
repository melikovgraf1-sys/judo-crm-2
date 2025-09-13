// @flow
import React from "react";

export default function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <nav className="text-sm text-slate-500 mb-2" aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center">
            <span className={i === items.length - 1 ? "text-slate-900" : "hover:underline"}>{it}</span>
            {i < items.length - 1 && <span className="mx-2">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
