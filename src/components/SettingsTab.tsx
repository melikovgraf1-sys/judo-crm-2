import React, { useState, useEffect } from "react";
import Breadcrumbs from "./Breadcrumbs";
import { saveDB } from "../state/appState";
import type { DB } from "../types";

export default function SettingsTab({ db, setDB }: { db: DB; setDB: (db: DB) => void }) {
  const [rates, setRates] = useState({
    eurTry: db.settings.currencyRates.TRY,
    eurRub: db.settings.currencyRates.RUB,
    tryRub: db.settings.currencyRates.RUB / db.settings.currencyRates.TRY,
  });

  useEffect(() => {
    async function fetchRates() {
      try {
        const fetchRate = async (pair: string) => {
          const res = await fetch(`https://cors.isomorphic-git.org/https://www.google.com/finance/quote/${pair}?hl=en`);
          const html = await res.text();
          const m = html.match(/class="YMlKec fxKbKc">([0-9.,]+)/);
          return m ? Number(m[1].replace(',', '')) : undefined;
        };
        const [eurTry, eurRub, tryRub] = await Promise.all([
          fetchRate('EUR-TRY'),
          fetchRate('EUR-RUB'),
          fetchRate('TRY-RUB'),
        ]);
        const nextRates = {
          eurTry: eurTry ?? rates.eurTry,
          eurRub: eurRub ?? rates.eurRub,
          tryRub: tryRub ?? rates.tryRub,
        };
        setRates(nextRates);
        const nextDB = {
          ...db,
          settings: {
            ...db.settings,
            currencyRates: { EUR: 1, TRY: nextRates.eurTry, RUB: nextRates.eurRub },
          },
        };
        setDB(nextDB);
        await saveDB(nextDB);
      } catch (e) {
        console.error(e);
      }
    }
    fetchRates();
  }, []);

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
          {["Центр", "Джикджилли", "Махмутлар"].map(area => (
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
                      value={db.settings.limits[key]}
                      onChange={async e => {
                        const next = { ...db, settings: { ...db.settings, limits: { ...db.settings.limits, [key]: Number(e.target.value) } } };
                        setDB(next); await saveDB(next);
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
