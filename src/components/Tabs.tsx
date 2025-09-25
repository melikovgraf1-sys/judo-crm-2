import { NavLink } from "react-router-dom";
import { can } from "../state/appState";
import type { Role } from "../types";

interface TabConfig {
  key: string;
  title: string;
  need?: (role: Role) => boolean;
}

const TABS: TabConfig[] = [
  { key: "dashboard", title: "Дашборд" },
  { key: "analytics", title: "Аналитика", need: r => can(r, "analytics") },
  { key: "groups", title: "Группы", need: r => can(r, "manage_clients") },
  { key: "clients", title: "Клиенты", need: r => can(r, "manage_clients") },
  { key: "attendance", title: "Посещаемость", need: r => can(r, "attendance") },
  { key: "performance", title: "Успеваемость", need: r => can(r, "performance") },
  { key: "tasks", title: "Задачи", need: r => can(r, "tasks") },
  { key: "schedule", title: "Расписание", need: r => can(r, "schedule") },
  { key: "leads", title: "Лиды", need: r => can(r, "leads") },
  { key: "appeals", title: "Обращения", need: r => can(r, "appeals") },
  { key: "settings", title: "Настройки", need: r => can(r, "settings") },
];

export const TAB_TITLES: Record<string, string> = TABS.reduce<Record<string, string>>(
  (acc, t) => ({ ...acc, [t.key]: t.title }),
  {},
);

interface TabsProps {
  role: Role;
}

export default function Tabs({ role }: TabsProps) {
  const visible = TABS.filter(t => !t.need || t.need(role));
  return (
    <div className="border-b border-transparent bg-gradient-to-r from-white/70 via-slate-50/60 to-white/70 backdrop-blur-sm dark:from-slate-950/70 dark:via-slate-900/70 dark:to-slate-950/70">
      <div className="mx-auto max-w-7xl px-4">
        <div className="relative flex overflow-x-auto rounded-full border border-slate-200/70 bg-white/80 p-1 shadow-inner shadow-slate-200/60 dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-none">
          {visible.map(t => (
            <NavLink
              key={t.key}
              to={`/${t.key}`}
              className={({ isActive }: { isActive: boolean }) =>
                `whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 dark:focus-visible:ring-sky-500/40 ${
                  isActive
                    ? "bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-md shadow-sky-500/30"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`
              }
            >
              {t.title}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

