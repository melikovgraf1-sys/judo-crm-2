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
  const accentGlow =
    accent === "green"
      ? "from-emerald-400/40 via-emerald-500/30 to-emerald-600/40"
      : accent === "sky"
        ? "from-sky-400/40 via-cyan-400/30 to-blue-500/40"
        : "from-slate-400/40 via-slate-500/30 to-slate-700/40";
  return (
    <div className="relative min-w-[180px] overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-sm transition hover:-translate-y-[2px] hover:shadow-lg dark:border-slate-800/60 dark:bg-slate-950/70">
      <div className={`pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${accentGlow} blur-3xl`} aria-hidden="true" />
      <div className="relative space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
        <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
      </div>
    </div>
  );
}

type DashboardProps = {
  db: DB;
  ui: UIState;
};

export default function Dashboard({ db, ui }: DashboardProps) {
  const FIELD_CLASS =
    "rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200/60 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200 dark:focus:border-sky-500/60 dark:focus:ring-sky-500/30";
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
    <div className="space-y-6">
      <Breadcrumbs items={["Дашборд"]} />
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-4 shadow-sm dark:border-slate-800/60 dark:bg-slate-950/70">
        <label htmlFor="dashboard-month" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Месяц
        </label>
        <input
          id="dashboard-month"
          type="month"
          className={FIELD_CLASS}
          value={monthValue}
          onChange={event => handleMonthChange(event.target.value)}
        />
        <label htmlFor="dashboard-year" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Год
        </label>
        <select
          id="dashboard-year"
          className={FIELD_CLASS}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {favoriteCards.map(card => (
            <MetricCard key={card.id} title={card.title} value={card.value} accent={card.accent} />
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Ученики всего" value={String(totalClients)} accent="sky" />
        <MetricCard title="Активные (действует)" value={String(activeClients)} accent="green" />
        <MetricCard title="Выручка (прибл.)" value={fmtMoney(revenue, currency)} accent="sky" />
        <MetricCard title="Заполняемость" value={`${fillPct}%`} accent={fillPct >= 80 ? "green" : "slate"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-sm dark:border-slate-800/60 dark:bg-slate-950/70">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Лиды по этапам</div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Сфокусируйтесь на этапах, где нужны действия</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {leadStages.map(stage => (
              <div
                key={stage}
                className="relative min-w-[140px] flex-1 overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-xs shadow-sm transition hover:-translate-y-[2px] hover:shadow-md dark:border-slate-800/60 dark:bg-slate-900/60"
              >
                <span className="text-slate-500 dark:text-slate-400">{stage}</span>
                <span className="mt-2 block text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {leadsDistribution[stage] || 0}
                </span>
                <span
                  className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-gradient-to-br from-sky-200/60 via-indigo-200/40 to-transparent blur-2xl dark:from-sky-500/20 dark:via-indigo-500/10"
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-sm dark:border-slate-800/60 dark:bg-slate-950/70">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Предстоящие задачи</div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Первые шесть, чтобы держать фокус на важных делах</p>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-slate-200/70 dark:divide-slate-800/60">
            {sortedTasks.slice(0, 6).map(task => (
              <li key={task.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <span className="flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{task.title}</span>
                <span className="whitespace-nowrap rounded-full bg-slate-100/80 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
                  {fmtDate(task.due)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
