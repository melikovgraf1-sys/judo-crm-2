import React, { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import VirtualizedTable from "./VirtualizedTable";
import ClientDetailsModal from "./clients/ClientDetailsModal";
import { fmtDate, uid } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import type { Area, Currency, DB, Group, PerformanceEntry, Client } from "../types";

export default function PerformanceTab({
  db,
  setDB,
  currency,
}: {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  currency: Currency;
}) {
  const [area, setArea] = useState<Area | "all">("all");
  const [group, setGroup] = useState<Group | "all">("all");
  const [selected, setSelected] = useState<Client | null>(null);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const list = useMemo(() => {
    return db.clients.filter(
      c => (area === "all" || c.area === area) && (group === "all" || c.group === group),
    );
  }, [db.clients, area, group]);

  const todayMarks = useMemo(() => {
    const map: Map<string, PerformanceEntry> = new Map();
    db.performance.forEach(p => {
      if (p.date.slice(0, 10) === todayStr) {
        map.set(p.clientId, p);
      }
    });
    return map;
  }, [db.performance, todayStr]);

  const toggle = async (clientId: string) => {
    const mark = todayMarks.get(clientId);
    if (mark) {
      const updated = { ...mark, successful: !mark.successful };
      const next = {
        ...db,
        performance: db.performance.map(p => (p.id === mark.id ? updated : p)),
      };
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert("Не удалось обновить отметку успеваемости. Проверьте доступ к базе данных.");
      }
    } else {
      const entry: PerformanceEntry = {
        id: uid(),
        clientId,
        date: new Date().toISOString(),
        successful: true,
      };
      const next = { ...db, performance: [entry, ...db.performance] };
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert("Не удалось сохранить отметку успеваемости. Проверьте доступ к базе данных.");
      }
    }
  };

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Успеваемость"]} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={area}
          onChange={e => setArea(e.target.value)}
        >
          <option value="all">Все районы</option>
          {db.settings.areas.map(a => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={group}
          onChange={e => setGroup(e.target.value)}
        >
          <option value="all">Все группы</option>
          {db.settings.groups.map(g => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <div className="text-xs text-slate-500">Сегодня: {fmtDate(today.toISOString())}</div>
      </div>

      <VirtualizedTable
        header={(
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left p-2">Ученик</th>
              <th className="text-left p-2">Район</th>
              <th className="text-left p-2">Группа</th>
              <th className="text-left p-2">Оценка</th>
            </tr>
          </thead>
        )}
        items={list}
        rowHeight={44}
        renderRow={(c, style) => {
          const m = todayMarks.get(c.id);
          return (
            <tr key={c.id} style={style} className="border-t border-slate-100 dark:border-slate-700">
              <td className="p-2">
                <button
                  type="button"
                  onClick={() => setSelected(c)}
                  className="text-sky-600 hover:underline focus:outline-none dark:text-sky-400"
                >
                  {c.firstName} {c.lastName}
                </button>
              </td>
              <td className="p-2">{c.area}</td>
              <td className="p-2">{c.group}</td>
              <td className="p-2">
                <button
                  onClick={() => toggle(c.id)}
                  className={`px-3 py-1 rounded-md text-xs border ${
                    m
                      ? m.successful
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700"
                        : "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
                      : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                  }`}
                >
                  {m ? (m.successful ? "успевает" : "нужна работа") : "не оценён"}
                </button>
              </td>
            </tr>
          );
        }}
      />

      {selected && (
        <ClientDetailsModal
          client={selected}
          currency={currency}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
