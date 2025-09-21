import React, { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import VirtualizedTable from "./VirtualizedTable";
import ClientDetailsModal from "./clients/ClientDetailsModal";
import ClientForm from "./clients/ClientForm";
import ColumnSettings from "./ColumnSettings";
import { compareValues, toggleSort, type SortState } from "./tableUtils";
import { fmtDate, todayISO, uid } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import { buildGroupsByArea, requiresManualRemainingLessons } from "../state/lessons";
import { transformClientFormValues } from "./clients/clientMutations";
import type {
  Area,
  AttendanceEntry,
  Client,
  ClientFormValues,
  Currency,
  DB,
  Group,
} from "../types";

export default function AttendanceTab({
  db,
  setDB,
  currency,
}: {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  currency: Currency;
}) {
  const [area, setArea] = useState<Area | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["name", "area", "group", "mark"]);
  const [sort, setSort] = useState<SortState | null>(null);

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

  const todayStr = useMemo(() => todayISO().slice(0, 10), []);

  const list = useMemo(() => {
    if (!area || !group) {
      return [];
    }
    return db.clients.filter(client => client.area === area && client.group === group);
  }, [area, group, db.clients]);

  const todayMarks = useMemo(() => {
    const map: Map<string, AttendanceEntry> = new Map();
    db.attendance.forEach(entry => {
      if (entry.date.slice(0, 10) === todayStr) {
        map.set(entry.clientId, entry);
      }
    });
    return map;
  }, [db.attendance, todayStr]);

  const toggle = async (clientId: string) => {
    const mark = todayMarks.get(clientId);
    const client = db.clients.find(c => c.id === clientId);
    if (!client) return;
    const manual = requiresManualRemainingLessons(client.group);
    if (mark) {
      const updated = { ...mark, came: !mark.came };
      const nextClients = !manual
        ? db.clients
        : db.clients.map(c => {
            if (c.id !== clientId) return c;
            const delta = updated.came ? -1 : 1;
            const current = c.remainingLessons ?? 0;
            const nextRemaining = Math.max(0, current + delta);
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
        window.alert("Не удалось обновить отметку посещаемости. Проверьте доступ к базе данных.");
      }
    } else {
      const entry: AttendanceEntry = { id: uid(), clientId, date: new Date().toISOString(), came: true };
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
        window.alert("Не удалось сохранить отметку посещаемости. Проверьте доступ к базе данных.");
      }
    }
  };

  const columns = useMemo(() => {
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
        label: "Отметка",
        width: "minmax(180px, 1fr)",
        headerAlign: "right" as const,
        cellClassName: "text-right",
        renderCell: (client: Client) => {
          const mark = todayMarks.get(client.id);
          const label = mark?.came ? "пришёл" : mark ? "не пришёл" : "не отмечен";
          const tone = mark?.came
            ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700"
            : mark
            ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700"
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
          return mark.came ? 2 : 1;
        },
      },
    ];
  }, [todayMarks]);

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
    <div className="space-y-3">
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
        <div className="text-xs text-slate-500">Сегодня: {fmtDate(new Date().toISOString())}</div>
        <div className="grow" />
        <ColumnSettings
          options={columns.map(column => ({ id: column.id, label: column.label }))}
          value={visibleColumns}
          onChange={setVisibleColumns}
        />
      </div>
      <div className="text-xs text-slate-500">
        {area && group ? `Найдено: ${list.length}` : "Выберите район и группу"}
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
