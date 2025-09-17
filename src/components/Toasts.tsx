import { useCallback, useState } from "react";
import { uid } from "../state/utils";
import type { Toast } from "../types";

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback(
    (text: string, type: Toast["type"] = "info") => {
      const t: Toast = { id: uid(), text, type };
      setToasts((prev: Toast[]) => [...prev, t]);
      setTimeout(
        () => setToasts((prev: Toast[]) => prev.filter((x: Toast) => x.id !== t.id)),
        3500,
      );
    },
    [setToasts],
  );
  return { toasts, push };
}

export default function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl shadow border text-sm ${
            t.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300"
              : t.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-300"
                : "bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
