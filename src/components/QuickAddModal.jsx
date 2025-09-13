// @flow
import React from "react";

export default function QuickAddModal({ open, onClose, onAddClient, onAddLead, onAddTask }: { open: boolean; onClose: () => void; onAddClient: () => void; onAddLead: () => void; onAddTask: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 space-y-3">
        <div className="font-semibold">Быстро добавить</div>
        <div className="grid gap-2">
          <button onClick={onAddClient} className="px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700">+ Клиента</button>
          <button onClick={onAddLead} className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">+ Лида</button>
          <button onClick={onAddTask} className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">+ Задачу</button>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300">Закрыть</button>
        </div>
      </div>
    </div>
  );
}
