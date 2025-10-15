import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import type { Area, Currency, DB, Group } from "../types";
import { commitDBUpdate } from "../state/appState";
import {
  ATHLETE_METRIC_KEYS,
  ATHLETE_METRIC_LABELS,
  LEAD_METRIC_KEYS,
  LEAD_METRIC_LABELS,
  METRIC_LABELS,
  PROJECTION_LABELS,
  computeAnalyticsSnapshot,
  encodeFavorite,
  formatAthleteMetricValue,
  formatLeadMetricValue,
  formatMetricValue,
  getAnalyticsAreas,
  getAnalyticsGroups,
  type AnalyticsFavorite,
  type AreaScope,
  type MetricKey,
  type ProjectionKey,
} from "../state/analytics";
import {
  readDailyPeriod,
  readDailySelection,
  writeDailyPeriod,
  writeDailySelection,
  clearDailySelection,
} from "../state/filterPersistence";
import { MONTH_OPTIONS, collectAvailableYears, formatMonthInput, getDefaultPeriod, type PeriodFilter } from "../state/period";

type Props = {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  currency: Currency;
};

const PROJECTION_ORDER: ProjectionKey[] = ["actual", "forecast", "remaining", "target"];
const METRIC_ORDER: MetricKey[] = ["revenue", "profit", "fill", "athletes"];

export default function AnalyticsTab({ db, setDB, currency }: Props) {
  const areas = useMemo(() => getAnalyticsAreas(db), [db]);
  const currencyRates = db.settings.currencyRates;
  const storedSelection = useMemo(() => readDailySelection("analytics"), []);
  const [area, setArea] = useState<AreaScope>(() => {
    const storedArea = storedSelection.area as Area | null;
    if (storedArea && areas.includes(storedArea)) {
      return storedArea;
    }
    return areas[0] ?? "all";
  });
  const [group, setGroup] = useState<Group | null>(() => {
    const storedArea = storedSelection.area as Area | null;
    const storedGroup = storedSelection.group as Group | null;
    if (!storedArea || !storedGroup) {
      return null;
    }
    if (!areas.includes(storedArea)) {
      return null;
    }
    const available = getAnalyticsGroups(db, storedArea);
    return available.includes(storedGroup) ? storedGroup : null;
  });
  const [rentInput, setRentInput] = useState("0");
  const [coachSalaryInput, setCoachSalaryInput] = useState("0");
  const persistedPeriod = useMemo(() => readDailyPeriod("analytics"), []);
  const [period, setPeriod] = useState<PeriodFilter>(() => {
    const fallback = getDefaultPeriod();
    return {
      year: persistedPeriod.year ?? fallback.year,
      month: persistedPeriod.month ?? fallback.month,
    };
  });

  useEffect(() => {
    writeDailyPeriod("analytics", period.month, period.year);
  }, [period]);

  useEffect(() => {
    if (area === "all") {
      clearDailySelection("analytics");
      return;
    }
    writeDailySelection("analytics", area, group ?? null);
  }, [area, group]);

  const monthValue = formatMonthInput(period);
  const baseYears = useMemo(() => collectAvailableYears(db), [db]);
  const years = useMemo(() => {
    if (baseYears.includes(period.year)) {
      return baseYears;
    }
    return [...baseYears, period.year].sort((a, b) => b - a);
  }, [baseYears, period.year]);

  const handleMonthChange = (value: string) => {
    if (!value) {
      setPeriod(prev => ({ ...prev, month: null }));
      return;
    }
    const nextMonth = Number.parseInt(value, 10);
    if (!Number.isFinite(nextMonth)) {
      return;
    }
    setPeriod(prev => ({ ...prev, month: nextMonth }));
  };

  useEffect(() => {
    if (!areas.includes(area)) {
      const fallback = areas[0] ?? "all";
      setArea(fallback);
      return;
    }
  }, [area, areas]);

  const availableGroups = useMemo(() => {
    if (area === "all") {
      return [] as Group[];
    }
    return getAnalyticsGroups(db, area);
  }, [area, db]);

  useEffect(() => {
    if (area === "all") {
      if (group !== null) {
        setGroup(null);
      }
      return;
    }
    if (group && !availableGroups.includes(group)) {
      setGroup(null);
    }
  }, [area, availableGroups, group]);

  useEffect(() => {
    if (area === "all") {
      setRentInput("0");
      setCoachSalaryInput("0");
      return;
    }
    const rentValue = db.settings.rentByAreaEUR?.[area];
    setRentInput(typeof rentValue === "number" && Number.isFinite(rentValue) ? String(rentValue) : "0");
    const salaryValue = db.settings.coachSalaryByAreaEUR?.[area];
    setCoachSalaryInput(typeof salaryValue === "number" && Number.isFinite(salaryValue) ? String(salaryValue) : "0");
  }, [area, db]);

  const favorites = useMemo(() => db.settings.analyticsFavorites ?? [], [db.settings.analyticsFavorites]);
  const scopeGroup = area === "all" ? null : group;
  const snapshot = useMemo(() => computeAnalyticsSnapshot(db, area, period, scopeGroup), [db, area, period, scopeGroup]);
  const hasGroupScope = area !== "all" && Boolean(scopeGroup);

  const displayedMetrics = useMemo(() => {
    if (!hasGroupScope) {
      return METRIC_ORDER;
    }
    return METRIC_ORDER.filter(metric => metric !== "profit");
  }, [hasGroupScope]);

  const parseInputValue = useCallback((raw: string): number => {
    if (!raw.trim()) {
      return 0;
    }
    const normalized = raw.replace(/,/g, ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const persistAreaValue = useCallback(
    async (field: "rentByAreaEUR" | "coachSalaryByAreaEUR", value: number) => {
      if (area === "all") {
        return;
      }
      const currentMap = field === "rentByAreaEUR" ? db.settings.rentByAreaEUR : db.settings.coachSalaryByAreaEUR;
      const rawCurrent = currentMap?.[area];
      const currentValue = typeof rawCurrent === "number" && Number.isFinite(rawCurrent) ? rawCurrent : 0;
      if (currentValue === value) {
        return;
      }
      const nextSettings: DB["settings"] = {
        ...db.settings,
        [field]: { ...(currentMap ?? {}), [area]: value },
      } as DB["settings"];
      const next = { ...db, settings: nextSettings };
      const result = await commitDBUpdate(next, setDB);
      if (!result.ok) {
        if (result.reason === "error") {
          window.alert(
            "Не удалось сохранить значение. Изменение сохранено локально, проверьте подключение к базе данных.",
          );
        }
        return;
      }
    },
    [area, db, setDB],
  );

  const handleRentCommit = useCallback(
    (value?: string) => {
      if (area === "all") {
        return;
      }
      const parsed = parseInputValue(value ?? rentInput);
      setRentInput(String(parsed));
      void persistAreaValue("rentByAreaEUR", parsed);
    },
    [area, parseInputValue, persistAreaValue, rentInput],
  );

  const handleCoachSalaryCommit = useCallback(
    (value?: string) => {
      if (area === "all") {
        return;
      }
      const parsed = parseInputValue(value ?? coachSalaryInput);
      setCoachSalaryInput(String(parsed));
      void persistAreaValue("coachSalaryByAreaEUR", parsed);
    },
    [area, coachSalaryInput, parseInputValue, persistAreaValue],
  );

  const toggleFavorite = useCallback(
    async (favorite: AnalyticsFavorite) => {
      const id = encodeFavorite(favorite);
      const isFavorite = favorites.includes(id);
      let nextFavorites: string[];
      if (isFavorite) {
        nextFavorites = favorites.filter(fav => fav !== id);
      } else {
        if (favorites.length >= 16) {
          window.alert("Можно закрепить не более 16 показателей для дашборда.");
          return;
        }
        nextFavorites = [...favorites, id];
      }
      const next = { ...db, settings: { ...db.settings, analyticsFavorites: nextFavorites } };
      const result = await commitDBUpdate(next, setDB);
      if (!result.ok) {
        if (result.reason === "error") {
          window.alert(
            "Не удалось обновить избранные показатели. Изменение сохранено локально, проверьте доступ к базе данных.",
          );
        }
        return;
      }
    },
    [db, favorites, setDB],
  );

  const format = useCallback(
    (metric: MetricKey, projection: ProjectionKey) => {
      const entry = snapshot.metrics[metric];
      if (!entry) {
        return "—";
      }
      return formatMetricValue(entry.values[projection], entry.unit, currency, currencyRates);
    },
    [currency, currencyRates, snapshot.metrics],
  );

  const formattedRent = useMemo(() => {
    if (hasGroupScope) {
      return "—";
    }
    return formatMetricValue(snapshot.rent, "money", currency, currencyRates);
  }, [currency, currencyRates, hasGroupScope, snapshot.rent]);

  const formattedCoachSalary = useMemo(() => {
    if (hasGroupScope) {
      return "—";
    }
    return formatMetricValue(snapshot.coachSalary, "money", currency, currencyRates);
  }, [currency, currencyRates, hasGroupScope, snapshot.coachSalary]);

  const athleteMetrics = useMemo(
    () =>
      ATHLETE_METRIC_KEYS.map(key => ({
        key,
        label: ATHLETE_METRIC_LABELS[key],
        value: formatAthleteMetricValue(key, snapshot.athleteStats),
      })),
    [snapshot.athleteStats],
  );

  const leadMetrics = useMemo(
    () =>
      LEAD_METRIC_KEYS.map(key => ({
        key,
        label: LEAD_METRIC_LABELS[key],
        value: formatLeadMetricValue(key, snapshot.leadStats),
      })),
    [snapshot.leadStats],
  );

  return (
    <div className="space-y-4">
      <Breadcrumbs items={["Аналитика"]} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="analytics-area" className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Район
        </label>
        <select
          id="analytics-area"
          className="px-3 py-2 rounded-md border border-slate-300 bg-white text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          value={area}
          onChange={event => {
            const nextArea = event.target.value as AreaScope;
            setArea(nextArea);
            setGroup(null);
          }}
        >
          {areas.map(option => (
            <option key={option} value={option}>
              {option === "all" ? "Все районы" : option}
            </option>
          ))}
        </select>
        {area !== "all" && (
          <>
            <label htmlFor="analytics-group" className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Группа
            </label>
            <select
              id="analytics-group"
              className="px-3 py-2 rounded-md border border-slate-300 bg-white text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              value={scopeGroup ?? ""}
              onChange={event => {
                const value = event.target.value;
                setGroup(value ? (value as Group) : null);
              }}
            >
              <option value="">Все группы</option>
              {availableGroups.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Добавьте до шестнадцати показателей в избранное, чтобы видеть их на дашборде.
        </span>
        <div className="grow" />
        <label htmlFor="analytics-month" className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Месяц
        </label>
        <select
          id="analytics-month"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={monthValue}
          onChange={event => handleMonthChange(event.target.value)}
        >
          <option value="">Все месяцы</option>
          {MONTH_OPTIONS.map(option => (
            <option key={option.value} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
        <label htmlFor="analytics-year" className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Год
        </label>
        <select
          id="analytics-year"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={period.year}
          onChange={event => {
            const nextYear = Number.parseInt(event.target.value, 10);
            if (!Number.isFinite(nextYear)) {
              return;
            }
            setPeriod(prev => ({ year: nextYear, month: prev.month }));
          }}
        >
          {years.map(year => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Показатель
                </th>
                {PROJECTION_ORDER.map(projection => (
                  <th key={projection} scope="col" className="px-4 py-3 text-left font-medium">
                    {PROJECTION_LABELS[projection]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayedMetrics.map(metric => {
                const metricData = snapshot.metrics[metric];
                return (
                  <tr key={metric} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/60">
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                      {METRIC_LABELS[metric]}
                    </th>
                    {PROJECTION_ORDER.map(projection => {
                      const favorite = { kind: "metric" as const, area, group: scopeGroup ?? null, metric, projection };
                      const id = encodeFavorite(favorite);
                      const starred = favorites.includes(id);
                      return (
                        <td key={projection} className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-pressed={starred}
                              aria-label={starred ? "Убрать из избранного" : "Добавить в избранное"}
                              onClick={() => toggleFavorite(favorite)}
                              className={`text-lg leading-none transition-colors ${
                                starred
                                  ? "text-amber-500 hover:text-amber-600"
                                  : "text-slate-300 hover:text-amber-400 dark:text-slate-600"
                              }`}
                            >
                              {starred ? "★" : "☆"}
                            </button>
                            <span className="font-medium text-slate-800 dark:text-slate-100">
                              {metricData ? format(metric, projection) : "—"}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span>
            Вместимость выбранного направления: <strong>{snapshot.capacity || "—"}</strong>
          </span>
          <span>
            Аренда: <strong>{formattedRent}</strong>
          </span>
          <span>
            Зарплата тренера: <strong>{formattedCoachSalary}</strong>
          </span>
        </div>
        {area !== "all" && !hasGroupScope && (
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              <span className="mb-1">Аренда (EUR)</span>
              <input
                type="number"
                className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-amber-400 dark:focus:ring-amber-500/40"
                value={rentInput}
                onChange={event => setRentInput(event.target.value)}
                onBlur={() => handleRentCommit()}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleRentCommit();
                  }
                }}
                inputMode="decimal"
                min="0"
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600 dark:text-slate-300">
              <span className="mb-1">Зарплата тренера (EUR)</span>
              <input
                type="number"
                className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-amber-400 dark:focus:ring-amber-500/40"
                value={coachSalaryInput}
                onChange={event => setCoachSalaryInput(event.target.value)}
                onBlur={() => handleCoachSalaryCommit()}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleCoachSalaryCommit();
                  }
                }}
                inputMode="decimal"
                min="0"
              />
            </label>
          </div>
        )}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-700 dark:text-slate-100">Спортсмены</h2>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {athleteMetrics.map(item => {
            const favorite = { kind: "athlete" as const, area, group: scopeGroup ?? null, metric: item.key };
            const id = encodeFavorite(favorite);
            const starred = favorites.includes(id);
            return (
              <div
                key={item.key}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {item.label}
                  </div>
                  <button
                    type="button"
                    className={`text-base leading-none transition-colors ${
                      starred
                        ? "text-amber-500 hover:text-amber-600"
                        : "text-slate-300 hover:text-amber-400 dark:text-slate-600"
                    }`}
                    aria-label={
                      starred
                        ? "Убрать показатель спортсменов из избранного"
                        : "Добавить показатель спортсменов в избранное"
                    }
                    aria-pressed={starred}
                    onClick={() => toggleFavorite(favorite)}
                  >
                    {starred ? "★" : "☆"}
                  </button>
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-800 dark:text-slate-100">{item.value}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-700 dark:text-slate-100">Лиды</h2>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {leadMetrics.map(item => {
            const favorite = { kind: "lead" as const, area, group: scopeGroup ?? null, metric: item.key };
            const id = encodeFavorite(favorite);
            const starred = favorites.includes(id);
            return (
              <div
                key={item.key}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {item.label}
                  </div>
                  <button
                    type="button"
                    className={`text-base leading-none transition-colors ${
                      starred
                        ? "text-amber-500 hover:text-amber-600"
                        : "text-slate-300 hover:text-amber-400 dark:text-slate-600"
                    }`}
                    aria-label={
                      starred
                        ? "Убрать показатель лидов из избранного"
                        : "Добавить показатель лидов в избранное"
                    }
                    aria-pressed={starred}
                    onClick={() => toggleFavorite(favorite)}
                  >
                    {starred ? "★" : "☆"}
                  </button>
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-800 dark:text-slate-100">{item.value}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
