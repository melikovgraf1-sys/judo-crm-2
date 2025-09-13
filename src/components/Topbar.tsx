import React from "react";
import { saveUI } from "../App";
import type { UIState, Role, Currency } from "../App";

export default function Topbar({ ui, setUI, roleList, onQuickAdd }: { ui: UIState; setUI: (u: UIState) => void; roleList: Role[]; onQuickAdd: () => void }) {
  return (
    <div className="w-full flex flex-wrap items-center justify-between gap-2 p-3 bg-white/70 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="font-semibold text-slate-800 text-lg">Judo CRM</div>
        <div className="hidden sm:block text-xs text-slate-500">спокойные синие/голубые — KPI зелёные</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          placeholder="Поиск…"
          className="px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring focus:ring-sky-200"
          value={ui.search}
          onChange={e => { const u = { ...ui, search: e.target.value }; setUI(u); saveUI(u); }}
        />
          <select
            className="px-2 py-2 rounded-md border border-slate-300 text-sm"
            value={ui.currency}
            onChange={e => { const u: UIState = { ...ui, currency: e.target.value as Currency }; setUI(u); saveUI(u); }}
          >
          <option value="EUR">€</option>
          <option value="TRY">TRY</option>
          <option value="RUB">RUB</option>
        </select>
        <button onClick={onQuickAdd} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700">+ Быстро добавить</button>
          <select
            className="px-2 py-2 rounded-md border border-slate-300 text-sm"
            value={ui.role}
            onChange={e => { const u = { ...ui, role: e.target.value as Role }; setUI(u); saveUI(u); }}
            title="Войти как"
          >
            {roleList.map((r: Role) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
    );
  }
