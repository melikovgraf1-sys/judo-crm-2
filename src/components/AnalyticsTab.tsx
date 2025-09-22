import React, { useMemo } from "react";
import Breadcrumbs from "./Breadcrumbs";
import type { Currency, DB } from "../types";
import { fmtMoney } from "../state/utils";

type Props = {
  db: DB;
  currency: Currency;
};

export default function AnalyticsTab({ db, currency }: Props) {
  const totalClients = db.clients.length;
  const activeClients = useMemo(
    () => db.clients.filter(client => client.payStatus === "действует").length,
    [db.clients],
  );
  const debtors = useMemo(
    () => db.clients.filter(client => client.payStatus === "задолженность").length,
    [db.clients],
  );
  const expectedRevenue = useMemo(
    () => db.clients.reduce((sum, client) => sum + (client.payAmount ?? 0), 0),
    [db.clients],
  );

  const attendanceRate = useMemo(() => {
    if (!db.attendance.length) return 0;
    const came = db.attendance.filter(entry => entry.came).length;
    return Math.round((came / db.attendance.length) * 100);
  }, [db.attendance]);

  const clientsByArea = useMemo(() => {
    const map = new Map<string, number>();
    for (const client of db.clients) {
      map.set(client.area, (map.get(client.area) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [db.clients]);

  const statusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const client of db.clients) {
      map.set(client.status, (map.get(client.status) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [db.clients]);

  const tasksByStatus = useMemo(() => {
    const open = db.tasks.filter(task => task.status === "open").length;
    const done = db.tasks.filter(task => task.status === "done").length;
    const archived = db.tasksArchive.length;
    return { open, done, archived };
  }, [db.tasks, db.tasksArchive]);

  return (
    <div className="space-y-4">
      <Breadcrumbs items={["Аналитика"]} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Клиенты всего</h3>
          <p className="mt-2 text-2xl font-semibold text-slate-800 dark:text-slate-100">{totalClients}</p>
        </article>
        <article className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30">
          <h3 className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Активные</h3>
          <p className="mt-2 text-2xl font-semibold text-emerald-700 dark:text-emerald-200">{activeClients}</p>
        </article>
        <article className="p-4 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30">
          <h3 className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">Задолженность</h3>
          <p className="mt-2 text-2xl font-semibold text-amber-700 dark:text-amber-200">{debtors}</p>
        </article>
        <article className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Ожидаемая выручка</h3>
          <p className="mt-2 text-2xl font-semibold text-slate-800 dark:text-slate-100">{fmtMoney(expectedRevenue, currency)}</p>
        </article>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <header className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Клиенты по районам</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{clientsByArea.length} районов</span>
          </header>
          <ul className="space-y-2">
            {clientsByArea.map(([area, count]) => (
              <li key={area} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">{area}</span>
                <span className="text-slate-500 dark:text-slate-400">{count}</span>
              </li>
            ))}
            {!clientsByArea.length && (
              <li className="text-sm text-slate-500 dark:text-slate-400">Нет данных о клиентах.</li>
            )}
          </ul>
        </article>
        <article className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <header className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Статусы клиентов</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{statusBreakdown.length} статусов</span>
          </header>
          <ul className="space-y-2">
            {statusBreakdown.map(([status, count]) => (
              <li key={status} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">{status}</span>
                <span className="text-slate-500 dark:text-slate-400">{count}</span>
              </li>
            ))}
            {!statusBreakdown.length && (
              <li className="text-sm text-slate-500 dark:text-slate-400">Нет данных о клиентах.</li>
            )}
          </ul>
        </article>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Посещаемость</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Общее количество отметок: <strong>{db.attendance.length}</strong>
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Средний процент посещаемости: <strong>{attendanceRate}%</strong>
          </p>
        </article>
        <article className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Задачи</h3>
          <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            <li>
              Открытые: <strong>{tasksByStatus.open}</strong>
            </li>
            <li>
              Выполненные: <strong>{tasksByStatus.done}</strong>
            </li>
            <li>
              В архиве: <strong>{tasksByStatus.archived}</strong>
            </li>
          </ul>
        </article>
      </section>
    </div>
  );
}
