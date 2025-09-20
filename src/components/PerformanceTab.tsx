import React, { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import VirtualizedTable from "./VirtualizedTable";
import ClientDetailsModal from "./clients/ClientDetailsModal";
import { fmtDate, uid } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import ColumnSettings from "./ColumnSettings";
import { compareValues, toggleSort, type SortState } from "./tableUtils";
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
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["name", "area", "group", "mark"]);
  const [sort, setSort] = useState<SortState | null>(null);
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

  const columns = useMemo(
    () => [
      {
        id: "name",
        label: "Ученик",
        width: "220px",
        renderCell: (client: Client) => (
          <button
            type="button"
            onClick={() => setSelected(client)}
            className="text-sky-600 hover:underline focus:outline-none dark:text-sky-400"
          >
            {client.firstName} {client.lastName}
          </button>
        ),
        sortValue: (client: Client) => `${client.firstName} ${client.lastName ?? ""}`.trim().toLowerCase(),
      },
      {
        id: "area",
        label: "Район",
        width: "1fr",
        renderCell: (client: Client) => client.area,
        sortValue: (client: Client) => client.area,
      },
      {
        id: "group",
        label: "Группа",
        width: "1fr",
        renderCell: (client: Client) => client.group,
        sortValue: (client: Client) => client.group,
      },
      {
        id: "mark",
        label: "Оценка",
        width: "200px",
        headerAlign: "right",
        renderCell: (client: Client) => {
          const mark = todayMarks.get(client.id);
          return (
            <div className="flex justify-end">
              <button
                onClick={() => toggle(client.id)}
                className={`px-3 py-1 rounded-md text-xs border ${
                  mark
                    ? mark.successful
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700"
                      : "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
                    : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                }`}
              >
                {mark ? (mark.successful ? "успевает" : "нужна работа") : "не оценён"}
              </button>
            </div>
          );
        },
        sortValue: (client: Client) => {
          const mark = todayMarks.get(client.id);
          if (!mark) return 0;
          return mark.successful ? 2 : 1;
        },
      },
    ],
    [setSelected, todayMarks, toggle],
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
        <div className="grow" />
        <ColumnSettings
          options={columns.map(column => ({ id: column.id, label: column.label }))}
          value={visibleColumns}
          onChange={setVisibleColumns}
        />
      </div>

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
                const justify = alignment === "right" ? "justify-end" : alignment === "center" ? "justify-center" : "";
                const content = (
                  <div className={`flex items-center gap-1 ${justify}`}>
                    <span>{column.label}</span>
                    {indicator && <span className="text-xs">{indicator}</span>}
                  </div>
                );
                return (
                  <th
                    key={column.id}
                    className={`p-2 ${alignment === "right" ? "text-right" : alignment === "center" ? "text-center" : "text-left"}`}
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
        rowHeight={44}
        renderRow={(c, style) => {
          return (
            <tr
              key={c.id}
              style={{
                ...style,
                display: "grid",
                gridTemplateColumns: columnTemplate,
                alignItems: "center",
              }}
              className="border-t border-slate-100 dark:border-slate-700"
            >
              {activeColumns.map(column => (
                <td key={column.id} className="p-2">
                  {column.renderCell(c)}
                </td>
              ))}
            </tr>
          );
        }}
      />

      {selected && (
        <ClientDetailsModal
          client={selected}
          currency={currency}
          schedule={db.schedule}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
