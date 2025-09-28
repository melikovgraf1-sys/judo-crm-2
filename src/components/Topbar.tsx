import React, { useCallback, useRef } from "react";
import type { AuthUser, Currency, UIState } from "../types";

type TopbarProps = {
  ui: UIState;
  setUI: React.Dispatch<React.SetStateAction<UIState>>;
  onQuickAdd: () => void;
  currentUser: AuthUser;
  onLogout: () => void;
};

const CONTROL_CLASS =
  "rounded-xl border border-slate-200/60 bg-white/70 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200/60 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200 dark:focus:border-sky-500/60 dark:focus:ring-sky-500/30";

export default function Topbar({ ui, setUI, onQuickAdd, currentUser, onLogout }: TopbarProps) {
  const searchTimeout = useRef<number | null>(null);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (searchTimeout.current) {
      window.clearTimeout(searchTimeout.current);
    }
    searchTimeout.current = window.setTimeout(() => {
      setUI(u => ({ ...u, search: value }));
    }, 300);
  }, [setUI]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl shadow-sm transition-colors duration-300 dark:border-slate-800/60 dark:bg-slate-950/70">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-500 text-lg font-semibold text-white shadow-lg shadow-sky-500/30">
            JC
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">Judo CRM</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Современная панель для тренеров и администраторов</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-1 sm:gap-3">
          <div className="relative min-w-[200px] w-full flex-1 sm:max-w-sm">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            >
              🔍
            </span>
            <input
              placeholder="Поиск по CRM…"
              className={`${CONTROL_CLASS} w-full pl-9 pr-3 font-normal text-slate-700 placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500`}
              value={ui.search}
              onChange={handleSearch}
            />
          </div>
          <select
            className={`${CONTROL_CLASS} w-auto`}
            value={ui.currency}
            onChange={e => {
              const u = { ...ui, currency: e.target.value as Currency };
              setUI(u);
            }}
          >
            <option value="EUR">€ Евро</option>
            <option value="TRY">₺ Лира</option>
            <option value="RUB">₽ Рубль</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setUI(prev => ({ ...prev, theme: prev.theme === "light" ? "dark" : "light" }));
            }}
            className={`${CONTROL_CLASS} inline-flex items-center justify-center text-base`}
            title="Переключить тему"
          >
            {ui.theme === "light" ? "🌙" : "☀️"}
          </button>
          <button
            type="button"
            onClick={onQuickAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-sky-300/60 dark:focus:ring-sky-500/40"
          >
            <span aria-hidden="true">＋</span> Быстро добавить
          </button>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white/70 px-3 py-2 text-left shadow-sm transition dark:border-slate-700/60 dark:bg-slate-900/70">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/20 text-base font-semibold text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
              {(currentUser.name || currentUser.login).slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{currentUser.name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{currentUser.role}</div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="ml-3 inline-flex items-center rounded-lg border border-slate-300/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
            >
              Выйти
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
