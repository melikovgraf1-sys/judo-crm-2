// @flow
import React, { useState } from "react";
import { uid } from "../App";

export type Toast = { id: string; text: string; type?: "success" | "error" | "info" };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (text: string, type: Toast["type"] = "info") => {
    const t = { id: uid(), text, type };
    setToasts(prev => [...prev, t]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500);
  };
  return { toasts, push };
}

export default function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-3 rounded-xl shadow border text-sm ${t.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : t.type === "error" ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-slate-50 border-slate-200 text-slate-800"}`}>{t.text}</div>
      ))}
    </div>
  );
}
