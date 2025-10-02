import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import VirtualizedTable from "./VirtualizedTable";
import ClientDetailsModal from "./clients/ClientDetailsModal";
import ClientForm from "./clients/ClientForm";
import ColumnSettings from "./ColumnSettings";
import { compareValues, toggleSort } from "./tableUtils";
import { fmtDate, isReserveArea, todayISO, uid } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import { buildGroupsByArea } from "../state/lessons";
import { transformClientFormValues } from "./clients/clientMutations";
import { isReserveArea } from "../state/areas";
import type {
  Area,
  Client,
  ClientFormValues,
  Currency,
  DB,
  Group,
  PerformanceEntry,
} from "../types";
import {
  readDailyPeriod,
  readDailySelection,
  writeDailyPeriod,
  writeDailySelection,
  clearDailySelection,
} from "../state/filterPersistence";
import {
  MONTH_OPTIONS,
  collectAvailableYears,
  formatMonthInput,
  getDefaultPeriod,
  isPerformanceInPeriod,
  type PeriodFilter,
} from "../state/period";
import { usePersistentTableSettings } from "../utils/tableSettings";
import { matchesClientAgeExperience, parseAgeExperienceFilter } from "../utils/clientFilters";

const DEFAULT_VISIBLE_COLUMNS = ["name", "area", "group", "mark"];
const TABLE_SETTINGS_KEY = "performance";

export default function PerformanceTab({
  db,
  setDB,
  currency,
}: {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  currency: Currency;
}) {
  const storedSelection = useMemo(() => readDailySelection("performance"), []);
  const [area, setArea] = useState<Area | null>(storedSelection.area);
  const [group, setGroup] = useState<Group | null>(storedSelection.group);
  const [selected, setSelected] = useState<Client | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const persistedPeriod = useMemo(() => readDailyPeriod("performance"), []);
  const [period, setPeriod] = useState<PeriodFilter>(() => {
    const fallback = getDefaultPeriod();
    return {
      year: persistedPeriod.year ?? fallback.year,
      month: persistedPeriod.month ?? fallback.month,
    };
  });

  const groupsByArea = useMemo(() => buildGroupsByArea(db.schedule), [db.schedule]);
  const areaOptions = useMemo(() => Array.from(groupsByArea.keys()), [groupsByArea]);
  const availableGroups = useMemo(() => {
    if (!area) return [];
    return groupsByArea.get(area) ?? [];
  }, [area, groupsByArea]);
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

  useEffect(() => {
    if (area && group && !availableGroups.includes(group)) {
      setGroup(null);
    }
  }, [area, availableGroups, group]);

  useEffect(() => {
    writeDailyPeriod("performance", period.month, period.year);
  }, [period]);

  useEffect(() => {
    if (area || group) {
      writeDailySelection("performance", area ?? null, group ?? null);
    } else {
      clearDailySelection("performance");
    }
  }, [area, group]);

  const todayStr = useMemo(() => todayISO().slice(0, 10), []);

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

  const todayMarks = useMemo(() => {
    const map: Map<string, PerformanceEntry> = new Map();
    db.performance.forEach(entry => {
      if (entry.date.slice(0, 10) === todayStr && isPerformanceInPeriod(entry, period)) {
        map.set(entry.clientId, entry);
      }
    });
    return map;
  }, [db.performance, todayStr, period]);

  const monthValue = formatMonthInput(period);
  const baseYears = useMemo(() => collectAvailableYears(db), [db]);
  const yearOptions = useMemo(() => {
    if (baseYears.includes(period.year)) {
      return baseYears;
    }
    return [...baseYears, period.year].sort((a, b) => b - a);
  }, [baseYears, period.year]);

  const handleMonthChange = (value: string) => {
    if (!value) {
      setPeriod(prev => ({ ...prev, month: null }));
      return;
    }
    const nextMonth = Number.parseInt(value, 10);
    if (!Number.isFinite(nextMonth)) {
      return;
    }
    setPeriod(prev => ({ ...prev, month: nextMonth }));
  };

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextYear = Number.parseInt(event.target.value, 10);
    if (!Number.isFinite(nextYear)) {
      return;
    }
    setPeriod(prev => ({ year: nextYear, month: prev.month }));
  };

  const toggle = useCallback(async (clientId: string) => {
    const mark = todayMarks.get(clientId);
    if (mark) {
      const updated = { ...mark, successful: !mark.successful };
      const next = {
        ...db,
        performance: db.performance.map(entry => (entry.id === mark.id ? updated : entry)),
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
  }, [db, setDB, todayMarks]);

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
        label: "Оценка",
        width: "minmax(200px, 1fr)",
        headerAlign: "right" as const,
        cellClassName: "text-right",
        renderCell: (client: Client) => {
          const mark = todayMarks.get(client.id);
          const label = mark ? (mark.successful ? "успевает" : "нужна работа") : "не оценён";
          const tone = mark
            ? mark.successful
              ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700"
              : "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700"
            : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700";
          return (
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                toggle(client.id);
              }}
              className={`inline-flex items-center justify-center rounded-md border px-3 py-1 text-xs font-semibold ${tone}`}
            >
              {label}
            </button>
          );
        },
        sortValue: (client: Client) => {
          const mark = todayMarks.get(client.id);
          if (!mark) return 0;
          return mark.successful ? 2 : 1;
        },
      },
    ];
  }, [todayMarks, toggle]);

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
      <Breadcrumbs items={["Успеваемость"]} />
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
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={monthValue}
          onChange={event => handleMonthChange(event.target.value)}
        >
          <option value="">Все месяцы</option>
          {MONTH_OPTIONS.map(option => (
            <option key={option.value} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={period.year}
          onChange={handleYearChange}
        >
          {yearOptions.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <div className="text-xs text-slate-500">Сегодня: {fmtDate(new Date().toISOString())}</div>
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
