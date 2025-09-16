import React from "react";
import Modal from "./Modal";

export default function QuickAddModal({ open, onClose, onAddClient, onAddLead, onAddTask }: { open: boolean; onClose: () => void; onAddClient: () => void; onAddLead: () => void; onAddTask: () => void }) {
  if (!open) return null;
  return (
    <Modal size="md" onClose={onClose}>
      <div className="font-semibold">Быстро добавить</div>
      <div className="grid gap-2">
        <button onClick={onAddClient} className="px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700">+ Клиента</button>
        <button onClick={onAddLead} className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 bg-white dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700">+ Лида</button>
        <button onClick={onAddTask} className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 bg-white dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700">+ Задачу</button>
      </div>
      <div className="flex justify-end">
        <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800">Закрыть</button>
      </div>
    </Modal>
  );
}
