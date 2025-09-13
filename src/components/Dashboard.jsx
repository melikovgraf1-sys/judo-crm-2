// @flow
import React from "react";
import Breadcrumbs from "./Breadcrumbs";
import { fmtMoney, fmtDate } from "../App";

function OfflineTip() {
  return (
    <div className="m-3 p-3 rounded-xl bg-blue-50 border border-blue-200 text-slate-700">
      <div className="font-medium mb-1">Как сохранить и работать офлайн</div>
      <ul className="list-disc pl-5 text-sm space-y-1">
        <li>В браузере откройте эту страницу, оставьте её открытой один раз (кешируется автоматически).</li>
        <li>Добавить на главный экран: в мобильном браузере «Поделиться» → «На экран домой».</li>
        <li>Отметки посещаемости и данные сохраняются локально. Позже можно синхронизировать (функция будет добавлена).</li>
      </ul>
    </div>
  );
}

function MetricCard({ title, value, accent }) {
  const cls = accent === "green" ? "bg-emerald-50 border-emerald-200" : accent === "sky" ? "bg-sky-50 border-sky-200" : "bg-slate-50 border-slate-200";
  return (
    <div className={`p-4 rounded-2xl border ${cls} min-w-[180px]`}>
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-xl font-semibold text-slate-800 mt-1">{value}</div>
    </div>
  );
}

export default function Dashboard({ db, ui }) {
  const currency = ui.currency;
  const totalClients = db.clients.length;
  const activeClients = db.clients.filter(c => c.payStatus === "действует").length;
  const leadsCount = db.leads.length;

  const revenueEUR = activeClients * 55;
  const rate = cur => (cur === "EUR" ? 1 : cur === "TRY" ? db.settings.currencyRates.TRY : db.settings.currencyRates.RUB);
  const revenue = revenueEUR * rate(currency);

  const totalLimit = Object.values(db.settings.limits).reduce((a, b) => a + b, 0);
  const fillPct = totalLimit ? Math.round((activeClients / totalLimit) * 100) : 0;

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Дашборд"]} />
      <OfflineTip />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title="Ученики всего" value={String(totalClients)} accent="sky" />
        <MetricCard title="Активные (действует)" value={String(activeClients)} accent="green" />
        <MetricCard title="Выручка (прибл.)" value={fmtMoney(revenue, currency)} accent="sky" />
        <MetricCard title="Заполняемость" value={`${fillPct}%`} accent={fillPct >= 80 ? "green" : "slate"} />
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl border border-slate-200 bg-white">
          <div className="font-semibold mb-2">Лиды по этапам</div>
          <div className="flex flex-wrap gap-2">
            {["Очередь", "Задержка", "Пробное", "Ожидание оплаты", "Оплаченный абонемент", "Отмена"].map(s => (
              <div key={s} className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div className="text-slate-500">{s}</div>
                <div className="text-lg font-semibold text-slate-800">{db.leads.filter(l => l.stage === s).length}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 rounded-2xl border border-slate-200 bg-white">
          <div className="font-semibold mb-2">Предстоящие задачи</div>
          <ul className="space-y-2">
            {db.tasks
              .slice()
              .sort((a, b) => +new Date(a.due) - +new Date(b.due))
              .slice(0, 6)
              .map(t => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{t.title}</span>
                  <span className="text-slate-500">{fmtDate(t.due)}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
