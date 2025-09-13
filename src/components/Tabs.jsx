// @flow
import React from "react";
import { NavLink } from "react-router-dom";
import { can } from "../App";

const TABS = [
  { key: "dashboard", title: "Дашборд" },
  { key: "clients", title: "Клиенты", need: r => can(r, "manage_clients") },
  { key: "attendance", title: "Посещаемость", need: r => can(r, "attendance") },
  { key: "schedule", title: "Расписание", need: r => can(r, "schedule") },
  { key: "leads", title: "Лиды", need: r => can(r, "leads") },
  { key: "tasks", title: "Задачи", need: r => can(r, "tasks") },
  { key: "settings", title: "Настройки", need: r => can(r, "settings") },
];

export const TAB_TITLES = TABS.reduce((acc, t) => ({ ...acc, [t.key]: t.title }), {});

export default function Tabs({ role }) {
  const visible = TABS.filter(t => !t.need || t.need(role));
  return (
    <div className="w-full overflow-x-auto border-b border-slate-200 bg-gradient-to-r from-sky-50 to-blue-50">
      <div className="flex gap-1 p-2">
        {visible.map(t => (
          <NavLink
            key={t.key}
            to={`/${t.key}`}
            className={({ isActive }) =>
              `px-3 py-2 rounded-md text-sm ${
                isActive ? "bg-white text-sky-700 border border-sky-200" : "text-slate-700 hover:bg-white/80"
              }`}
          >
            {t.title}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

