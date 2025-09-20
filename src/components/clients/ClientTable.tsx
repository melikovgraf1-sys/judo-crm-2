import React, { useMemo, useState } from "react";
import VirtualizedTable from "../VirtualizedTable";
import ClientDetailsModal from "./ClientDetailsModal";
import ColumnSettings from "../ColumnSettings";
import { compareValues, toggleSort, type SortState } from "../tableUtils";
import { fmtMoney, fmtDate } from "../../state/utils";
import type { Client, Currency } from "../../types";

type Props = {
  list: Client[];
  currency: Currency;
  onEdit: (c: Client) => void;
  onRemove: (id: string) => void;
  onCreateTask: (client: Client) => void;
};

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

export default function ClientTable({ list, currency, onEdit, onRemove, onCreateTask }: Props) {
  const [selected, setSelected] = useState<Client | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    "name",
    "phone",
    "area",
    "group",
    "payStatus",
    "payAmount",
    "payDate",
    "actions",
  ]);
  const [sort, setSort] = useState<SortState | null>(null);

  const columns: ColumnConfig[] = useMemo(() => [
    {
      id: "name",
      label: "Имя",
      width: "220px",
      renderCell: client => (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onEdit(client);
          }}
          className="text-left text-sky-600 hover:underline focus:outline-none dark:text-sky-400"
        >
          {client.firstName} {client.lastName}
        </button>
      ),
      sortValue: client => `${client.firstName} ${client.lastName ?? ""}`.trim().toLowerCase(),
    },
    {
      id: "phone",
      label: "Телефон",
      width: "150px",
      renderCell: client => client.phone ?? "—",
      sortValue: client => client.phone ?? "",
    },
    {
      id: "area",
      label: "Район",
      width: "140px",
      renderCell: client => client.area,
      sortValue: client => client.area,
    },
    {
      id: "group",
      label: "Группа",
      width: "140px",
      renderCell: client => client.group,
      sortValue: client => client.group,
    },
    {
      id: "payStatus",
      label: "Статус оплаты",
      width: "160px",
      renderCell: client => (
        <span
          className={`px-2 py-1 text-xs ${
            client.payStatus === "действует"
              ? "rounded-full bg-emerald-100 text-emerald-700"
              : client.payStatus === "задолженность"
              ? "rounded-full bg-rose-100 text-rose-700"
              : "rounded-full bg-amber-100 text-amber-700"
          }`}
        >
          {client.payStatus}
        </span>
      ),
      sortValue: client => client.payStatus,
    },
    {
      id: "payAmount",
      label: "Сумма оплаты",
      width: "150px",
      renderCell: client => (client.payAmount != null ? fmtMoney(client.payAmount, currency) : "—"),
      sortValue: client => client.payAmount ?? 0,
    },
    {
      id: "payDate",
      label: "Дата оплаты",
      width: "150px",
      renderCell: client => (client.payDate ? fmtDate(client.payDate) : "—"),
      sortValue: client => client.payDate ?? "",
    },
    {
      id: "actions",
      label: "Действия",
      width: "260px",
      headerClassName: "text-right",
      headerAlign: "right",
      cellClassName: "flex justify-end gap-1",
      renderCell: client => (
        <>
          <button
            onClick={event => {
              event.stopPropagation();
              onCreateTask(client);
            }}
            className="px-2 py-1 text-xs rounded-md border border-sky-200 text-sky-600 hover:bg-sky-50 dark:border-sky-700 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            Создать задачу
          </button>
          <button
            onClick={event => {
              event.stopPropagation();
              onRemove(client.id);
            }}
            className="px-2 py-1 text-xs rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:bg-rose-900/20 dark:hover:bg-rose-900/30"
          >
            Удалить
          </button>
        </>
      ),
    },
  ], [currency, onCreateTask, onEdit, onRemove]);

  const activeColumns = useMemo(
    () => columns.filter(column => visibleColumns.includes(column.id)),
    [columns, visibleColumns],
  );

  const sortedList = useMemo(() => {
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
    <>
      <div className="flex justify-end">
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
              className="w-full"
              style={{ display: "grid", gridTemplateColumns: columnTemplate, alignItems: "center" }}
            >
              {activeColumns.map(column => {
                const isSorted = sort?.columnId === column.id;
                const canSort = Boolean(column.sortValue);
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
                    className={`p-2 ${column.headerClassName ?? "text-left"}`}
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
        items={sortedList}
        rowHeight={48}
        renderRow={(c, style) => (
          <tr
            key={c.id}
            style={{
              ...style,
              display: "grid",
              gridTemplateColumns: columnTemplate,
              alignItems: "center",
            }}
            className="border-t border-slate-100 dark:border-slate-700"
            onClick={() => setSelected(c)}
          >
            {activeColumns.map(column => (
              <td key={column.id} className={`p-2 ${column.cellClassName ?? ""}`}>
                {column.renderCell(c)}
              </td>
            ))}
          </tr>
        )}
      />

      {selected && (
        <ClientDetailsModal
          client={selected}
          currency={currency}
          onEdit={onEdit}
          onRemove={onRemove}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
