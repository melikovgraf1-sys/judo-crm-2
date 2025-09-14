// @flow
import React, { useMemo } from "react";
import Breadcrumbs from "./Breadcrumbs";
import { uid, saveDB } from "../state/appState";
import type { DB, ScheduleSlot } from "../types";

export default function ScheduleTab({ db, setDB }: { db: DB; setDB: (db: DB) => void }) {
  const byArea = useMemo(() => {
    const m: Record<string, ScheduleSlot[]> = {};
    for (const a of db.settings.areas) m[a] = [];
    for (const s of db.schedule) {
      m[s.area] ??= []; m[s.area].push(s);
    }
    return m;
  }, [db.schedule, db.settings.areas]);

  const addArea = async () => {
    const name = prompt("Название района");
    if (!name) return;
    if (db.settings.areas.includes(name)) return;
    const next = { ...db, settings: { ...db.settings, areas: [...db.settings.areas, name] } };
    setDB(next); await saveDB(next);
  };
  const renameArea = async (oldName: string) => {
    const name = prompt("Новое название района", oldName);
    if (!name || name === oldName) return;
    const next = {
      ...db,
      settings: { ...db.settings, areas: db.settings.areas.map(a => a === oldName ? name : a) },
      schedule: db.schedule.map(s => s.area === oldName ? { ...s, area: name } : s),
    };
    setDB(next); await saveDB(next);
  };
  const deleteArea = async (name: string) => {
    if (!window.confirm(`Удалить район ${name}?`)) return;
    const next = {
      ...db,
      settings: { ...db.settings, areas: db.settings.areas.filter(a => a !== name) },
      schedule: db.schedule.filter(s => s.area !== name),
    };
    setDB(next); await saveDB(next);
  };

  const pickGroup = (init: string) => {
    const list = db.settings.groups.map((g, i) => `${i + 1}. ${g}`).join("\n");
    const raw = prompt(`Группа:\n${list}\nВведите номер или название новой`, init);
    if (!raw) return "";
    const idx = parseInt(raw, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= db.settings.groups.length) return db.settings.groups[idx - 1];
    return raw;
  };
  const addSlot = async (area: string) => {
    const weekday = parseInt(prompt("День недели (1-Пн … 7-Вс)", "1") || "", 10);
    const time = prompt("Время (HH:MM)", "10:00") || "";
    const group = pickGroup(db.settings.groups[0] || "");
    if (!weekday || !time || !group) return;
    const slot: ScheduleSlot = { id: uid(), area, weekday, time, group, coachId: "", location: "" };
    const next = {
      ...db,
      schedule: [...db.schedule, slot],
      settings: db.settings.groups.includes(group)
        ? db.settings
        : { ...db.settings, groups: [...db.settings.groups, group] },
    };
    setDB(next); await saveDB(next);
  };
  const editSlot = async (id: string) => {
    const s = db.schedule.find(x => x.id === id);
    if (!s) return;
    const weekday = parseInt(prompt("День недели (1-Пн … 7-Вс)", String(s.weekday)) || "", 10);
    const time = prompt("Время (HH:MM)", s.time) || "";
    const group = pickGroup(s.group);
    if (!weekday || !time || !group) return;
    const next = {
      ...db,
      schedule: db.schedule.map(x => x.id === id ? { ...x, weekday, time, group } : x),
      settings: db.settings.groups.includes(group)
        ? db.settings
        : { ...db.settings, groups: [...db.settings.groups, group] },
    };
    setDB(next); await saveDB(next);
  };
  const deleteSlot = async (id: string) => {
    if (!window.confirm("Удалить группу?")) return;
    const next = { ...db, schedule: db.schedule.filter(x => x.id !== id) };
    setDB(next); await saveDB(next);
  };

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Расписание"]} />
      <div>
        <button onClick={addArea} className="mb-3 px-3 py-1 text-sm rounded-md border border-slate-300">+ район</button>
      </div>
      <div className="grid lg:grid-cols-3 gap-3">
        {Object.entries(byArea).map(([area, list]) => (
          <div key={area} className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 space-y-2">
            <div className="flex justify-between items-center font-semibold">
              <span>{area}</span>
              <span className="flex gap-1 text-xs">
                <button onClick={() => renameArea(area)} className="px-2 py-1 rounded-md border border-slate-300">✎</button>
                <button onClick={() => deleteArea(area)} className="px-2 py-1 rounded-md border border-slate-300">✕</button>
              </span>
            </div>
            <ul className="space-y-1 text-sm">
              {list
                .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time))
                .map(s => (
                  <li key={s.id} className="truncate flex justify-between">
                    <span>{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][s.weekday - 1]} {s.time} · {s.group}</span>
                    <span className="flex gap-1 text-xs">
                      <button onClick={() => editSlot(s.id)} className="px-2 py-0.5 rounded-md border border-slate-300">✎</button>
                      <button onClick={() => deleteSlot(s.id)} className="px-2 py-0.5 rounded-md border border-slate-300">✕</button>
                    </span>
                  </li>
                ))}
            </ul>
            <button onClick={() => addSlot(area)} className="mt-2 px-2 py-1 text-xs rounded-md border border-slate-300">+ группа</button>
          </div>
        ))}
      </div>
    </div>
  );
}
