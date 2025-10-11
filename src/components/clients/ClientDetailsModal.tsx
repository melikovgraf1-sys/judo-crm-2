import React, { useMemo, useState } from "react";
import Modal from "../Modal";
import * as utils from "../../state/utils";
import { getSubscriptionPlanMeta } from "../../state/payments";
import { matchesPeriod, type PeriodFilter } from "../../state/period";
import {
  estimateGroupRemainingLessonsByParams,
  getEffectiveRemainingLessons,
} from "../../state/lessons";
import type { AttendanceEntry, Client, Currency, PerformanceEntry, Settings } from "../../types";
import type { ScheduleSlot as ScheduleSlotType } from "../../types";
import {
  getPaymentFactComparableDate,
  getPaymentFactPlanLabel,
  normalizePaymentFacts,
} from "../../state/paymentFacts";
import { getClientPlacementDisplayStatus, getClientPlacementsWithFallback } from "./paymentStatus";

const { calcAgeYears, calcExperience, fmtDate, fmtMoney } = utils;

interface Props {
  client: Client;
  currency: Currency;
  currencyRates: Settings["currencyRates"];
  schedule?: ScheduleSlotType[];
  attendance: AttendanceEntry[];
  performance: PerformanceEntry[];
  billingPeriod?: PeriodFilter;
  onClose: () => void;
  onEdit?: (client: Client) => void;
  onRemove?: (id: string) => void;
}

export default function ClientDetailsModal({
  client,
  currency,
  currencyRates,
  schedule: scheduleProp = [],
  attendance,
  performance,
  billingPeriod,
  onClose,
  onEdit,
  onRemove,
}: Props) {
  const normalizedSchedule = Array.isArray(scheduleProp) ? scheduleProp : [];
  const placements = getClientPlacementsWithFallback(client);
  const paymentFacts = useMemo(
    () => normalizePaymentFacts(client.payHistory),
    [client.payHistory],
  );

  const paidInSelectedPeriod = useMemo(() => {
    if (!billingPeriod || billingPeriod.month == null) {
      return client.payStatus === "действует";
    }

    return paymentFacts.some(entry => matchesPeriod(entry, billingPeriod));
  }, [billingPeriod, client.payStatus, paymentFacts]);

  const displayPayStatus = useMemo(() => {
    const placementStatus = getClientPlacementDisplayStatus(client);

    if (!billingPeriod || billingPeriod.month == null) {
      return placementStatus;
    }

    if (placementStatus === "задолженность" || placementStatus === "ожидание") {
      return placementStatus;
    }

    return paidInSelectedPeriod ? "действует" : "ожидание";
  }, [billingPeriod, client, paidInSelectedPeriod]);

  const hasWaitingStatus = displayPayStatus === "ожидание";

  const totalRemainingLessons = getEffectiveRemainingLessons(client, normalizedSchedule);

  const totalFrozenLessons = placements.reduce(
    (sum, place) => sum + Math.max(0, place.frozenLessons ?? 0),
    0,
  );
  const displayedFrozenLessons =
    totalFrozenLessons || Math.max(0, client.frozenLessons ?? 0);

  const deriveRemainingLessons = (
    value: number | string | undefined | null,
  ): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return null;
  };

  const derivedRemainingLessons = (() => {
    const direct = deriveRemainingLessons(client.remainingLessons ?? null);
    if (direct != null) {
      return direct;
    }

    if (typeof totalRemainingLessons === "number") {
      return totalRemainingLessons;
    }

    for (const place of placements) {
      const candidate = deriveRemainingLessons(place.remainingLessons ?? null);
      if (candidate != null) {
        return candidate;
      }
    }

    return null;
  })();

  const placementsWithRemaining = placements.map(place => {
    const manual = deriveRemainingLessons(place.remainingLessons ?? null);
    if (manual != null) {
      return { ...place, effectiveRemainingLessons: manual };
    }

    const estimated = estimateGroupRemainingLessonsByParams(
      place.area,
      place.group,
      place.payDate,
      normalizedSchedule,
    );

    if (estimated != null) {
      return { ...place, effectiveRemainingLessons: estimated };
    }

    if (typeof totalRemainingLessons === "number") {
      return { ...place, effectiveRemainingLessons: totalRemainingLessons };
    }

    if (derivedRemainingLessons != null) {
      return { ...place, effectiveRemainingLessons: derivedRemainingLessons };
    }

    return { ...place, effectiveRemainingLessons: null };
  });

  const [section, setSection] = useState<"info" | "attendance" | "performance" | "payments">(
    "info",
  );

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

  const sortedPaymentFacts = useMemo(() => {
    const toTimestamp = (value: string | null) => {
      if (!value) return Number.NEGATIVE_INFINITY;
      const parsed = new Date(value);
      const time = parsed.getTime();
      return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
    };

    return paymentFacts
      .slice()
      .sort((a, b) => toTimestamp(getPaymentFactComparableDate(b)) - toTimestamp(getPaymentFactComparableDate(a)));
  }, [paymentFacts]);

  const paymentFactEntries = useMemo(
    () =>
      sortedPaymentFacts.map(fact => {
        const comparableDate = getPaymentFactComparableDate(fact);
        const displayDate = comparableDate ? fmtDate(comparableDate) : "—";
        const areaGroup = [fact.area, fact.group].filter(Boolean).join(" · ") || "—";
        const amount =
          typeof fact.amount === "number" ? fmtMoney(fact.amount, currency, currencyRates) : null;
        const plan = getPaymentFactPlanLabel(fact.subscriptionPlan);
        return {
          id: fact.id,
          date: displayDate,
          amount,
          areaGroup,
          plan,
          period: fact.periodLabel,
        };
      }),
    [sortedPaymentFacts, currency, currencyRates],
  );

  const paymentFactsCount = paymentFacts.length;
  const lastPaymentFact = sortedPaymentFacts[0];
  const lastPaymentDate = lastPaymentFact
    ? (() => {
        const iso = getPaymentFactComparableDate(lastPaymentFact);
        return iso ? fmtDate(iso) : "—";
      })()
    : "—";
  const lastPaymentAmount =
    typeof lastPaymentFact?.amount === "number"
      ? fmtMoney(lastPaymentFact.amount, currency, currencyRates)
      : null;

  const attendedCount = attendanceEntries.filter(entry => entry.came).length;
  const successfulCount = performanceEntries.filter(entry => entry.successful).length;

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
            {(client.payMethod || client.status || displayPayStatus) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {client.payMethod ? (
                  <ClientBadge label="Способ оплаты" value={client.payMethod} />
                ) : null}
                {client.status ? (
                  <ClientBadge label="Статус клиента" value={client.status} />
                ) : null}
                {displayPayStatus ? (
                  <ClientBadge label="Статус оплаты" value={displayPayStatus} />
                ) : null}
              </div>
            )}
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
              { id: "payments", label: "Факты оплат" },
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
          <div className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <ClientInfoRow label="Телефон" value={client.phone || "—"} />
              <ClientInfoRow label="WhatsApp" value={client.whatsApp || "—"} />
              <ClientInfoRow label="Telegram" value={client.telegram || "—"} />
              <ClientInfoRow label="Instagram" value={client.instagram || "—"} />
              <ClientInfoRow label="Канал" value={client.channel || "—"} />
              <ClientInfoRow label="Способ оплаты" value={client.payMethod || "—"} />
              <ClientInfoRow label="Статус клиента" value={client.status || "—"} />
              <ClientInfoRow label="Родитель" value={client.parentName || "—"} />
              <ClientInfoRow label="Дата рождения" value={client.birthDate?.slice(0, 10) || "—"} />
              <ClientInfoRow label="Возраст" value={client.birthDate ? `${calcAgeYears(client.birthDate)} лет` : "—"} />
              <ClientInfoRow label="Дата начала" value={client.startDate?.slice(0, 10) || "—"} />
              <ClientInfoRow label="Опыт" value={client.startDate ? calcExperience(client.startDate) : "—"} />
              <ClientInfoRow label="Заморозка" value={String(displayedFrozenLessons)} />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Тренировочные места
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {placementsWithRemaining.map(place => {
                  const planLabel = place.subscriptionPlan
                    ? getSubscriptionPlanMeta(place.subscriptionPlan)?.label ?? "—"
                    : "—";
                  const frozenLessons = place.frozenLessons ?? client.frozenLessons ?? 0;
                  return (
                    <div
                      key={`${place.id}-${place.area}-${place.group}`}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-100">
                        {place.area} · {place.group}
                      </div>
                      <dl className="mt-3 grid gap-1 text-slate-600 dark:text-slate-300">
                        <ClientPlacementInfoCell label="Статус оплаты" value={displayPayStatus || "—"} />
                        <ClientPlacementInfoCell label="Форма абонемента" value={planLabel} />
                        <ClientPlacementInfoCell label="Дата оплаты" value={place.payDate?.slice(0, 10) || "—"} />
                        <ClientPlacementInfoCell
                          label="Сумма оплаты"
                          value={
                            place.payAmount != null
                              ? fmtMoney(place.payAmount, currency, currencyRates)
                              : "—"
                          }
                        />
                        <ClientPlacementInfoCell
                          label="Факт оплаты"
                          value={
                            hasWaitingStatus || (billingPeriod?.month != null && !paidInSelectedPeriod)
                              ? "—"
                              : place.payActual != null
                              ? fmtMoney(place.payActual, currency, currencyRates)
                              : "—"
                          }
                        />
                        <ClientPlacementInfoCell
                          label="Остаток занятий"
                          value={
                            place.effectiveRemainingLessons != null
                              ? String(place.effectiveRemainingLessons)
                              : "—"
                          }
                        />
                        <ClientPlacementInfoCell label="Заморозка" value={String(frozenLessons)} />
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
            <ClientSummaryPill label="Отметок" value={attendanceEntries.length} />
            <ClientSummaryPill label="Посетил" value={attendedCount} />
            <ClientSummaryPill
              label="Последнее занятие"
              value={attendanceEntries[0] ? fmtDate(attendanceEntries[0].date) : "—"}
            />
            <ClientHistoryList
              emptyText="Пока нет отметок посещаемости"
              entries={attendanceEntries.map(entry => ({
                id: entry.id,
                date: fmtDate(entry.date),
                value:
                  entry.status === "frozen"
                    ? "заморозка"
                    : entry.came
                    ? "пришёл"
                    : "отсутствовал",
                tone:
                  entry.status === "frozen"
                    ? "info"
                    : entry.came
                    ? "success"
                    : "warning",
              }))}
            />
          </div>
        )}

        {section === "payments" && (
          <div className="space-y-2">
            <ClientSummaryPill label="Фактов" value={paymentFactsCount} />
            <ClientSummaryPill label="Последняя оплата" value={lastPaymentDate} />
            {lastPaymentAmount ? (
              <ClientSummaryPill label="Сумма последней оплаты" value={lastPaymentAmount} />
            ) : null}
            <ClientPaymentFactsList
              emptyText="Пока нет фактов оплат"
              entries={paymentFactEntries}
            />
          </div>
        )}

        {section === "performance" && (
          <div className="space-y-2">
            <ClientSummaryPill label="Оценок" value={performanceEntries.length} />
            <ClientSummaryPill label="Успешных" value={successfulCount} />
            <ClientSummaryPill
              label="Последняя оценка"
              value={performanceEntries[0] ? fmtDate(performanceEntries[0].date) : "—"}
            />
            <ClientHistoryList
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

function ClientInfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}

function ClientBadge({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-200">
      <span>{label}</span>
      <span className="text-sm normal-case">{value}</span>
    </span>
  );
}

function ClientPlacementInfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}

function ClientSummaryPill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      <span className="uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

function ClientHistoryList({
  entries,
  emptyText,
}: {
  entries: { id: string; date: string; value: string; tone: "success" | "warning" | "info" }[];
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
              : entry.tone === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
              : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-200"
          }`}
        >
          <div className="text-xs uppercase tracking-wide">{entry.date}</div>
          <div className="font-semibold">{entry.value}</div>
        </li>
      ))}
    </ul>
  );
}

function ClientPaymentFactsList({
  entries,
  emptyText,
}: {
  entries: {
    id: string;
    date: string;
    amount: string | null;
    areaGroup: string;
    plan?: string;
    period?: string | null;
  }[];
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
          className="rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <span>{entry.date}</span>
            {entry.period ? <span>{entry.period}</span> : null}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="font-semibold text-slate-700 dark:text-slate-100">{entry.areaGroup}</span>
            {entry.amount ? (
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {entry.amount}
              </span>
            ) : null}
          </div>
          {entry.plan ? (
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{entry.plan}</div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
