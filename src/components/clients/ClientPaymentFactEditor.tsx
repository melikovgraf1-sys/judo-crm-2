import React, { useMemo, useState } from "react";
import Modal from "../Modal";
import { getSubscriptionPlanMeta } from "../../state/payments";
import { formatPaymentPeriod } from "../../state/paymentFacts";
import type { PaymentFact, SubscriptionPlan } from "../../types";

export interface PaymentFactEditorValues {
  area: string;
  group: string;
  paidAt: string;
  recordedAt: string;
  amount: string;
  subscriptionPlan: SubscriptionPlan | "";
  periodLabel: string;
}

interface Props {
  fact: PaymentFact;
  availableAreas: string[];
  availableGroups: string[];
  saving: boolean;
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

export default function ClientPaymentFactEditor({
  fact,
  availableAreas,
  availableGroups,
  saving,
  onSubmit,
  onClose,
}: Props) {
  const [form, setForm] = useState<PaymentFactEditorValues>(() => ({
    area: fact.area ?? "",
    group: fact.group ?? "",
    paidAt: getDateInputValue(fact.paidAt),
    recordedAt: getDateInputValue(fact.recordedAt),
    amount: fact.amount != null ? String(fact.amount) : "",
    subscriptionPlan: fact.subscriptionPlan ?? "",
    periodLabel: fact.periodLabel ?? "",
  }));

  const recommendedPeriod = useMemo(() => {
    const plan = form.subscriptionPlan ? (form.subscriptionPlan as SubscriptionPlan) : undefined;
    const reference = form.paidAt || form.recordedAt;
    return formatPaymentPeriod(plan, reference || undefined);
  }, [form.paidAt, form.recordedAt, form.subscriptionPlan]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
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
            <input
              name="area"
              value={form.area}
              list={`payment-fact-area-${fact.id}`}
              onChange={handleChange}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Например, Центр"
            />
            <datalist id={`payment-fact-area-${fact.id}`}>
              {availableAreas.map(option => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">Группа</span>
            <input
              name="group"
              value={form.group}
              list={`payment-fact-group-${fact.id}`}
              onChange={handleChange}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Например, 7-10 лет"
            />
            <datalist id={`payment-fact-group-${fact.id}`}>
              {availableGroups.map(option => (
                <option key={option} value={option} />
              ))}
            </datalist>
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
            <span className="font-medium text-slate-700 dark:text-slate-200">Дата фиксации</span>
            <input
              type="date"
              name="recordedAt"
              value={form.recordedAt}
              onChange={handleChange}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">Сумма</span>
            <input
              type="number"
              name="amount"
              value={form.amount}
              onChange={handleChange}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Например, 4500"
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
          <input
            name="periodLabel"
            value={form.periodLabel}
            onChange={handleChange}
            placeholder={recommendedPeriod ?? "Например, Октябрь"}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          {recommendedPeriod ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Рекомендовано: {recommendedPeriod}
            </span>
          ) : null}
        </label>
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
