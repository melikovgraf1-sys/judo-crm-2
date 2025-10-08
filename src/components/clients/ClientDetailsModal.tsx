import React, { useMemo, useState } from "react";
import Modal from "../Modal";
import { fmtDate, fmtMoney } from "../../state/utils";
import { getSubscriptionPlanMeta } from "../../state/payments";
import type { AttendanceEntry, Client, Currency, PerformanceEntry, Settings } from "../../types";

interface Props {
  client: Client;
  currency: Currency;
  currencyRates: Settings["currencyRates"];
  attendance: AttendanceEntry[];
  performance: PerformanceEntry[];
  onClose: () => void;
  onEdit?: (client: Client) => void;
  onRemove?: (id: string) => void;
}

export default function ClientDetailsModal({
  client,
  currency,
  currencyRates,
  attendance,
  performance,
  onClose,
  onEdit,
  onRemove,
}: Props) {
  const [section, setSection] = useState<"info" | "attendance" | "performance">("info");

  const attendanceEntries = useMemo(() => {
    return attendance
      .filter(entry => entry.clientId === client.id)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, client.id]);

  const performanceEntries = useMemo(() => {
    return performance
      .filter(entry => entry.clientId === client.id)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [performance, client.id]);

  const attendedCount = attendanceEntries.filter(entry => entry.came).length;
  const successfulCount = performanceEntries.filter(entry => entry.successful).length;

  const placements = client.placements?.length
    ? client.placements
    : [
        {
          id: client.id,
          area: client.area,
          group: client.group,
          payStatus: client.payStatus,
          status: client.status,
          subscriptionPlan: client.subscriptionPlan,
          payDate: client.payDate,
          payAmount: client.payAmount,
          payActual: client.payActual,
          remainingLessons: client.remainingLessons,
        },
      ];

  const placementsSummary = placements.map(place => `${place.area} · ${place.group}`).join(", ");

  return (
    <Modal size="lg" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {client.firstName} {client.lastName}
            </div>
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {placementsSummary}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Закрыть
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { id: "info", label: "Информация" },
            { id: "attendance", label: "Посещаемость" },
            { id: "performance", label: "Успеваемость" },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id as typeof section)}
              className={`px-3 py-1 rounded-full border text-xs font-semibold transition ${
                section === tab.id
                  ? "border-sky-500 bg-sky-100 text-sky-700 dark:border-sky-400 dark:bg-sky-900/30 dark:text-sky-200"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {section === "info" && (
          <div className="space-y-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Тренировочные места
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {placements.map(place => {
                  const planLabel = place.subscriptionPlan
                    ? getSubscriptionPlanMeta(place.subscriptionPlan)?.label ?? "—"
                    : "—";
                  return (
                    <div
                      key={`${place.id}-${place.area}-${place.group}`}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-100">
                        {place.area} · {place.group}
                      </div>
                      <dl className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
                        <InfoCell label="Статус абонемента" value={place.status ?? "—"} />
                        <InfoCell label="Статус оплаты" value={place.payStatus ?? "—"} />
                        <InfoCell label="Форма абонемента" value={planLabel} />
                        <InfoCell label="Дата оплаты" value={place.payDate?.slice(0, 10) || "—"} />
                        <InfoCell
                          label="Сумма оплаты"
                          value={
                            place.payAmount != null
                              ? fmtMoney(place.payAmount, currency, currencyRates)
                              : "—"
                          }
                        />
                        <InfoCell
                          label="Факт оплаты"
                          value={
                            place.payActual != null
                              ? fmtMoney(place.payActual, currency, currencyRates)
                              : "—"
                          }
                        />
                        <InfoCell
                          label="Остаток занятий"
                          value={
                            place.remainingLessons != null ? String(place.remainingLessons) : "—"
                          }
                        />
                      </dl>
                    </div>
                  );
                })}
              </div>
            </div>
            {client.comment ? (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Комментарий
                </span>
                <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{client.comment}</p>
              </div>
            ) : null}
          </div>
        )}

        {section === "attendance" && (
          <div className="space-y-2">
            <SummaryPill label="Отметок" value={attendanceEntries.length} />
            <SummaryPill label="Посетил" value={attendedCount} />
            <SummaryPill
              label="Последнее занятие"
              value={attendanceEntries[0] ? fmtDate(attendanceEntries[0].date) : "—"}
            />
            <HistoryList
              emptyText="Пока нет отметок посещаемости"
              entries={attendanceEntries.map(entry => ({
                id: entry.id,
                date: fmtDate(entry.date),
                value: entry.came ? "пришёл" : "отсутствовал",
                tone: entry.came ? "success" : "warning",
              }))}
            />
          </div>
        )}

        {section === "performance" && (
          <div className="space-y-2">
            <SummaryPill label="Оценок" value={performanceEntries.length} />
            <SummaryPill label="Успешных" value={successfulCount} />
            <SummaryPill
              label="Последняя оценка"
              value={performanceEntries[0] ? fmtDate(performanceEntries[0].date) : "—"}
            />
            <HistoryList
              emptyText="Пока нет отметок успеваемости"
              entries={performanceEntries.map(entry => ({
                id: entry.id,
                date: fmtDate(entry.date),
                value: entry.successful ? "успевает" : "нужна работа",
                tone: entry.successful ? "success" : "warning",
              }))}
            />
          </div>
        )}

        {(onEdit || onRemove) && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onEdit(client);
                  onClose();
                }}
                className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
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
                className="px-3 py-2 rounded-md border border-rose-200 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/30"
              >
                Удалить
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      <span className="uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

function HistoryList({
  entries,
  emptyText,
}: {
  entries: { id: string; date: string; value: string; tone: "success" | "warning" }[];
  emptyText: string;
}) {
  if (!entries.length) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">{emptyText}</div>;
  }

  return (
    <ul className="max-h-60 space-y-2 overflow-y-auto pr-1">
      {entries.map(entry => (
        <li
          key={entry.id}
          className={`rounded-md border px-3 py-2 text-sm ${
            entry.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
          }`}
        >
          <div className="text-xs uppercase tracking-wide">{entry.date}</div>
          <div className="font-semibold">{entry.value}</div>
        </li>
      ))}
    </ul>
  );
}
