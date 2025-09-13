// @flow
import React from "react";
import { saveUI, can } from "../App";

const TABS = [
  { key: "dashboard", title: "Дашборд" },
  { key: "clients", title: "Клиенты", need: r => can(r, "manage_clients") },
  { key: "attendance", title: "Посещаемость", need: r => can(r, "attendance") },
  { key: "schedule", title: "Расписание", need: r => can(r, "schedule") },
  { key: "leads", title: "Лиды", need: r => can(r, "leads") },
  { key: "tasks", title: "Задачи", need: r => can(r, "tasks") },
  { key: "settings", title: "Настройки", need: r => can(r, "settings") },
];

export default function Tabs({ ui, setUI, role }) {
  const visible = TABS.filter(t => !t.need || t.need(role));
  return (
    <div className="w-full overflow-x-auto border-b border-slate-200 bg-gradient-to-r from-sky-50 to-blue-50">
      <div className="flex gap-1 p-2">
        {visible.map(t => (
          <button
            key={t.key}
            onClick={() => { const u = { ...ui, activeTab: t.key, breadcrumbs: [t.title] }; setUI(u); saveUI(u); }}
            className={`px-3 py-2 rounded-md text-sm ${ui.activeTab === t.key ? "bg-white text-sky-700 border border-sky-200" : "text-slate-700 hover:bg-white/80"}`}
          >
            {t.title}
          </button>
        ))}
      </div>
    </div>
  );
}
