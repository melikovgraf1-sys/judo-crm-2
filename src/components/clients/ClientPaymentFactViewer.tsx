import React from "react";
import Modal from "../Modal";
import { getPaymentFactPlanLabel } from "../../state/paymentFacts";
import { matchesPlacement } from "./paymentStatus";
import * as utils from "../../state/utils";
import type {
  ClientPlacement,
  Currency,
  PaymentFact,
  Settings,
  SubscriptionPlan,
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
  defaultFrozenLessons: number | null;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => Promise<void> | void;
  deleting?: boolean;
}

const { fmtDate, fmtMoney } = utils;

const EXPECTED_AMOUNT_BY_PLAN: Record<SubscriptionPlan, number> = {
  monthly: 55,
  weekly: 27.5,
  "half-month": 27.5,
  single: 13,
  discount: 55,
};

export default function ClientPaymentFactViewer({
  fact,
  currency,
  currencyRates,
  placements,
  defaultRemainingLessons,
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
  const expectedAmountValue = fact.subscriptionPlan
    ? EXPECTED_AMOUNT_BY_PLAN[fact.subscriptionPlan] ?? null
    : null;
  const expectedAmount =
    expectedAmountValue != null ? fmtMoney(expectedAmountValue, currency, currencyRates) : "—";

  const getFiniteNumber = (value: number | null | undefined): number | null => {
    if (typeof value !== "number") {
      return null;
    }
    return Number.isFinite(value) ? value : null;
  };

  const matchingPlacement = placements.find(place => matchesPlacement(place, fact)) ?? null;
  const remainingLessons =
    getFiniteNumber(matchingPlacement?.effectiveRemainingLessons) ??
    getFiniteNumber(matchingPlacement?.remainingLessons) ??
    getFiniteNumber(defaultRemainingLessons);
  const frozenLessons =
    getFiniteNumber(matchingPlacement?.frozenLessons) ?? getFiniteNumber(defaultFrozenLessons);

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
