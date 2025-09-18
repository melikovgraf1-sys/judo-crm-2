import React, { useState } from "react";
import VirtualizedTable from "../VirtualizedTable";
import ClientDetailsModal from "./ClientDetailsModal";
import { fmtMoney, fmtDate } from "../../state/utils";
import type { Client, Currency } from "../../types";

type Props = {
  list: Client[];
  currency: Currency;
  onEdit: (c: Client) => void;
  onRemove: (id: string) => void;
  onTogglePayFact: (id: string, value: boolean) => void;
  onCreateTask: (client: Client) => void;
};

const COLUMN_WIDTHS = [
  "220px", // name
  "150px", // phone
  "140px", // area
  "140px", // group
  "160px", // payment status
  "150px", // payment amount
  "120px", // payment fact
  "150px", // payment date
  "260px", // actions
];

const COLUMN_TEMPLATE = COLUMN_WIDTHS.join(" ");

export default function ClientTable({ list, currency, onEdit, onRemove, onTogglePayFact, onCreateTask }: Props) {

  const [selected, setSelected] = useState<Client | null>(null);

  return (
    <>
      <VirtualizedTable
        header={(
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr
              className="w-full"
              style={{ display: "grid", gridTemplateColumns: COLUMN_TEMPLATE, alignItems: "center" }}
            >
              <th className="text-left p-2">
                Имя
              </th>
              <th className="text-left p-2">
                Телефон
              </th>
              <th className="text-left p-2">
                Район
              </th>
              <th className="text-left p-2">
                Группа
              </th>
              <th className="text-left p-2">
                Статус оплаты
              </th>
              <th className="text-left p-2">
                Сумма оплаты
              </th>
              <th className="text-center p-2">
                Факт оплаты
              </th>
              <th className="text-left p-2">
                Дата оплаты
              </th>
              <th className="text-right p-2" style={{ justifySelf: "end" }}>
                Действия
              </th>
            </tr>
          </thead>
        )}
        items={list}
        rowHeight={48}
        renderRow={(c, style) => (
          <tr
            key={c.id}
            style={{
              ...style,
              display: "grid",
              gridTemplateColumns: COLUMN_TEMPLATE,
              alignItems: "center",
            }}
            className="border-t border-slate-100 dark:border-slate-700"
          >
            <td className="p-2" onClick={() => setSelected(c)}>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onEdit(c);
                }}
                className="text-left text-sky-600 hover:underline focus:outline-none dark:text-sky-400"
              >
                {c.firstName} {c.lastName}
              </button>
            </td>
            <td className="p-2">
              {c.phone}
            </td>
            <td className="p-2">
              {c.area}
            </td>
            <td className="p-2">
              {c.group}
            </td>
            <td className="p-2">
              <span
                className={`px-2 py-1 rounded-full text-xs ${
                  c.payStatus === "действует"
                    ? "bg-emerald-100 text-emerald-700"
                    : c.payStatus === "задолженность"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {c.payStatus}
              </span>
            </td>
            <td className="p-2">
              {c.payAmount != null ? fmtMoney(c.payAmount, currency) : "—"}
            </td>
            <td className="p-2 text-center">
              <input
                type="checkbox"
                aria-label={`Факт оплаты ${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}`.trim()}
                checked={Boolean(c.payConfirmed)}
                onChange={e => onTogglePayFact(c.id, e.target.checked)}
              />
            </td>
            <td className="p-2">
              {c.payDate ? fmtDate(c.payDate) : "—"}
            </td>
            <td className="p-2 flex justify-end gap-1">
              <button
                onClick={() => onCreateTask(c)}
                className="px-2 py-1 text-xs rounded-md border border-sky-200 text-sky-600 hover:bg-sky-50 dark:border-sky-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                Создать задачу
              </button>
              <button
                onClick={() => onEdit(c)}
                className="px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800"
              >
                Редактировать
              </button>
              <button
                onClick={() => onRemove(c.id)}
                className="px-2 py-1 text-xs rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:bg-rose-900/20 dark:hover:bg-rose-900/30"
              >
                Удалить
              </button>
            </td>
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
