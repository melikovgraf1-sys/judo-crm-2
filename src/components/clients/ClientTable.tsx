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


export default function ClientTable({ list, currency, onEdit, onRemove, onTogglePayFact, onCreateTask }: Props) {

  const [selected, setSelected] = useState<Client | null>(null);

  return (
    <>
      <VirtualizedTable
        header={(
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr className="w-full">
              <th className="text-left p-2" style={{ width: COLUMN_WIDTHS[0] }}>
                Имя
              </th>
              <th className="text-left p-2" style={{ width: COLUMN_WIDTHS[1] }}>
                Телефон
              </th>
              <th className="text-left p-2" style={{ width: COLUMN_WIDTHS[2] }}>
                Район
              </th>
              <th className="text-left p-2" style={{ width: COLUMN_WIDTHS[3] }}>
                Группа
              </th>
              <th className="text-left p-2" style={{ width: COLUMN_WIDTHS[4] }}>
                Статус оплаты
              </th>
              <th className="text-left p-2" style={{ width: COLUMN_WIDTHS[5] }}>
                Сумма оплаты
              </th>
              <th className="text-center p-2" style={{ width: COLUMN_WIDTHS[6] }}>
                Факт оплаты
              </th>
              <th className="text-left p-2" style={{ width: COLUMN_WIDTHS[7] }}>
                Дата оплаты
              </th>
              <th className="text-right p-2" style={{ width: COLUMN_WIDTHS[8] }}>
                Действия
              </th>
            </tr>
          </thead>
        )}
        items={list}
        rowHeight={48}
        renderRow={(c, style) => (
          <tr key={c.id} style={style} className="border-t border-slate-100 dark:border-slate-700">
            <td className="p-2 cursor-pointer" style={{ width: COLUMN_WIDTHS[0] }} onClick={() => setSelected(c)}>
              {c.firstName} {c.lastName}
            </td>
            <td className="p-2" style={{ width: COLUMN_WIDTHS[1] }}>
              {c.phone}
            </td>
            <td className="p-2" style={{ width: COLUMN_WIDTHS[2] }}>
              {c.area}
            </td>
            <td className="p-2" style={{ width: COLUMN_WIDTHS[3] }}>
              {c.group}
            </td>
            <td className="p-2" style={{ width: COLUMN_WIDTHS[4] }}>
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
            <td className="p-2" style={{ width: COLUMN_WIDTHS[5] }}>
              {c.payAmount != null ? fmtMoney(c.payAmount, currency) : "—"}
            </td>
            <td className="p-2 text-center" style={{ width: COLUMN_WIDTHS[6] }}>
              <input
                type="checkbox"
                aria-label={`Факт оплаты ${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}`.trim()}
                checked={Boolean(c.payConfirmed)}
                onChange={e => onTogglePayFact(c.id, e.target.checked)}
              />
            </td>
            <td className="p-2" style={{ width: COLUMN_WIDTHS[7] }}>
              {c.payDate ? fmtDate(c.payDate) : "—"}
            </td>
            <td className="p-2 text-right" style={{ width: COLUMN_WIDTHS[8] }}>
              <button
                onClick={() => onCreateTask(c)}
                className="px-2 py-1 text-xs rounded-md border border-sky-200 text-sky-600 hover:bg-sky-50 mr-1 dark:border-sky-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                Создать задачу
              </button>
              <button
                onClick={() => onEdit(c)}
                className="px-2 py-1 text-xs rounded-md border border-slate-300 mr-1 dark:border-slate-700 dark:bg-slate-800"
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
