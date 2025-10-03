import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import VirtualizedTable from "./VirtualizedTable";
import ClientDetailsModal from "./clients/ClientDetailsModal";
import ClientForm from "./clients/ClientForm";
import ColumnSettings from "./ColumnSettings";
import { compareValues, toggleSort } from "./tableUtils";
import { fmtDate, todayISO, uid } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import { buildGroupsByArea, clientRequiresManualRemainingLessons } from "../state/lessons";
import { transformClientFormValues } from "./clients/clientMutations";
import { isReserveArea } from "../state/areas";
import type {
  Area,
  AttendanceEntry,
  Client,
  ClientFormValues,
  Currency,
  DB,
  Group,
} from "../types";
import { readDailySelection, writeDailySelection, clearDailySelection } from "../state/filterPersistence";
import { usePersistentTableSettings } from "../utils/tableSettings";
import { matchesClientAgeExperience, parseAgeExperienceFilter } from "../utils/clientFilters";

const DEFAULT_VISIBLE_COLUMNS = ["name", "area", "group", "mark"];
const TABLE_SETTINGS_KEY = "attendance";

const toMiddayISO = (value: string): string | null => {
  if (!value) return null;
  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10) - 1;
  const day = Number.parseInt(dayStr, 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }
  const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

const createUTCDate = (year: number, monthIndex: number, day: number) =>
  new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));

export default function AttendanceTab({
  db,
  setDB,
  currency,
}: {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  currency: Currency;
}) {
  const storedSelection = useMemo(() => readDailySelection("attendance"), []);
  const [area, setArea] = useState<Area | null>(storedSelection.area);
  const [group, setGroup] = useState<Group | null>(storedSelection.group);
  const [selected, setSelected] = useState<Client | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => todayISO().slice(0, 10));
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [experienceMin, setExperienceMin] = useState("");
  const [experienceMax, setExperienceMax] = useState("");
  const ageExperienceFilter = useMemo(
    () =>
      parseAgeExperienceFilter({
        minAgeText: ageMin,
        maxAgeText: ageMax,
        minExperienceYearsText: experienceMin,
        maxExperienceYearsText: experienceMax,
      }),
    [ageMin, ageMax, experienceMin, experienceMax],
  );

  const groupsByArea = useMemo(() => buildGroupsByArea(db.schedule), [db.schedule]);
  const areaOptions = useMemo(() => Array.from(groupsByArea.keys()), [groupsByArea]);
  const availableGroups = useMemo(() => {
    if (!area) return [];
    return groupsByArea.get(area) ?? [];
  }, [area, groupsByArea]);

  useEffect(() => {
    if (area && group && !availableGroups.includes(group)) {
      setGroup(null);
    }
  }, [area, availableGroups, group]);

  useEffect(() => {
    if (area || group) {
      writeDailySelection("attendance", area ?? null, group ?? null);
    } else {
      clearDailySelection("attendance");
    }
  }, [area, group]);

  const todayStr = useMemo(() => todayISO().slice(0, 10), []);
  const selectedMonthDate = useMemo(() => {
    if (!month) return null;
    const [yearStr, monthStr] = month.split("-");
    const year = Number.parseInt(yearStr, 10);
    const monthIndex = Number.parseInt(monthStr, 10) - 1;
    if (Number.isNaN(year) || Number.isNaN(monthIndex)) {
      return null;
    }
    const base = createUTCDate(year, monthIndex, 1);
    if (Number.isNaN(base.getTime())) {
      return null;
    }
    return base;
  }, [month]);

  useEffect(() => {
    if (!selectedMonthDate) return;
    const prefix = `${selectedMonthDate.getUTCFullYear()}-${String(selectedMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
    if (selectedDate.slice(0, 7) !== prefix) {
      const normalized = createUTCDate(
        selectedMonthDate.getUTCFullYear(),
        selectedMonthDate.getUTCMonth(),
        1,
      );
      setSelectedDate(normalized.toISOString().slice(0, 10));
    }
  }, [selectedDate, selectedMonthDate]);

  useEffect(() => {
    const prefix = selectedDate.slice(0, 7);
    if (prefix && prefix !== month) {
      setMonth(prefix);
    }
  }, [month, selectedDate]);

  const list = useMemo(() => {
    if (!area || !group) {
      return [];
    }
    return db.clients.filter(client => client.area === area && client.group === group && !isReserveArea(client.area));
  }, [area, group, db.clients]);


  type ColumnConfig = {
    id: string;
    label: string;
    width: string;
    headerClassName?: string;
    cellClassName?: string;
    renderCell: (client: Client) => React.ReactNode;
    sortValue?: (client: Client) => unknown;
    headerAlign?: "left" | "center" | "right";
  };

  const isoWeekday = (date: Date) => {
    const day = date.getUTCDay();
    return day === 0 ? 7 : day;
  };

  const monthLabel = useMemo(() => {
    if (!selectedMonthDate) return "";
    return selectedMonthDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }, [selectedMonthDate]);

  const scheduleDays = useMemo(() => {
    if (!area || !group || !selectedMonthDate) return [];
    const relevant = db.schedule.filter(slot => slot.area === area && slot.group === group);
    if (!relevant.length) return [];

    const timesByWeekday = new Map<number, string[]>();
    for (const slot of relevant) {
      const times = timesByWeekday.get(slot.weekday) ?? [];
      times.push(slot.time);
      timesByWeekday.set(slot.weekday, times);
    }
    for (const times of timesByWeekday.values()) {
      times.sort((a, b) => a.localeCompare(b));
    }

    const result: { date: string; label: string; times: string[]; isToday: boolean }[] = [];
    const cursor = new Date(selectedMonthDate.getTime());
    const monthIndex = cursor.getUTCMonth();
    while (cursor.getUTCMonth() === monthIndex) {
      const weekday = isoWeekday(cursor);
      const times = timesByWeekday.get(weekday);
      if (times?.length) {
        const iso = cursor.toISOString().slice(0, 10);
        const label = cursor.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", weekday: "short" });
        result.push({ date: iso, label, times, isToday: iso === todayStr });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    result.sort((a, b) => a.date.localeCompare(b.date));

    return result;
  }, [area, db.schedule, group, selectedMonthDate, todayStr]);

  const attendanceByDate = useMemo(() => {
    const grouped = new Map<string, AttendanceEntry[]>();
    for (const entry of db.attendance) {
      const key = entry.date.slice(0, 10);
      const list = grouped.get(key);
      if (list) {
        list.push(entry);
      } else {
        grouped.set(key, [entry]);
      }
    }
    return grouped;
  }, [db.attendance]);

  const marksForSelectedDate = useMemo(() => {
    const map: Map<string, AttendanceEntry> = new Map();
    const entries = attendanceByDate.get(selectedDate);
    if (!entries?.length) {
      return map;
    }
    for (const entry of entries) {
      map.set(entry.clientId, entry);
    }
    return map;
  }, [attendanceByDate, selectedDate]);

  const selectedDateISO = useMemo(() => toMiddayISO(selectedDate), [selectedDate]);
  const selectedDateLabel = useMemo(() => (selectedDateISO ? fmtDate(selectedDateISO) : ""), [selectedDateISO]);
  const cycleMark = useCallback(async (clientId: string) => {
    if (!selectedDate) {
      window.alert("Выберите дату для отметки посещаемости.");
      return;
    }
    const mark = marksForSelectedDate.get(clientId);
    const client = db.clients.find(c => c.id === clientId);
    if (!client) return;
    const manual = clientRequiresManualRemainingLessons(client);

    if (mark && mark.came === false) {
      const next = {
        ...db,
        attendance: db.attendance.filter(entry => entry.id !== mark.id),
        clients: db.clients,
      };
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert(
          "Не удалось обновить отметку посещаемости. Изменение сохранено локально, проверьте доступ к базе данных.",
        );
        setDB(next);
      }
    } else if (mark) {
      const updated = { ...mark, came: false };
      const nextClients = !manual
        ? db.clients
        : db.clients.map(c => {
            if (c.id !== clientId) return c;
            const current = c.remainingLessons ?? 0;
            const nextRemaining = Math.max(0, current + 1);
            if (nextRemaining === current) {
              return c;
            }
            return { ...c, remainingLessons: nextRemaining };
          });
      const next = {
        ...db,
        attendance: db.attendance.map(entry => (entry.id === mark.id ? updated : entry)),
        clients: nextClients,
      };
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert(
          "Не удалось обновить отметку посещаемости. Изменение сохранено локально, проверьте доступ к базе данных.",
        );
        setDB(next);
      }
    } else {
      const desiredDate = toMiddayISO(selectedDate) ?? new Date().toISOString();
      const entry: AttendanceEntry = { id: uid(), clientId, date: desiredDate, came: true };
      const nextClients = !manual
        ? db.clients
        : db.clients.map(c => {
            if (c.id !== clientId) return c;
            const current = c.remainingLessons ?? 0;
            const nextRemaining = Math.max(0, current - 1);
            if (nextRemaining === current) {
              return c;
            }
            return { ...c, remainingLessons: nextRemaining };
          });
      const next = { ...db, attendance: [entry, ...db.attendance], clients: nextClients };
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert(
          "Не удалось сохранить отметку посещаемости. Изменение сохранено локально, проверьте доступ к базе данных.",
        );
        setDB(next);
      }
    }
  }, [db, marksForSelectedDate, selectedDate, setDB]);

  const columns: ColumnConfig[] = useMemo(() => {
    return [
      {
        id: "name",
        label: "Ученик",
        width: "minmax(200px, max-content)",
        renderCell: (client: Client) => (
          <span className="font-medium text-slate-800 dark:text-slate-100">{client.firstName} {client.lastName}</span>
        ),
        sortValue: (client: Client) => `${client.firstName} ${client.lastName ?? ""}`.trim().toLowerCase(),
      },
      {
        id: "area",
        label: "Район",
        width: "minmax(140px, max-content)",
        renderCell: (client: Client) => client.area,
        sortValue: (client: Client) => client.area,
      },
      {
        id: "group",
        label: "Группа",
        width: "minmax(140px, max-content)",
        renderCell: (client: Client) => client.group,
        sortValue: (client: Client) => client.group,
      },
      {
        id: "mark",
        label: selectedDateLabel ? `Отметка за ${selectedDateLabel}` : "Отметка",
        width: "minmax(160px, max-content)",
        headerAlign: "center" as const,
        cellClassName: "",
        renderCell: (client: Client) => {
          const mark = marksForSelectedDate.get(client.id);
          const label = mark?.came ? "пришёл" : mark ? "не пришёл" : "не отмечено";
          const tone = mark?.came
            ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700"
            : mark
            ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700"
            : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700";
          return (
            <div className="flex justify-start">
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  cycleMark(client.id);
                }}
                className={`inline-flex items-center justify-center rounded-md border px-3 py-1 text-xs font-semibold ${tone}`}
              >
                {label}
              </button>
            </div>
          );
        },
        sortValue: (client: Client) => {
          const mark = marksForSelectedDate.get(client.id);
          if (!mark) return 0;
          return mark.came ? 2 : 1;
        },
      },
    ];
  }, [cycleMark, marksForSelectedDate, selectedDateLabel]);

  const columnIds = useMemo(() => columns.map(column => column.id), [columns]);
  const { visibleColumns, setVisibleColumns, sort, setSort } = usePersistentTableSettings(
    TABLE_SETTINGS_KEY,
    columnIds,
    DEFAULT_VISIBLE_COLUMNS,
  );

  const activeColumns = useMemo(
    () => columns.filter(column => visibleColumns.includes(column.id)),
    [columns, visibleColumns],
  );

  const sortedClients = useMemo(() => {
    if (!sort) return list;
    const column = columns.find(col => col.id === sort.columnId);
    if (!column?.sortValue) return list;
    const copy = [...list];
    copy.sort((a, b) => {
      const compare = compareValues(column.sortValue!(a), column.sortValue!(b));
      return sort.direction === "asc" ? compare : -compare;
    });
    return copy;
  }, [columns, list, sort]);

  const columnTemplate = activeColumns.length ? activeColumns.map(column => column.width).join(" ") : "1fr";
  const startEdit = (client: Client) => {
    setEditing(client);
  };

  const saveClient = async (values: ClientFormValues) => {
    if (!editing) return;
    const prepared = transformClientFormValues(values, editing);
    const updated: Client = { ...editing, ...prepared };
    const next = {
      ...db,
      clients: db.clients.map(client => (client.id === editing.id ? updated : client)),
    };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось сохранить изменения клиента. Проверьте доступ к базе данных.");
      return;
    }
    setEditing(null);
    setSelected(updated);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Breadcrumbs items={["Посещаемость"]} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={area ?? ""}
          onChange={e => setArea(e.target.value ? (e.target.value as Area) : null)}
        >
          <option value="">Выберите район</option>
          {areaOptions.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={group ?? ""}
          onChange={e => setGroup(e.target.value ? (e.target.value as Group) : null)}
          disabled={!area}
        >
          <option value="">Выберите группу</option>
          {availableGroups.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          type="month"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={month}
          onChange={event => setMonth(event.target.value || todayISO().slice(0, 7))}
          disabled={!group}
        />
        <input
          type="date"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={selectedDate}
          onChange={event => setSelectedDate(event.target.value || todayStr)}
          disabled={!group}
        />
        <div className="text-xs text-slate-500">Сегодня: {fmtDate(new Date().toISOString())}</div>
        <div className="text-xs text-slate-500">Отмечаем: {selectedDateLabel || "—"}</div>
        <div className="grow" />
        <ColumnSettings
          options={columns.map(column => ({ id: column.id, label: column.label }))}
          value={visibleColumns}
          onChange={setVisibleColumns}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          placeholder="Возраст от"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={ageMin}
          onChange={event => setAgeMin(event.target.value)}
        />
        <input
          type="number"
          min={0}
          placeholder="Возраст до"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={ageMax}
          onChange={event => setAgeMax(event.target.value)}
        />
        <input
          type="number"
          min={0}
          step="0.1"
          placeholder="Опыт от (лет)"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={experienceMin}
          onChange={event => setExperienceMin(event.target.value)}
        />
        <input
          type="number"
          min={0}
          step="0.1"
          placeholder="Опыт до (лет)"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={experienceMax}
          onChange={event => setExperienceMax(event.target.value)}
        />
      </div>
      {area && group && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <span>Расписание на {monthLabel || "выбранный месяц"}</span>
            <span className="text-slate-400">{scheduleDays.length} тренировок</span>
          </div>
          <div className="flex flex-wrap gap-2 p-3">
            {scheduleDays.length ? (
              scheduleDays.map(day => {
                const isSelected = day.date === selectedDate;
                const baseTone = day.isToday
                  ? "border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-900/40 dark:text-sky-200"
                  : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
                const selectionRing = isSelected ? "ring-2 ring-sky-400 dark:ring-sky-300" : "";
                return (
                  <button
                    key={day.date}
                    type="button"
                    className={`min-w-[120px] rounded-lg border px-3 py-2 text-left text-xs shadow-sm transition ${baseTone} ${selectionRing}`}
                    onClick={() => setSelectedDate(day.date)}
                    aria-pressed={isSelected}
                  >
                    <div className="font-semibold text-sm">{day.label}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {day.times.join(", ")}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-xs text-slate-500">В выбранном месяце нет тренировок для этой группы.</div>
            )}
          </div>
        </div>
      )}
      <div className="text-xs text-slate-500">
        {area && group ? `Найдено: ${list.length}` : "Выберите район и группу"}
      </div>

      <div>
        <VirtualizedTable
          header={(
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr
              style={{ display: "grid", gridTemplateColumns: columnTemplate, alignItems: "center" }}
            >
              {activeColumns.map(column => {
                const canSort = Boolean(column.sortValue);
                const isSorted = sort?.columnId === column.id;
                const indicator = isSorted ? (sort?.direction === "asc" ? "↑" : "↓") : null;
                const alignment = column.headerAlign ?? "left";
                const justify =
                  alignment === "right" ? "justify-end" : alignment === "center" ? "justify-center" : "";
                const content = (
                  <div className={`flex items-center gap-1 ${justify}`}>
                    <span>{column.label}</span>
                    {indicator && <span className="text-xs">{indicator}</span>}
                  </div>
                );
                return (
                  <th
                    key={column.id}
                    className={`p-2 ${
                      alignment === "right"
                        ? "text-right"
                        : alignment === "center"
                        ? "text-center"
                        : "text-left"
                    }`}
                    style={{ cursor: canSort ? "pointer" : "default" }}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-1 focus:outline-none"
                        onClick={() => setSort(prev => toggleSort(prev, column.id))}
                      >
                        {content}
                      </button>
                    ) : (
                      content
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
        )}
          items={sortedClients}
          rowHeight={48}
          virtualize={false}
          renderRow={(client, style) => (
            <tr
              key={client.id}
              style={{
                ...style,
                display: "grid",
                gridTemplateColumns: columnTemplate,
                alignItems: "center",
                cursor: "pointer",
              }}
              className="border-t border-slate-100 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              onClick={() => setSelected(client)}
            >
            {activeColumns.map(column => (
              <td key={column.id} className={`p-2 ${column.cellClassName ?? ""}`}>
                {column.renderCell(client)}
              </td>
            ))}
          </tr>
          )}
        />
      </div>

      {selected && (
        <ClientDetailsModal
          client={selected}
          currency={currency}
          currencyRates={db.settings.currencyRates}
          schedule={db.schedule}
          attendance={db.attendance}
          performance={db.performance}
          onEdit={startEdit}
          onClose={() => setSelected(null)}
        />
      )}

      {editing && (
        <ClientForm
          db={db}
          editing={editing}
          onSave={saveClient}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
