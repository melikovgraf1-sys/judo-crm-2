import React, { useState } from "react";
import VirtualizedTable from "../VirtualizedTable";
import Modal from "../Modal";
import { fmtMoney, calcAgeYears, calcExperience } from "../../state/utils";
import type { Client, UIState } from "../../types";

type Props = {
  list: Client[],
  ui: UIState,
  onEdit: (c: Client) => void,
  onRemove: (id: string) => void,
};

export default function ClientTable({ list, ui, onEdit, onRemove }: Props) {
  const [selected, setSelected] = useState<Client | null>(null);

  return (
    <>
      <VirtualizedTable
        header={(
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left p-2">Имя</th>
              <th className="text-left p-2">Телефон</th>
              <th className="text-left p-2">Район</th>
              <th className="text-left p-2">Группа</th>
              <th className="text-left p-2">Статус оплаты</th>
              <th className="text-left p-2">Сумма оплаты</th>
              <th className="text-right p-2">Действия</th>
            </tr>
          </thead>
        )}
        items={list}
        rowHeight={48}
        renderRow={(c, style) => (
          <tr key={c.id} style={style} className="border-t border-slate-100 dark:border-slate-700">
            <td className="p-2 cursor-pointer" onClick={() => setSelected(c)}>
              {c.firstName} {c.lastName}
            </td>
            <td className="p-2">{c.phone}</td>
            <td className="p-2">{c.area}</td>
            <td className="p-2">{c.group}</td>
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
            <td className="p-2">{c.payAmount != null ? fmtMoney(c.payAmount, ui.currency) : "—"}</td>
            <td className="p-2 text-right">
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
        <Modal size="md" onClose={() => setSelected(null)}>
          <div className="font-semibold text-slate-800">
            {selected.firstName} {selected.lastName}
          </div>
          <div className="grid gap-1 text-sm">
            <div>
              <span className="text-slate-500">Телефон:</span> {selected.phone || "—"}
            </div>
            <div>
              <span className="text-slate-500">Канал:</span> {selected.channel}
            </div>
            <div>
              <span className="text-slate-500">Родитель:</span> {selected.parentName || "—"}
            </div>
            <div>
              <span className="text-slate-500">Дата рождения:</span> {selected.birthDate?.slice(0, 10)}
            </div>
            <div>
              <span className="text-slate-500">Возраст:</span> {selected.birthDate ? `${calcAgeYears(selected.birthDate)} лет` : "—"}
            </div>
            <div>
              <span className="text-slate-500">Район:</span> {selected.area}
            </div>
            <div>
              <span className="text-slate-500">Группа:</span> {selected.group}
            </div>
            <div>
              <span className="text-slate-500">Опыт:</span> {selected.startDate ? calcExperience(selected.startDate) : "—"}
            </div>
            <div>
              <span className="text-slate-500">Статус оплаты:</span> {selected.payStatus}
            </div>
            <div>
              <span className="text-slate-500">Дата оплаты:</span> {selected.payDate?.slice(0, 10) || "—"}
            </div>
            <div>
              <span className="text-slate-500">Сумма оплаты:</span> {selected.payAmount != null ? fmtMoney(selected.payAmount, ui.currency) : "—"}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                onEdit(selected);
                setSelected(null);
              }}
              className="px-3 py-2 rounded-md border border-slate-300"
            >
              Редактировать
            </button>
            <button
              onClick={() => {
                onRemove(selected.id);
                setSelected(null);
              }}
              className="px-3 py-2 rounded-md border border-rose-200 text-rose-600"
            >
              Удалить
            </button>
            <button onClick={() => setSelected(null)} className="px-3 py-2 rounded-md border border-slate-300">
              Закрыть
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

