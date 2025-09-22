import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import type { Currency, DB } from "../types";
import { commitDBUpdate } from "../state/appState";
import {
  METRIC_LABELS,
  PROJECTION_LABELS,
  computeAnalyticsSnapshot,
  encodeFavorite,
  formatMetricValue,
  getAnalyticsAreas,
  type AreaScope,
  type MetricKey,
  type ProjectionKey,
} from "../state/analytics";

type Props = {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  currency: Currency;
};

const PROJECTION_ORDER: ProjectionKey[] = ["actual", "forecast", "remaining", "target"];
const METRIC_ORDER: MetricKey[] = ["revenue", "profit", "fill", "athletes"];

export default function AnalyticsTab({ db, setDB, currency }: Props) {
  const areas = useMemo(() => getAnalyticsAreas(db), [db]);
  const [area, setArea] = useState<AreaScope>(areas[0] ?? "all");

  useEffect(() => {
    if (!areas.includes(area)) {
      setArea(areas[0] ?? "all");
    }
  }, [area, areas]);

  const favorites = db.settings.analyticsFavorites ?? [];
  const snapshot = useMemo(() => computeAnalyticsSnapshot(db, area), [db, area]);

  const toggleFavorite = useCallback(
    async (metric: MetricKey, projection: ProjectionKey) => {
      const id = encodeFavorite({ area, metric, projection });
      const isFavorite = favorites.includes(id);
      let nextFavorites: string[];
      if (isFavorite) {
        nextFavorites = favorites.filter(fav => fav !== id);
      } else {
        if (favorites.length >= 4) {
          window.alert("Можно закрепить не более 4 показателей для дашборда.");
          return;
        }
        nextFavorites = [...favorites, id];
      }
      const next = { ...db, settings: { ...db.settings, analyticsFavorites: nextFavorites } };
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert(
          "Не удалось обновить избранные показатели. Изменение сохранено локально, проверьте доступ к базе данных.",
        );
        setDB(next);
      }
    },
    [area, db, favorites, setDB],
  );

  const format = useCallback(
    (metric: MetricKey, projection: ProjectionKey) => {
      const entry = snapshot.metrics[metric];
      if (!entry) {
        return "—";
      }
      return formatMetricValue(entry.values[projection], entry.unit, currency);
    },
    [currency, snapshot.metrics],
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
          onChange={event => setArea(event.target.value as AreaScope)}
        >
          {areas.map(option => (
            <option key={option} value={option}>
              {option === "all" ? "Все районы" : option}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Добавьте до четырёх показателей в избранное, чтобы видеть их на дашборде.
        </span>
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
              {METRIC_ORDER.map(metric => {
                const metricData = snapshot.metrics[metric];
                return (
                  <tr key={metric} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/60">
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                      {METRIC_LABELS[metric]}
                    </th>
                    {PROJECTION_ORDER.map(projection => {
                      const id = encodeFavorite({ area, metric, projection });
                      const starred = favorites.includes(id);
                      return (
                        <td key={projection} className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-pressed={starred}
                              aria-label={starred ? "Убрать из избранного" : "Добавить в избранное"}
                              onClick={() => toggleFavorite(metric, projection)}
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

      <div className="flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
        <span>
          Вместимость выбранного направления: <strong>{snapshot.capacity || "—"}</strong>
        </span>
        <span>
          Аренда (EUR): <strong>{snapshot.rent.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}</strong>
        </span>
      </div>
    </div>
  );
}
