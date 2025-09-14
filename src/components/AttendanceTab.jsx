// @flow
import React, { useState, useMemo } from "react";
import Breadcrumbs from "./Breadcrumbs";
import VirtualizedTable from "./VirtualizedTable";
import { fmtDate, uid, saveDB } from "../App";
import type { DB, Area, Group, AttendanceEntry } from "../App";

export default function AttendanceTab({ db, setDB }: { db: DB; setDB: (db: DB) => void }) {
  const [area, setArea] = useState<Area | "all">("all");
  const [group, setGroup] = useState<Group | "all">("all");
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const list = useMemo(() => {
    return db.clients.filter(c => (area === "all" || c.area === area) && (group === "all" || c.group === group));
  }, [db.clients, area, group]);

  const todayMarks = useMemo(() => {
    const map: Map<string, AttendanceEntry> = new Map();
    db.attendance.forEach(a => {
      if (a.date.slice(0, 10) === todayStr) {
        map.set(a.clientId, a);
      }
    });
    return map;
  }, [db.attendance, todayStr]);

  const toggle = (clientId: string) => {
    const mark = todayMarks.get(clientId);
    if (mark) {
      const updated = { ...mark, came: !mark.came };
      const next = { ...db, attendance: db.attendance.map(a => a.id === mark.id ? updated : a) };
      setDB(next); saveDB(next);
    } else {
      const entry: AttendanceEntry = { id: uid(), clientId, date: new Date().toISOString(), came: true };
      const next = { ...db, attendance: [entry, ...db.attendance] };
      setDB(next); saveDB(next);
    }
  };

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Посещаемость"]} />
      <div className="flex flex-wrap items-center gap-2">
        <select className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" value={area} onChange={e => setArea(e.target.value)}>
          <option value="all">Все районы</option>
          {db.settings.areas.map(a => <option key={a}>{a}</option>)}
        </select>
        <select className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" value={group} onChange={e => setGroup(e.target.value)}>
          <option value="all">Все группы</option>
          {db.settings.groups.map(g => <option key={g}>{g}</option>)}
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
              <th className="text-left p-2">Отметка</th>
            </tr>
          </thead>
        )}
        items={list}
        rowHeight={44}
        renderRow={(c, style) => {
          const m = todayMarks.get(c.id);
          return (
            <tr key={c.id} style={style} className="border-t border-slate-100 dark:border-slate-700">
              <td className="p-2">{c.firstName} {c.lastName}</td>
              <td className="p-2">{c.area}</td>
              <td className="p-2">{c.group}</td>
              <td className="p-2">
                <button onClick={() => toggle(c.id)} className={`px-3 py-1 rounded-md text-xs border ${m?.came ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700" : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"}`}>
                  {m?.came ? "пришёл" : "не отмечен"}
                </button>
              </td>
            </tr>
          );
        }}
      />
    </div>
  );
}
