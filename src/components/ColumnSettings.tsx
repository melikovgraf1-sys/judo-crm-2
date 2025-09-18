import React, { useEffect, useRef, useState } from "react";

export interface ColumnOption {
  id: string;
  label: string;
  disableToggle?: boolean;
}

interface ColumnSettingsProps {
  options: ColumnOption[];
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

export default function ColumnSettings({ options, value, onChange, className }: ColumnSettingsProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggleColumn = (id: string) => {
    const isActive = value.includes(id);
    if (isActive) {
      const next = value.filter(colId => colId !== id);
      if (next.length === 0) {
        return;
      }
      onChange(next);
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className={`relative ${className ?? ""}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white shadow-sm hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:hover:bg-slate-700"
      >
        Настроить столбцы
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Отображение столбцов
          </div>
          <ul className="space-y-1">
            {options.map(option => {
              const checked = value.includes(option.id);
              const disabled = option.disableToggle || (checked && value.length === 1);
              return (
                <li key={option.id}>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition hover:bg-slate-100 dark:hover:bg-slate-700 ${disabled ? "opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleColumn(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
