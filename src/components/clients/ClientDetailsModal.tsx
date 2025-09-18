import React from "react";
import Modal from "../Modal";
import { calcAgeYears, calcExperience, fmtMoney } from "../../state/utils";
import type { Client, Currency } from "../../types";

interface Props {
  client: Client;
  currency: Currency;
  onClose: () => void;
  onEdit?: (client: Client) => void;
  onRemove?: (id: string) => void;
}

export default function ClientDetailsModal({ client, currency, onClose, onEdit, onRemove }: Props) {
  return (
    <Modal size="md" onClose={onClose}>
      <div className="font-semibold text-slate-800 dark:text-slate-100">
        {client.firstName} {client.lastName}
      </div>
      <div className="grid gap-1 text-sm">
        <div>
          <span className="text-slate-500">Телефон:</span> {client.phone || "—"}
        </div>
        <div>
          <span className="text-slate-500">Канал:</span> {client.channel}
        </div>
        <div>
          <span className="text-slate-500">Родитель:</span> {client.parentName || "—"}
        </div>
        <div>
          <span className="text-slate-500">Дата рождения:</span> {client.birthDate?.slice(0, 10)}
        </div>
        <div>
          <span className="text-slate-500">Возраст:</span> {client.birthDate ? `${calcAgeYears(client.birthDate)} лет` : "—"}
        </div>
        <div>
          <span className="text-slate-500">Район:</span> {client.area}
        </div>
        <div>
          <span className="text-slate-500">Группа:</span> {client.group}
        </div>
        <div>
          <span className="text-slate-500">Опыт:</span> {client.startDate ? calcExperience(client.startDate) : "—"}
        </div>
        <div>
          <span className="text-slate-500">Статус оплаты:</span> {client.payStatus}
        </div>
        <div>
          <span className="text-slate-500">Дата оплаты:</span> {client.payDate?.slice(0, 10) || "—"}
        </div>
        <div>
          <span className="text-slate-500">Сумма оплаты:</span> {client.payAmount != null ? fmtMoney(client.payAmount, currency) : "—"}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onEdit && (
          <button
            type="button"
            onClick={() => {
              onEdit(client);
              onClose();
            }}
            className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600"
          >
            Редактировать
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={() => {
              onRemove(client.id);
              onClose();
            }}
            className="px-3 py-2 rounded-md border border-rose-200 text-rose-600 dark:border-rose-700"
          >
            Удалить
          </button>
        )}
        <button type="button" onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600">
          Закрыть
        </button>
      </div>
    </Modal>
  );
}
