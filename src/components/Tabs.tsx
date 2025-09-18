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
    <div className="w-full overflow-x-auto border-b border-slate-200 bg-gradient-to-r from-sky-50 to-blue-50 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900">
      <div className="flex gap-1 p-2">
        {visible.map(t => (
          <NavLink
            key={t.key}
            to={`/${t.key}`}
            className={({ isActive }: { isActive: boolean }) =>
              `px-3 py-2 rounded-md text-sm ${
                isActive
                  ? "bg-white text-sky-700 border border-sky-200 dark:bg-slate-800 dark:text-sky-400 dark:border-slate-700"
                  : "text-slate-700 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-slate-800/80"
              }`}
          >
            {t.title}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

