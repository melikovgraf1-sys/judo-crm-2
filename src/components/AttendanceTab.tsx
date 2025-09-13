import React, { useState, useMemo } from "react";
import Breadcrumbs from "./Breadcrumbs";
import TableWrap from "./TableWrap";
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

  const getMark = (clientId: string) => db.attendance.find(a => a.clientId === clientId && a.date.slice(0,10) === todayStr);

  const toggle = (clientId: string) => {
    const mark = getMark(clientId);
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
        <select className="px-2 py-2 rounded-md border border-slate-300 text-sm" value={area} onChange={e => setArea(e.target.value)}>
          <option value="all">Все районы</option>
          {db.settings.areas.map(a => <option key={a}>{a}</option>)}
        </select>
        <select className="px-2 py-2 rounded-md border border-slate-300 text-sm" value={group} onChange={e => setGroup(e.target.value)}>
          <option value="all">Все группы</option>
          {db.settings.groups.map(g => <option key={g}>{g}</option>)}
        </select>
        <div className="text-xs text-slate-500">Сегодня: {fmtDate(today.toISOString())}</div>
      </div>

      <TableWrap>
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left p-2">Ученик</th>
            <th className="text-left p-2">Район</th>
            <th className="text-left p-2">Группа</th>
            <th className="text-left p-2">Отметка</th>
          </tr>
        </thead>
        <tbody>
          {list.map(c => {
            const m = getMark(c.id);
            return (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="p-2">{c.firstName} {c.lastName}</td>
                <td className="p-2">{c.area}</td>
                <td className="p-2">{c.group}</td>
                <td className="p-2">
                  <button onClick={() => toggle(c.id)} className={`px-3 py-1 rounded-md text-xs border ${m?.came ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
                    {m?.came ? "пришёл" : "не отмечен"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    </div>
  );
}
