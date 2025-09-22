import React, { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import { uid } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import type { DB, ScheduleSlot } from "../types";

export default function ScheduleTab({
  db,
  setDB,
}: {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
}) {
  const weekdayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
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
    const nextAreas = [...db.settings.areas, name];
    const nextLimits: Record<string, number> = { ...db.settings.limits };
    for (const group of db.settings.groups) {
      const key: string = `${name}|${group}`;
      if (!(key in nextLimits)) nextLimits[key] = 0;
    }
    const next = { ...db, settings: { ...db.settings, areas: nextAreas, limits: nextLimits } };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось добавить район. Проверьте доступ к базе данных.");
    }
  };
  const renameArea = async (oldName: string) => {
    const name = prompt("Новое название района", oldName);
    if (!name || name === oldName) return;
    const renamedAreas = db.settings.areas.map(a => a === oldName ? name : a);
    const renamedLimits: Record<string, number> = {};
    for (const [key, value] of Object.entries(db.settings.limits)) {
      const separatorIndex = key.indexOf("|");
      if (separatorIndex === -1) {
        renamedLimits[key] = value;
        continue;
      }
      const area = key.slice(0, separatorIndex);
      const groupKey = key.slice(separatorIndex + 1);
      const nextKey = area === oldName ? `${name}|${groupKey}` : key;
      renamedLimits[nextKey] = value;
    }
    for (const group of db.settings.groups) {
      const key: string = `${name}|${group}`;
      if (!(key in renamedLimits)) renamedLimits[key] = 0;
    }
    const next = {
      ...db,
      settings: { ...db.settings, areas: renamedAreas, limits: renamedLimits },
      schedule: db.schedule.map(s => s.area === oldName ? { ...s, area: name } : s),
    };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось переименовать район. Проверьте доступ к базе данных.");
    }
  };
  const deleteArea = async (name: string) => {
    if (!window.confirm(`Удалить район ${name}?`)) return;
    const filteredLimits: Record<string, number> = {};
    for (const [key, value] of Object.entries(db.settings.limits)) {
      const separatorIndex = key.indexOf("|");
      const area = separatorIndex === -1 ? key : key.slice(0, separatorIndex);
      if (area !== name) filteredLimits[key] = value;
    }
    const next = {
      ...db,
      settings: { ...db.settings, areas: db.settings.areas.filter(a => a !== name), limits: filteredLimits },
      schedule: db.schedule.filter(s => s.area !== name),
    };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось удалить район. Проверьте доступ к базе данных.");
    }
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
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось добавить слот расписания. Проверьте доступ к базе данных.");
    }
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
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось обновить слот расписания. Проверьте доступ к базе данных.");
    }
  };
  const deleteSlot = async (id: string) => {
    if (!window.confirm("Удалить группу?")) return;
    const next = { ...db, schedule: db.schedule.filter(x => x.id !== id) };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось удалить слот расписания. Проверьте доступ к базе данных.");
    }
  };

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Расписание"]} />
      <div>
        <button onClick={addArea} className="mb-3 px-3 py-1 text-sm rounded-md border border-slate-300">+ район</button>
      </div>
      <div className="grid lg:grid-cols-3 gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {Object.entries(byArea).map(([area, list]) => (
          <div key={area} className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 space-y-2">
            <div className="flex justify-between items-center font-semibold">
              <span>{area}</span>
              <span className="flex gap-1 text-xs">
                <button onClick={() => renameArea(area)} className="px-2 py-1 rounded-md border border-slate-300">✎</button>
                <button onClick={() => deleteArea(area)} className="px-2 py-1 rounded-md border border-slate-300">✕</button>
              </span>
            </div>
            {list.length ? (
              (() => {
                const grouped = new Map<number, ScheduleSlot[]>();
                for (const slot of list) {
                  const slots = grouped.get(slot.weekday) ?? [];
                  slots.push(slot);
                  grouped.set(slot.weekday, slots);
                }
                const columns = [1, 2, 3, 4, 5, 6, 7]
                  .filter(day => grouped.has(day))
                  .map(day => ({
                    weekday: day,
                    slots: [...(grouped.get(day) ?? [])].sort(
                      (a, b) => a.time.localeCompare(b.time) || a.group.localeCompare(b.group),
                    ),
                  }));
                const columnCount = Math.max(1, columns.length);
                return (
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(200px, 1fr))` }}
                  >
                    {columns.map(column => (
                      <div key={column.weekday} className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {weekdayNames[column.weekday - 1]}
                        </div>
                        <ul className="space-y-1 text-sm">
                          {column.slots.map(slot => (
                            <li key={slot.id} className="flex items-center justify-between gap-2">
                              <span className="min-w-0">{slot.time} · {slot.group}</span>
                              <span className="flex gap-1 text-xs">
                                <button onClick={() => editSlot(slot.id)} className="px-2 py-0.5 rounded-md border border-slate-300">✎</button>
                                <button onClick={() => deleteSlot(slot.id)} className="px-2 py-0.5 rounded-md border border-slate-300">✕</button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                );
              })()
            ) : (
              <div className="text-sm text-slate-500">Тренировки не запланированы.</div>
            )}
            <button onClick={() => addSlot(area)} className="mt-2 px-2 py-1 text-xs rounded-md border border-slate-300">+ группа</button>
          </div>
        ))}
      </div>
    </div>
  );
}
