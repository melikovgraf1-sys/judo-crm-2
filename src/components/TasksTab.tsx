import React, { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import Modal from "./Modal";
import ClientDetailsModal from "./clients/ClientDetailsModal";
import { fmtDate, uid, todayISO } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import { applyPaymentStatusRules } from "../state/payments";
import { buildGroupsByArea } from "../state/lessons";
import { readDailySelection, writeDailySelection, clearDailySelection } from "../state/filterPersistence";
import type { Area, Client, Currency, DB, Group, TaskItem } from "../types";

export function resolveClientsAfterTaskCompletion(
  clients: Client[],
  completed: TaskItem,
): Partial<Record<string, Partial<Client>>> {
  if (completed.topic !== "оплата" || completed.assigneeType !== "client" || !completed.assigneeId) {
    return {};
  }

  const client = clients.find(c => c.id === completed.assigneeId);
  if (!client) {
    return {};
  }

  const payActual = client.payAmount ?? client.payActual;

  return {
    [client.id]: {
      payStatus: "действует",
      payActual: payActual ?? undefined,
    },
  };
}

export default function TasksTab({
  db,
  setDB,
  currency,
}: {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  currency: Currency;
}) {
  const storedFilters = useMemo(() => readDailySelection("tasks"), []);
  const [area, setArea] = useState<Area | null>(storedFilters.area);
  const [group, setGroup] = useState<Group | null>(storedFilters.group);
  const [edit, setEdit] = useState<TaskItem | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [viewClientId, setViewClientId] = useState<string | null>(null);

  const schedule = db.schedule ?? [];
  const groupsByArea = useMemo(() => buildGroupsByArea(schedule), [schedule]);
  const areaOptions = useMemo(() => Array.from(groupsByArea.keys()), [groupsByArea]);
  const availableGroups = useMemo(() => {
    if (!area) return [];
    return groupsByArea.get(area) ?? [];
  }, [area, groupsByArea]);

  useEffect(() => {
    if (!area && group !== null) {
      setGroup(null);
      return;
    }
    if (area && group && !availableGroups.includes(group)) {
      setGroup(null);
    }
  }, [area, availableGroups, group]);

  useEffect(() => {
    if (area || group) {
      writeDailySelection("tasks", area ?? null, group ?? null);
    } else {
      clearDailySelection("tasks");
    }
  }, [area, group]);

  const matchesFilter = (task: TaskItem) => {
    if (area && task.area !== area) return false;
    if (group && task.group !== group) return false;
    return true;
  };

  const activeTasks = useMemo(() => db.tasks.filter(task => task.status !== "done"), [db.tasks]);
  const visibleActiveTasks = useMemo(() => activeTasks.filter(matchesFilter), [activeTasks, area, group]);
  const filteredArchive = useMemo(() => db.tasksArchive.filter(matchesFilter), [db.tasksArchive, area, group]);
  const sortedArchive = useMemo(
    () =>
      filteredArchive
        .slice()
        .sort((a, b) => +new Date(b.due) - +new Date(a.due)),
    [filteredArchive],
  );
  const archiveCount = sortedArchive.length;
  const recalcClients = (
    tasks: TaskItem[],
    archive: TaskItem[],
    updates: Partial<Record<string, Partial<Client>>> = {},
  ) => applyPaymentStatusRules(db.clients, tasks, archive, updates);

  const complete = async (id: string) => {
    const task = db.tasks.find(t => t.id === id);
    if (!task) return;

    const completed: TaskItem = { ...task, status: "done" };
    const nextTasks = db.tasks.filter(t => t.id !== id);
    const nextArchive = [completed, ...db.tasksArchive];
    const clientUpdates = resolveClientsAfterTaskCompletion(db.clients, completed);
    const next: DB = {
      ...db,
      tasks: nextTasks,
      tasksArchive: nextArchive,
      clients: recalcClients(nextTasks, nextArchive, clientUpdates),
    };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok) {
      if (result.reason === "error") {
        window.alert("Не удалось обновить задачу. Изменение сохранено локально, проверьте доступ к базе данных.");
      }
      return;
    }
  };
  const save = async () => {
    if (!edit) return;
    const nextTasks = db.tasks.map<TaskItem>(t => (t.id === edit.id ? edit : t));
    const next: DB = {
      ...db,
      tasks: nextTasks,
      tasksArchive: db.tasksArchive,
      clients: recalcClients(nextTasks, db.tasksArchive),
    };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok) {
      if (result.reason === "error") {
        window.alert("Не удалось сохранить задачу. Изменение сохранено локально, проверьте доступ к базе данных.");
      }
      return;
    }
    setEdit(null);
  };
  const add = async () => {
    const t: TaskItem = { id: uid(), title: "Новая задача", due: todayISO(), status: "open" };
    const nextTasks = [t, ...db.tasks];
    const next: DB = {
      ...db,
      tasks: nextTasks,
      tasksArchive: db.tasksArchive,
      clients: recalcClients(nextTasks, db.tasksArchive),
    };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok && result.reason === "error") {
      window.alert("Не удалось добавить задачу. Изменение сохранено локально, проверьте доступ к базе данных.");
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Удалить задачу?")) return;
    const archived = db.tasks.find(t => t.id === id);
    const nextArchive = archived ? [archived, ...db.tasksArchive] : db.tasksArchive;
    const nextTasks = db.tasks.filter(t => t.id !== id);
    const next: DB = {
      ...db,
      tasks: nextTasks,
      tasksArchive: nextArchive,
      clients: recalcClients(nextTasks, nextArchive),
    };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok && result.reason === "error") {
      window.alert("Не удалось удалить задачу. Изменение сохранено локально, проверьте доступ к базе данных.");
    }
  };

  const restore = async (id: string) => {
    const archived = db.tasksArchive.find(t => t.id === id);
    if (!archived) return;
    const restored = { ...archived, status: "open" as const };
    const nextArchive = db.tasksArchive.filter(t => t.id !== id);
    const nextTasks = [restored, ...db.tasks];
    const next: DB = {
      ...db,
      tasks: nextTasks,
      tasksArchive: nextArchive,
      clients: recalcClients(nextTasks, nextArchive),
    };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok && result.reason === "error") {
      window.alert("Не удалось восстановить задачу. Изменение сохранено локально, проверьте доступ к базе данных.");
    }
  };

  const openTask = (task: TaskItem) => {
    setEdit({ ...task });
  };

  const clientToView = viewClientId ? db.clients.find(client => client.id === viewClientId) ?? null : null;
  const attendance = db.attendance ?? [];
  const performance = db.performance ?? [];

  return (
    <>
      <div className="space-y-3">
        <Breadcrumbs items={["Задачи"]} />
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
            value={area ?? ""}
            onChange={event => setArea(event.target.value ? (event.target.value as Area) : null)}
          >
            <option value="">Выберите район</option>
            {areaOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
            value={group ?? ""}
            onChange={event => setGroup(event.target.value ? (event.target.value as Group) : null)}
            disabled={!area}
          >
            <option value="">Выберите группу</option>
            {availableGroups.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <button onClick={add} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700">+ Задача</button>
        <ul className="space-y-2">
          {visibleActiveTasks.map(t => (
            <li
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => openTask(t)}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openTask(t);
                }
              }}
              className="p-3 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 flex items-center justify-between gap-2 cursor-pointer transition hover:border-sky-200 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:hover:border-sky-400/60 dark:hover:bg-slate-800/60"
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  onClick={event => event.stopPropagation()}
                  onChange={() => complete(t.id)}
                />
                <span
                  className={`text-sm ${
                    t.status === "done" ? "line-through text-slate-500" : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {t.title}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">{fmtDate(t.due)}</span>
                <button
                  onClick={event => {
                    event.stopPropagation();
                    openTask(t);
                  }}
                  className="px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800"
                >
                  ✎
                </button>
                <button
                  onClick={event => {
                    event.stopPropagation();
                    remove(t.id);
                  }}
                  className="px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
          <button
            type="button"
            onClick={() => setShowArchive(v => !v)}
            className="flex items-center justify-between w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700"
          >
            <span>Архив задач</span>
            <span className="text-xs text-slate-500">{archiveCount}</span>
          </button>
          {showArchive && (
            <ul className="space-y-2">
              {sortedArchive.length ? (
                sortedArchive.map(task => (
                  <li
                    key={task.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40 text-sm flex flex-col gap-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{task.title}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(task.due)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>{task.topic ?? ""}</span>
                      <button
                        type="button"
                        onClick={() => restore(task.id)}
                        className="px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                      >
                        Вернуть
                      </button>
                    </div>
                  </li>
                ))
              ) : (
                <li className="text-sm text-slate-500 dark:text-slate-400 px-3">Архив пуст</li>
              )}
            </ul>
          )}
        </div>
        {edit && (
          <Modal size="md" onClose={() => setEdit(null)}>
            <div className="font-semibold text-slate-800">Редактирование задачи</div>
            <input
              className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              value={edit.title}
              onChange={e => setEdit({ ...edit, title: e.target.value })}
            />
            <input
              type="date"
              className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              value={edit.due.slice(0, 10)}
              onChange={e => setEdit({ ...edit, due: e.target.value })}
            />
            {edit.assigneeType === "client" ? (
              (() => {
                const client = db.clients.find(c => c.id === edit.assigneeId);
                if (!client) {
                  return <div className="text-xs text-slate-500">Клиент не найден</div>;
                }
                return (
                  <button
                    type="button"
                    onClick={() => setViewClientId(client.id)}
                    className="w-full rounded-md border border-sky-500 px-3 py-2 text-sm font-medium text-sky-600 transition hover:bg-sky-50 dark:border-sky-400 dark:text-sky-300 dark:hover:bg-slate-800"
                  >
                    Открыть карточку клиента
                  </button>
                );
              })()
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEdit(null)}
                className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800"
              >
                Отмена
              </button>
              <button onClick={save} className="px-3 py-2 rounded-md bg-sky-600 text-white">
                Сохранить
              </button>
            </div>
          </Modal>
        )}
      </div>
      {clientToView && (
        <ClientDetailsModal
          client={clientToView}
          currency={currency}
          currencyRates={db.settings.currencyRates}
          schedule={schedule}
          attendance={attendance}
          performance={performance}
          onClose={() => setViewClientId(null)}
        />
      )}
    </>
  );
}
