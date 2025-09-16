import React, { useCallback, useRef } from "react";
import type { Currency, Role, UIState } from "../types";

type TopbarProps = {
  ui: UIState;
  setUI: React.Dispatch<React.SetStateAction<UIState>>;
  roleList: Role[];
  onQuickAdd: () => void;
};

export default function Topbar({ ui, setUI, roleList, onQuickAdd }: TopbarProps) {
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
    <div className="w-full flex flex-wrap items-center justify-between gap-2 p-3 bg-white/70 dark:bg-slate-800/70 backdrop-blur border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="font-semibold text-slate-800 dark:text-slate-100 text-lg">Judo CRM</div>
        <div className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">спокойные синие/голубые — KPI зелёные</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          placeholder="Поиск…"
          className="px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring focus:ring-sky-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          value={ui.search}
          onChange={handleSearch}
        />
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          value={ui.currency}
          onChange={e => { const u = { ...ui, currency: e.target.value as Currency }; setUI(u); }}
        >
          <option value="EUR">€</option>
          <option value="TRY">TRY</option>
          <option value="RUB">RUB</option>
        </select>
        <button
          onClick={() => {
            setUI(prev => ({ ...prev, theme: prev.theme === "light" ? "dark" : "light" }));
          }}
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          title="Переключить тему"
        >
          {ui.theme === "light" ? "🌙" : "☀️"}
        </button>
        <button onClick={onQuickAdd} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700">+ Быстро добавить</button>
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          value={ui.role}
          onChange={e => { const u = { ...ui, role: e.target.value as Role }; setUI(u); }}
          title="Войти как"
        >
          {roleList.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
    </div>
  );
}
