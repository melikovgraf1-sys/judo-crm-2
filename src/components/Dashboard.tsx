import React, { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "./Breadcrumbs";
import { fmtMoney, fmtDate } from "../state/utils";
import { buildFavoriteSummaries } from "../state/analytics";
import type { Currency, DB, LeadStage, TaskItem, UIState } from "../types";
import { readDailyPeriod, writeDailyPeriod } from "../state/filterPersistence";
import {
  collectAvailableYears,
  filterLeadsByPeriod,
  formatMonthInput,
  getDefaultPeriod,
  isClientInPeriod,
  type PeriodFilter,
} from "../state/period";

type MetricCardProps = {
  title: string;
  value: string;
  accent: "green" | "sky" | "slate";
};

function MetricCard({ title, value, accent }: MetricCardProps) {
  const cls = accent === "green"
    ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700"
    : accent === "sky"
      ? "bg-sky-50 border-sky-200 dark:bg-sky-900/30 dark:border-sky-700"
      : "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700";
  return (
    <div className={`p-4 rounded-2xl border ${cls} min-w-[180px]`}>
      <div className="text-xs text-slate-500 dark:text-slate-400">{title}</div>
      <div className="text-xl font-semibold text-slate-800 dark:text-slate-200 mt-1">{value}</div>
    </div>
  );
}

type DashboardProps = {
  db: DB;
  ui: UIState;
};

export default function Dashboard({ db, ui }: DashboardProps) {
  const persistedPeriod = useMemo(() => readDailyPeriod("dashboard"), []);
  const [period, setPeriod] = useState<PeriodFilter>(() => {
    const fallback = getDefaultPeriod();
    return {
      year: persistedPeriod.year ?? fallback.year,
      month: persistedPeriod.month ?? fallback.month,
    };
  });

  useEffect(() => {
    writeDailyPeriod("dashboard", period.month, period.year);
  }, [period]);

  const monthValue = formatMonthInput(period);
  const availableYears = useMemo(() => collectAvailableYears(db), [db]);
  const years = useMemo(() => {
    if (availableYears.includes(period.year)) {
      return availableYears;
    }
    return [...availableYears, period.year].sort((a, b) => b - a);
  }, [availableYears, period.year]);

  const currency = ui.currency;
  const periodClients = useMemo(() => db.clients.filter(client => isClientInPeriod(client, period)), [db.clients, period]);
  const totalClients = periodClients.length;
  const activeClients = useMemo(
    () => periodClients.filter(c => c.payStatus === "действует").length,
    [periodClients],
  );
  const leadStages: LeadStage[] = [
    "Очередь",
    "Задержка",
    "Пробное",
    "Ожидание оплаты",
    "Оплаченный абонемент",
    "Отмена",
  ];
  const leads = useMemo(() => filterLeadsByPeriod(db.leads, period), [db.leads, period]);
  const leadsDistribution = useMemo(
    () =>
      leads.reduce((acc, l) => {
        acc[l.stage] = (acc[l.stage] || 0) + 1;
        return acc;
      }, {} as Record<LeadStage, number>),
    [leads],
  );

  const sortedTasks = useMemo(
    () => db.tasks.slice().sort((a: TaskItem, b: TaskItem) => +new Date(a.due) - +new Date(b.due)),
    [db.tasks]
  );

  const revenueEUR = activeClients * 55;
  const rate = (cur: Currency) => (cur === "EUR" ? 1 : cur === "TRY" ? db.settings.currencyRates.TRY : db.settings.currencyRates.RUB);
  const revenue = revenueEUR * rate(currency);

  const totalLimit = Object.values(db.settings.limits).reduce((a, b) => a + b, 0);
  const fillPct = totalLimit ? Math.round((activeClients / totalLimit) * 100) : 0;
  const favoriteCards = useMemo(() => buildFavoriteSummaries(db, currency, period), [db, currency, period]);

  const handleMonthChange = (value: string) => {
    if (!value) {
      setPeriod(prev => ({ ...prev, month: null }));
      return;
    }
    const [yearPart, monthPart] = value.split("-");
    const nextYear = Number.parseInt(yearPart, 10);
    const nextMonth = Number.parseInt(monthPart, 10);
    if (!Number.isFinite(nextYear) || !Number.isFinite(nextMonth)) {
      return;
    }
    setPeriod({ year: nextYear, month: nextMonth });
  };

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextYear = Number.parseInt(event.target.value, 10);
    if (!Number.isFinite(nextYear)) {
      return;
    }
    setPeriod(prev => ({ year: nextYear, month: prev.month }));
  };

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Дашборд"]} />
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="dashboard-month" className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Месяц
        </label>
        <input
          id="dashboard-month"
          type="month"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={monthValue}
          onChange={event => handleMonthChange(event.target.value)}
        />
        <label htmlFor="dashboard-year" className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Год
        </label>
        <select
          id="dashboard-year"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={period.year}
          onChange={handleYearChange}
        >
          {years.map(year => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      {favoriteCards.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {favoriteCards.map(card => (
            <MetricCard key={card.id} title={card.title} value={card.value} accent={card.accent} />
          ))}
        </div>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title="Ученики всего" value={String(totalClients)} accent="sky" />
        <MetricCard title="Активные (действует)" value={String(activeClients)} accent="green" />
        <MetricCard title="Выручка (прибл.)" value={fmtMoney(revenue, currency)} accent="sky" />
        <MetricCard title="Заполняемость" value={`${fillPct}%`} accent={fillPct >= 80 ? "green" : "slate"} />
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="font-semibold mb-2 text-slate-800 dark:text-slate-200">Лиды по этапам</div>
          <div className="flex flex-wrap gap-2">
            {leadStages.map(s => (
              <div
                key={s}
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs dark:bg-slate-800 dark:border-slate-700"
              >
                <div className="text-slate-500 dark:text-slate-400">{s}</div>
                <div className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                  {leadsDistribution[s] || 0}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="font-semibold mb-2 text-slate-800 dark:text-slate-200">Предстоящие задачи</div>
          <ul className="space-y-2">
            {sortedTasks
              .slice(0, 6)
              .map(t => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{t.title}</span>
                  <span className="text-slate-500 dark:text-slate-400">{fmtDate(t.due)}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
