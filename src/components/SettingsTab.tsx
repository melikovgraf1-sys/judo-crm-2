import React, { useState, useEffect, useRef, useMemo } from "react";
import Breadcrumbs from "./Breadcrumbs";
import { commitDBUpdate } from "../state/appState";
import type { DB } from "../types";
import { downloadClientCsvTemplate } from "./clients/clientCsv";

const formatRate = (value?: number) => (value != null ? value.toFixed(2) : "");
const parseRateInputValue = (raw: string): number | undefined => {
  const normalized = raw.trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

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

  const [inputs, setInputs] = useState({
    eurTry: formatRate(eurTryRate),
    eurRub: formatRate(eurRubRate),
  });

  const fetchInProgressRef = useRef(false);
  const lastSavedRatesRef = useRef({ eurTry: eurTryRate, eurRub: eurRubRate });
  const latestDBRef = useRef(db);

  useEffect(() => {
    latestDBRef.current = db;
  }, [db]);

  const areasWithSchedule = useMemo(() => {
    const scheduledAreas = new Set(db.schedule.map(slot => slot.area));
    const ordered: string[] = [];

    for (const area of db.settings.areas) {
      if (scheduledAreas.has(area)) {
        ordered.push(area);
        scheduledAreas.delete(area);
      }
    }

    for (const slot of db.schedule) {
      if (scheduledAreas.has(slot.area)) {
        ordered.push(slot.area);
        scheduledAreas.delete(slot.area);
      }
    }

    return ordered;
  }, [db.schedule, db.settings.areas]);

  const groupsByArea = useMemo(() => {
    const map = new Map<string, string[]>();
    const seenGroups = new Map<string, Set<string>>();

    for (const slot of db.schedule) {
      const area = slot.area;
      const group = slot.group;

      if (!map.has(area)) {
        map.set(area, []);
        seenGroups.set(area, new Set());
      }

      const areaSeen = seenGroups.get(area)!;
      if (!areaSeen.has(group)) {
        areaSeen.add(group);
        map.get(area)!.push(group);
      }
    }

    for (const area of areasWithSchedule) {
      if (!map.has(area)) {
        map.set(area, []);
      }
    }

    return map;
  }, [areasWithSchedule, db.schedule]);

  useEffect(() => {
    lastSavedRatesRef.current = { eurTry: eurTryRate, eurRub: eurRubRate };
  }, [eurTryRate, eurRubRate]);

  const formattedEurTry = formatRate(eurTryRate);
  const formattedEurRub = formatRate(eurRubRate);
  const parsedEurTry = parseRateInputValue(inputs.eurTry);
  const parsedEurRub = parseRateInputValue(inputs.eurRub);
  const isDirty = inputs.eurTry !== formattedEurTry || inputs.eurRub !== formattedEurRub;
  const canSave =
    isDirty &&
    parsedEurTry != null &&
    parsedEurRub != null &&
    parsedEurTry > 0 &&
    parsedEurRub > 0;
  const derivedTryRub = (() => {
    if (parsedEurTry != null && parsedEurRub != null && parsedEurTry > 0) {
      const value = parsedEurRub / parsedEurTry;
      return Number.isFinite(value) ? value : undefined;
    }
    return tryRubRateFromDB || undefined;
  })();

  useEffect(() => {
    if (isDirty) {
      return;
    }
    setInputs(prev => {
      if (prev.eurTry === formattedEurTry && prev.eurRub === formattedEurRub) {
        return prev;
      }
      return { eurTry: formattedEurTry, eurRub: formattedEurRub };
    });
  }, [formattedEurTry, formattedEurRub, isDirty]);

  const saveRates = async () => {
    if (!canSave) {
      return;
    }

    const nextEurTry = parsedEurTry!;
    const nextEurRub = parsedEurRub!;

    const updated = {
      ...db,
      settings: {
        ...db.settings,
        currencyRates: { EUR: 1, TRY: nextEurTry, RUB: nextEurRub },
      },
    };

    const ok = await commitDBUpdate(updated, setDB);
    if (!ok) {
      window.alert("Не удалось сохранить курсы валют. Проверьте доступ к базе данных.");
      return;
    }

    lastSavedRatesRef.current = { eurTry: nextEurTry, eurRub: nextEurRub };
  };

  useEffect(() => {
    if (isDirty) {
      return;
    }

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

        setInputs(prevInputs => {
          const nextInputs = {
            eurTry: formatRate(nextEurTry),
            eurRub: formatRate(nextEurRub),
          };
          if (
            prevInputs.eurTry === nextInputs.eurTry &&
            prevInputs.eurRub === nextInputs.eurRub
          ) {
            return prevInputs;
          }
          return nextInputs;
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
        setInputs({ eurTry: formattedEurTry, eurRub: formattedEurRub });
      } finally {
        fetchInProgressRef.current = false;
      }
    }

    fetchRates();
  }, [eurTryRate, eurRubRate, tryRubRateFromDB, setDB, isDirty, formattedEurTry, formattedEurRub]);

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Настройки"]} />
      <div className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 space-y-3">
        <div className="font-semibold">Импорт клиентов</div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Скачайте шаблон CSV, заполните его данными и загрузите файл в разделе «Клиенты», чтобы добавить несколько учеников
          за один раз. Строки, начинающиеся с символа «#», игнорируются при импорте.
        </p>
        <div>
          <button
            type="button"
            onClick={() => downloadClientCsvTemplate()}
            className="rounded-md border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-slate-800"
          >
            Скачать шаблон CSV
          </button>
        </div>
      </div>
      <div className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 space-y-3">
        <div className="font-semibold">Курсы валют</div>
        <div className="grid sm:grid-cols-3 gap-2">
          <label className="text-sm">EUR → TRY
            <input
              type="text"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={inputs.eurTry}
              onChange={event => setInputs(prev => ({ ...prev, eurTry: event.target.value }))}
            />
          </label>
          <label className="text-sm">EUR → RUB
            <input
              type="text"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={inputs.eurRub}
              onChange={event => setInputs(prev => ({ ...prev, eurRub: event.target.value }))}
            />
          </label>
          <label className="text-sm">TRY → RUB
            <input
              type="text"
              readOnly
              className="mt-1 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              value={derivedTryRub != null ? derivedTryRub.toFixed(2) : ""}
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!canSave}
            onClick={saveRates}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Сохранить курсы
          </button>
        </div>
      </div>

      <div className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 space-y-3">
        <div className="font-semibold">Лимиты мест</div>
        <div className="grid md:grid-cols-3 gap-4">
          {areasWithSchedule.map(area => {
            const groups = groupsByArea.get(area) ?? [];
            return (
              <div key={area} className="space-y-2">
                <div className="font-medium">{area}</div>
                {groups.length ? (
                  groups.map(group => {
                    const key = `${area}|${group}`;
                    return (
                      <div
                        key={key}
                        className="text-sm flex items-center justify-between gap-2 border border-slate-200 rounded-xl p-2 dark:border-slate-700 dark:bg-slate-800"
                      >
                        <div className="truncate">{group}</div>
                        <input
                          type="number"
                          min={0}
                          className="w-24 px-2 py-1 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                          value={db.settings.limits[key] ?? 0}
                          onChange={async e => {
                            const next = {
                              ...db,
                              settings: {
                                ...db.settings,
                                limits: { ...db.settings.limits, [key]: Number(e.target.value) },
                              },
                            };
                            const ok = await commitDBUpdate(next, setDB);
                            if (!ok) {
                              window.alert("Не удалось сохранить лимит. Проверьте доступ к базе данных.");
                            }
                          }}
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-slate-500">Нет групп в расписании.</div>
                )}
              </div>
            );
          })}
          {areasWithSchedule.length === 0 && (
            <div className="text-sm text-slate-500 col-span-full">Добавьте тренировки в расписании, чтобы указать лимиты.</div>
          )}
        </div>
      </div>
    </div>
  );
}
