import React, { useMemo, useState } from "react";
import Modal from "../Modal";
import { getSubscriptionPlanMeta } from "../../state/payments";
import { formatPaymentPeriod } from "../../state/paymentFacts";
import type { PaymentFact, SubscriptionPlan } from "../../types";

export interface PaymentFactEditorValues {
  area: string;
  group: string;
  paidAt: string;
  amount: string;
  subscriptionPlan: SubscriptionPlan | "";
  periodLabel: string;
  remainingLessons: string;
  frozenLessons: string;
}

interface Props {
  fact: PaymentFact;
  availableAreas: string[];
  availableGroups: string[];
  saving: boolean;
  defaultRemainingLessons: number | null;
  defaultFrozenLessons: number | null;
  onSubmit: (values: PaymentFactEditorValues) => Promise<void> | void;
  onClose: () => void;
}

const PLAN_OPTIONS: SubscriptionPlan[] = [
  "monthly",
  "weekly",
  "half-month",
  "single",
  "discount",
];

const getDateInputValue = (iso?: string) => (iso ? iso.slice(0, 10) : "");

const monthFormatter = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});

const getRecentMonths = (referenceISO?: string, total: number = 12) => {
  const months: string[] = [];
  const now = referenceISO ? new Date(referenceISO) : new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  for (let index = 0; index < total; index += 1) {
    const date = new Date(base);
    date.setUTCMonth(base.getUTCMonth() - index);
    months.push(monthFormatter.format(date));
  }

  return months;
};

export default function ClientPaymentFactEditor({
  fact,
  availableAreas,
  availableGroups,
  saving,
  defaultRemainingLessons,
  defaultFrozenLessons,
  onSubmit,
  onClose,
}: Props) {
  const [form, setForm] = useState<PaymentFactEditorValues>(() => ({
    area: fact.area ?? "",
    group: fact.group ?? "",
    paidAt: getDateInputValue(fact.paidAt),
    amount: fact.amount != null ? String(fact.amount) : "",
    subscriptionPlan: fact.subscriptionPlan ?? "",
    periodLabel: fact.periodLabel ?? "",
    remainingLessons:
      fact.remainingLessons != null
        ? String(fact.remainingLessons)
        : defaultRemainingLessons != null
        ? String(defaultRemainingLessons)
        : "",
    frozenLessons:
      fact.frozenLessons != null
        ? String(fact.frozenLessons)
        : defaultFrozenLessons != null
        ? String(defaultFrozenLessons)
        : "",
  }));

  const recommendedPeriod = useMemo(() => {
    const plan = form.subscriptionPlan ? (form.subscriptionPlan as SubscriptionPlan) : undefined;
    const reference = form.paidAt || undefined;
    return formatPaymentPeriod(plan, reference);
  }, [form.paidAt, form.subscriptionPlan]);

  const areaOptions = useMemo(() => {
    const unique = new Set<string>();
    availableAreas.forEach(option => {
      if (option) {
        unique.add(option);
      }
    });
    if (fact.area) {
      unique.add(fact.area);
    }
    if (form.area) {
      unique.add(form.area);
    }
    return Array.from(unique);
  }, [availableAreas, fact.area, form.area]);

  const groupOptions = useMemo(() => {
    const unique = new Set<string>();
    availableGroups.forEach(option => {
      if (option) {
        unique.add(option);
      }
    });
    if (fact.group) {
      unique.add(fact.group);
    }
    if (form.group) {
      unique.add(form.group);
    }
    return Array.from(unique);
  }, [availableGroups, fact.group, form.group]);

  const referenceDate = form.paidAt || undefined;
  const monthOptions = useMemo(
    () => getRecentMonths(referenceDate),
    [referenceDate],
  );

  const periodOptions = useMemo(() => {
    const options = new Set<string>();
    const plan = form.subscriptionPlan ? (form.subscriptionPlan as SubscriptionPlan) : undefined;
    const currentRecommendation = formatPaymentPeriod(plan, referenceDate);

    if (plan === "single") {
      options.add("1 день");
    } else if (plan === "half-month") {
      options.add("14 дней");
    } else if (plan === "monthly" || plan === "weekly" || plan === "discount") {
      monthOptions.forEach(label => options.add(label));
    }

    if (currentRecommendation) {
      options.add(currentRecommendation);
    }

    if (form.periodLabel) {
      options.add(form.periodLabel);
    }

    return Array.from(options);
  }, [form.periodLabel, form.subscriptionPlan, monthOptions, referenceDate]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    if (name === "subscriptionPlan") {
      setForm(prev => {
        const nextPlan = value ? (value as SubscriptionPlan | "") : "";
        const normalizedPlan = nextPlan ? (nextPlan as SubscriptionPlan) : undefined;
        const reference = prev.paidAt || undefined;
        const previousRecommendation = prev.subscriptionPlan
          ? formatPaymentPeriod(prev.subscriptionPlan as SubscriptionPlan, reference)
          : undefined;
        const nextRecommendation = normalizedPlan
          ? formatPaymentPeriod(normalizedPlan, reference)
          : undefined;

        let amount = prev.amount;
        const meta = normalizedPlan ? getSubscriptionPlanMeta(normalizedPlan) : undefined;
        if (meta?.amount != null) {
          amount = String(meta.amount);
        }

        let periodLabel = prev.periodLabel;
        if (nextRecommendation && (!periodLabel || periodLabel === previousRecommendation)) {
          periodLabel = nextRecommendation;
        } else if (!normalizedPlan && periodLabel === previousRecommendation) {
          periodLabel = "";
        }

        return {
          ...prev,
          subscriptionPlan: nextPlan,
          amount,
          periodLabel,
        };
      });
      return;
    }

    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(form);
  };

  return (
    <Modal size="md" onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Редактирование факта оплаты
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">Район</span>
            <select
              name="area"
              value={form.area}
              onChange={handleChange}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Не указано</option>
              {areaOptions.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">Группа</span>
            <select
              name="group"
              value={form.group}
              onChange={handleChange}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Не указано</option>
              {groupOptions.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">Дата оплаты</span>
            <input
              type="date"
              name="paidAt"
              value={form.paidAt}
              onChange={handleChange}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">Факт оплаты, €</span>
            <input
              type="number"
              name="amount"
              value={form.amount}
              onChange={handleChange}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Укажите сумму"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">Форма абонемента</span>
            <select
              name="subscriptionPlan"
              value={form.subscriptionPlan}
              onChange={handleChange}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Не указано</option>
              {PLAN_OPTIONS.map(option => {
                const meta = getSubscriptionPlanMeta(option);
                return (
                  <option key={option} value={option}>
                    {meta?.label ?? option}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
          <span className="font-medium text-slate-700 dark:text-slate-200">Период</span>
          <select
            name="periodLabel"
            value={form.periodLabel}
            onChange={handleChange}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Не указано</option>
            {periodOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {recommendedPeriod ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Рекомендовано: {recommendedPeriod}
            </span>
          ) : null}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">Остаток занятий</span>
            <input
              type="number"
              name="remainingLessons"
              value={form.remainingLessons}
              onChange={handleChange}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Рассчитывается автоматически"
            />
            {defaultRemainingLessons != null ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Рекомендуемое значение: {defaultRemainingLessons}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">Заморозка занятий</span>
            <input
              type="number"
              name="frozenLessons"
              value={form.frozenLessons}
              onChange={handleChange}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Количество замороженных занятий"
            />
            {defaultFrozenLessons != null ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                По данным посещаемости: {defaultFrozenLessons}
              </span>
            ) : null}
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={saving}
          >
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}
