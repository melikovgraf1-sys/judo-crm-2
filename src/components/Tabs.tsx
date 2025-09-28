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
  { key: "attendance", title: "Посещаемость", need: r => can(r, "attendance") },
  { key: "performance", title: "Успеваемость", need: r => can(r, "performance") },
  { key: "tasks", title: "Задачи", need: r => can(r, "tasks") },
  { key: "leads", title: "Лиды", need: r => can(r, "leads") },
  { key: "schedule", title: "Расписание", need: r => can(r, "schedule") },
  { key: "clients", title: "Клиенты", need: r => can(r, "manage_clients") },
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
    <nav className="flex w-max items-center gap-1 rounded-full border border-slate-200/70 bg-white/85 px-1 py-1 text-sm shadow-inner shadow-slate-200/50 transition dark:border-slate-800/70 dark:bg-slate-900/70 dark:shadow-none">
      {visible.map(t => (
        <NavLink
          key={t.key}
          to={`/${t.key}`}
          className={({ isActive }: { isActive: boolean }) =>
            `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 dark:focus-visible:ring-sky-500/40 ${
              isActive
                ? "bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-md shadow-sky-500/30"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            }`
          }
        >
          {t.title}
        </NavLink>
      ))}
    </nav>
  );
}

