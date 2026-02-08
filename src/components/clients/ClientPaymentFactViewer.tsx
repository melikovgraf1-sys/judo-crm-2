import React from "react";
import Modal from "../Modal";
import { getPaymentFactPlanLabel } from "../../state/paymentFacts";
import { matchesPlacement } from "./paymentStatus";
import {
  getGroupDefaultExpectedAmount,
  getSubscriptionPlanAmountForGroup,
} from "../../state/payments";
import * as utils from "../../state/utils";
import type {
  ClientPlacement,
  Currency,
  PaymentFact,
  Settings,
} from "../../types";

type PlacementSummary =
  Pick<ClientPlacement, "area" | "group" | "remainingLessons" | "frozenLessons"> & {
    effectiveRemainingLessons?: number | null;
  };

interface Props {
  fact: PaymentFact;
  currency: Currency;
  currencyRates: Settings["currencyRates"];
  placements: PlacementSummary[];
  defaultRemainingLessons: number | null;
  fallbackRemainingLessons: number | null;
  defaultFrozenLessons: number | null;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => Promise<void> | void;
  deleting?: boolean;
}

const { fmtDate, fmtMoney } = utils;

export default function ClientPaymentFactViewer({
  fact,
  currency,
  currencyRates,
  placements,
  defaultRemainingLessons,
  fallbackRemainingLessons,
  defaultFrozenLessons,
  onClose,
  onEdit,
  onDelete,
  deleting,
}: Props) {
  const paidAt = fact.paidAt ? fmtDate(fact.paidAt) : "—";
  const actualAmount =
    typeof fact.amount === "number" ? fmtMoney(fact.amount, currency, currencyRates) : "—";
  const plan = getPaymentFactPlanLabel(fact.subscriptionPlan) ?? "—";
  const period = fact.periodLabel ?? "—";
  const matchingPlacement = placements.find(place => matchesPlacement(place, fact)) ?? null;
  const expectedAmountValue = (() => {
    const area = fact.area ?? matchingPlacement?.area ?? null;
    const group = fact.group ?? matchingPlacement?.group ?? null;

    if (fact.subscriptionPlan) {
      const amount = getSubscriptionPlanAmountForGroup(
        area ?? undefined,
        group ?? undefined,
        fact.subscriptionPlan,
      );
      if (amount != null) {
        return amount;
      }
    }

    return getGroupDefaultExpectedAmount(area ?? undefined, group ?? undefined);
  })();
  const expectedAmount =
    expectedAmountValue != null ? fmtMoney(expectedAmountValue, currency, currencyRates) : "—";

  const getFiniteNumber = (value: number | null | undefined): number | null => {
    if (typeof value !== "number") {
      return null;
    }
    return Number.isFinite(value) ? value : null;
  };

  const placementForLessons =
    matchingPlacement ??
    (() => {
      const area = fact.area ?? null;
      const group = fact.group ?? null;

      const matchesFactPlacement =
        area != null || group != null
          ? placements.find(place => {
              if (getFiniteNumber(place.effectiveRemainingLessons) == null) {
                return false;
              }
              if (area != null && place.area !== area) {
                return false;
              }
              if (group != null && place.group !== group) {
                return false;
              }
              return true;
            }) ?? null
          : null;

      if (matchesFactPlacement) {
        return matchesFactPlacement;
      }

      return (
        placements.find(place => getFiniteNumber(place.effectiveRemainingLessons) != null) ?? null
      );
    })();

  const fallbackRemainingLessonsValue = getFiniteNumber(fallbackRemainingLessons);
  const defaultRemainingLessonsValue = getFiniteNumber(defaultRemainingLessons);
  // Остаток занятий берём как в таблице (fallback = getEffectiveRemainingLessons), иначе default
  const remainingLessons =
    fallbackRemainingLessonsValue ?? defaultRemainingLessonsValue;
  const factFrozenLessons = getFiniteNumber(fact.frozenLessons);
  const frozenLessons =
    factFrozenLessons ??
    getFiniteNumber(placementForLessons?.frozenLessons) ??
    getFiniteNumber(defaultFrozenLessons);

  return (
    <Modal size="sm" onClose={onClose}>
      <div className="space-y-4">
        <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Факт оплаты
        </div>
        <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
          <FactRow label="Район" value={fact.area ?? "—"} />
          <FactRow label="Группа" value={fact.group ?? "—"} />
          <FactRow label="Форма абонемента" value={plan} />
          <FactRow label="Дата оплаты" value={paidAt} />
          <FactRow label="Сумма (ожидаемая), €" value={expectedAmount} />
          <FactRow label="Факт оплаты, €" value={actualAmount} />
          <FactRow label="Период" value={period} />
          <FactRow
            label="Остаток занятий"
            value={remainingLessons != null ? String(remainingLessons) : "—"}
          />
          <FactRow
            label="Заморозка"
            value={frozenLessons != null ? String(frozenLessons) : "—"}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Закрыть
          </button>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md border border-sky-500 px-3 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 dark:border-sky-500 dark:text-sky-200 dark:hover:bg-slate-800"
            >
              Редактировать
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={Boolean(deleting)}
              className="rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/30"
            >
              {deleting ? "Удаление..." : "Удалить"}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}
