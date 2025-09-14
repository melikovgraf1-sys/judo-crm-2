// @flow
import React, { useState } from "react";
import Breadcrumbs from "./Breadcrumbs";
import Modal from "./Modal";
import { fmtDate, uid, saveDB, todayISO } from "../App";
import type { DB, TaskItem } from "../App";

export default function TasksTab({ db, setDB }: { db: DB; setDB: (db: DB) => void }) {
  const [edit, setEdit] = useState<TaskItem | null>(null);
  const toggle = (id: string) => {
    const next = { ...db, tasks: db.tasks.map(t => t.id === id ? { ...t, status: t.status === "open" ? "done" : "open" } : t) };
    setDB(next); saveDB(next);
  };
  const save = () => {
    if (!edit) return;
    const next = { ...db, tasks: db.tasks.map(t => t.id === edit.id ? edit : t) };
    setDB(next); saveDB(next); setEdit(null);
  };
  const add = () => {
    const t: TaskItem = { id: uid(), title: "Новая задача", due: todayISO(), status: "open" };
    const next = { ...db, tasks: [t, ...db.tasks] };
    setDB(next); saveDB(next);
  };
  const remove = (id: string) => {
    if (!confirm("Удалить задачу?")) return;
    const next = { ...db, tasks: db.tasks.filter(t => t.id !== id) };
    setDB(next); saveDB(next);
  };
  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Задачи"]} />
      <button onClick={add} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700">+ задача</button>
      <ul className="space-y-2">
        {db.tasks.map(t => (
          <li key={t.id} className="p-3 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={t.status === "done"} onChange={() => toggle(t.id)} />
              <span className={`text-sm ${t.status === "done" ? "line-through text-slate-500" : ""}`}>{t.title}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">{fmtDate(t.due)}</span>
              <button onClick={() => setEdit(t)} className="px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800">✎</button>
              <button onClick={() => remove(t.id)} className="px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800">✕</button>
            </div>
          </li>
        ))}
      </ul>
      {edit && (
        <Modal size="md" onClose={() => setEdit(null)}>
          <div className="font-semibold text-slate-800">Редактирование задачи</div>
          <input className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} />
          <input type="date" className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" value={edit.due.slice(0,10)} onChange={e => setEdit({ ...edit, due: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEdit(null)} className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800">Отмена</button>
            <button onClick={save} className="px-3 py-2 rounded-md bg-sky-600 text-white">Сохранить</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
