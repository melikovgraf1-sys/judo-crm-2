import React, { useState, useEffect, useRef } from "react";
import Breadcrumbs from "./Breadcrumbs";
import { commitDBUpdate } from "../state/appState";
import type { DB } from "../types";

export default function SettingsTab({
  db,
  setDB,
}: {
  db: DB;
  setDB: React.Dispatch<React.SetStateAction<DB>>;
}) {
  const eurTryRate = db.settings.currencyRates.TRY;
  const eurRubRate = db.settings.currencyRates.RUB;
  const tryRubRateFromDB = eurTryRate ? eurRubRate / eurTryRate : 0;

  const [rates, setRates] = useState({
    eurTry: eurTryRate,
    eurRub: eurRubRate,
    tryRub: tryRubRateFromDB,
  });

  const fetchInProgressRef = useRef(false);
  const lastSavedRatesRef = useRef({ eurTry: eurTryRate, eurRub: eurRubRate });
  const latestDBRef = useRef(db);

  useEffect(() => {
    latestDBRef.current = db;
  }, [db]);

  useEffect(() => {
    lastSavedRatesRef.current = { eurTry: eurTryRate, eurRub: eurRubRate };
  }, [eurTryRate, eurRubRate]);

  useEffect(() => {
    setRates(prev => {
      if (
        prev.eurTry === eurTryRate &&
        prev.eurRub === eurRubRate &&
        prev.tryRub === tryRubRateFromDB
      ) {
        return prev;
      }
      return { eurTry: eurTryRate, eurRub: eurRubRate, tryRub: tryRubRateFromDB };
    });
  }, [eurTryRate, eurRubRate, tryRubRateFromDB]);

  useEffect(() => {
    const RATE_API_URL = "https://api.exchangerate.host/latest?base=EUR&symbols=TRY,RUB";

    const parseRate = (value: unknown): number | undefined => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string") {
        const normalized = value.replace(/\s+/g, "").replace(",", ".");
        const parsed = Number(normalized);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
      return undefined;
    };

    const computeTryRub = (eurTry?: number, eurRub?: number): number | undefined => {
      if (eurTry == null || eurRub == null || eurTry === 0) {
        return undefined;
      }
      const derived = eurRub / eurTry;
      return Number.isFinite(derived) ? derived : undefined;
    };

    async function fetchRates() {
      if (fetchInProgressRef.current) {
        return;
      }

      fetchInProgressRef.current = true;
      try {
        const response = await fetch(RATE_API_URL);
        if (!response.ok) {
          throw new Error(`Failed to fetch currency rates: ${response.status}`);
        }

        const data: unknown = await response.json();
        const ratesData = (() => {
          if (!data || typeof data !== "object" || !("rates" in data)) {
            return {} as Record<string, unknown>;
          }
          const maybeRates = (data as { rates?: unknown }).rates;
          if (!maybeRates || typeof maybeRates !== "object") {
            return {} as Record<string, unknown>;
          }
          return maybeRates as Record<string, unknown>;
        })();

        const eurTryFromAPI = parseRate(ratesData["TRY"]);
        const eurRubFromAPI = parseRate(ratesData["RUB"]);

        const nextEurTry = eurTryFromAPI ?? eurTryRate;
        const nextEurRub = eurRubFromAPI ?? eurRubRate;
        const nextTryRub =
          computeTryRub(eurTryFromAPI, eurRubFromAPI) ?? computeTryRub(nextEurTry, nextEurRub) ?? tryRubRateFromDB;

        const nextRates = {
          eurTry: nextEurTry,
          eurRub: nextEurRub,
          tryRub: nextTryRub,
        };

        setRates(prevRates => {
          if (
            nextRates.eurTry === prevRates.eurTry &&
            nextRates.eurRub === prevRates.eurRub &&
            nextRates.tryRub === prevRates.tryRub
          ) {
            return prevRates;
          }
          return nextRates;
        });

        const hasChanged = eurTryRate !== nextRates.eurTry || eurRubRate !== nextRates.eurRub;
        const matchesLastSaved =
          lastSavedRatesRef.current.eurTry === nextRates.eurTry &&
          lastSavedRatesRef.current.eurRub === nextRates.eurRub;

        if (hasChanged && !matchesLastSaved) {
          const currentDB = latestDBRef.current;
          const updated = {
            ...currentDB,
            settings: {
              ...currentDB.settings,
              currencyRates: { EUR: 1, TRY: nextRates.eurTry, RUB: nextRates.eurRub },
            },
          };
          const ok = await commitDBUpdate(updated, setDB);
          if (!ok) {
            console.error("Failed to update currency rates in Firestore");
          } else {
            lastSavedRatesRef.current = { eurTry: nextRates.eurTry, eurRub: nextRates.eurRub };
          }
        }
      } catch (e) {
        console.error("Failed to refresh currency rates", e);
        setRates(prevRates => ({
          eurTry: prevRates.eurTry ?? eurTryRate,
          eurRub: prevRates.eurRub ?? eurRubRate,
          tryRub: prevRates.tryRub ?? tryRubRateFromDB,
        }));
      } finally {
        fetchInProgressRef.current = false;
      }
    }

    fetchRates();
  }, [eurTryRate, eurRubRate, tryRubRateFromDB, setDB]);

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Настройки"]} />
      <div className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 space-y-3">
        <div className="font-semibold">Курсы валют</div>
        <div className="grid sm:grid-cols-3 gap-2">
          <label className="text-sm">EUR → TRY
            <input
              type="number"
              readOnly
              className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
              value={rates.eurTry ? rates.eurTry.toFixed(2) : ""}
            />
          </label>
          <label className="text-sm">EUR → RUB
            <input
              type="number"
              readOnly
              className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
              value={rates.eurRub ? rates.eurRub.toFixed(2) : ""}
            />
          </label>
          <label className="text-sm">TRY → RUB
            <input
              type="number"
              readOnly
              className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
              value={rates.tryRub ? rates.tryRub.toFixed(2) : ""}
            />
          </label>
        </div>
      </div>

      <div className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 space-y-3">
        <div className="font-semibold">Лимиты мест</div>
        <div className="grid md:grid-cols-3 gap-4">
          {db.settings.areas.map(area => (
            <div key={area} className="space-y-2">
              <div className="font-medium">{area}</div>
              {db.settings.groups.map(group => {
                const key = `${area}|${group}`;
                return (
                  <div key={key} className="text-sm flex items-center justify-between gap-2 border border-slate-200 rounded-xl p-2 dark:border-slate-700 dark:bg-slate-800">
                    <div className="truncate">{group}</div>
                    <input
                      type="number"
                      min={0}
                      className="w-24 px-2 py-1 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                      value={db.settings.limits[key] ?? 0}
                      onChange={async e => {
                        const next = { ...db, settings: { ...db.settings, limits: { ...db.settings.limits, [key]: Number(e.target.value) } } };
                        const ok = await commitDBUpdate(next, setDB);
                        if (!ok) {
                          window.alert("Не удалось сохранить лимит. Проверьте доступ к базе данных.");
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
