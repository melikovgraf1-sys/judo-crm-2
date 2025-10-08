import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import Modal from "./Modal";
import ClientDetailsModal from "./clients/ClientDetailsModal";
import { fmtDate, uid, todayISO } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import { applyPaymentStatusRules } from "../state/payments";
import { buildGroupsByArea } from "../state/lessons";
import { readDailySelection, writeDailySelection, clearDailySelection } from "../state/filterPersistence";
import type { Area, Client, Currency, DB, Group, ScheduleSlot, TaskItem } from "../types";
import { resolvePaymentCompletion } from "../state/paymentCompletion";

type TaskSection = { key: string; label: string | null; tasks: TaskItem[] };
type AreaGroupEntry = { label: Area; groups: Map<string, Group> };
const UNGROUPED_KEY = "__ungrouped__";

const canonicalize = (value?: string | null) => (value ?? "").trim();
const normalizeKey = (value?: string | null) => {
  const canonical = canonicalize(value);
  return canonical ? canonical.toLocaleLowerCase() : "";
};

function buildTaskSections(tasks: TaskItem[], availableGroups: Group[]): TaskSection[] {
  const buckets = new Map<string, TaskItem[]>();
  const labels = new Map<string, string>();
  const order: string[] = [];

  const normalizedAvailableLabels = new Map<string, string>();
  availableGroups.forEach(groupName => {
    const key = normalizeKey(groupName) || UNGROUPED_KEY;
    const label = canonicalize(groupName) || "Без группы";
    normalizedAvailableLabels.set(key, label);
  });

  tasks.forEach(task => {
    const normalizedGroup = normalizeKey(task.group);
    const key = normalizedGroup || UNGROUPED_KEY;
    const canonicalGroup = canonicalize(task.group);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      const label =
        normalizedAvailableLabels.get(key) ?? (canonicalGroup ? canonicalGroup : "Без группы");
      labels.set(key, label);
      order.push(key);
    }
    buckets.get(key)!.push(task);
  });

  const sections: TaskSection[] = [];

  availableGroups.forEach(groupName => {
    const canonicalGroup = canonicalize(groupName);
    const key = normalizeKey(groupName) || UNGROUPED_KEY;
    const tasksInBucket = buckets.get(key);
    if (!tasksInBucket) return;

    sections.push({ key, label: canonicalGroup || "Без группы", tasks: tasksInBucket });
    buckets.delete(key);
    labels.delete(key);

    const idx = order.indexOf(key);
    if (idx !== -1) {
      order.splice(idx, 1);
    }
  });

  order.forEach(key => {
    const tasksInBucket = buckets.get(key);
    if (!tasksInBucket) return;
    const label = labels.get(key) ?? (key === UNGROUPED_KEY ? "Без группы" : key);
    sections.push({ key, label, tasks: tasksInBucket });
  });

  return sections;
}

export function resolveClientsAfterTaskCompletion(
  clients: Client[],
  completed: TaskItem,
  options: {
    schedule?: ScheduleSlot[];
    completedAt?: string;
    manualLessonsIncrement?: number;
  } = {},
): Partial<Record<string, Partial<Client>>> {
  if (completed.topic !== "оплата" || completed.assigneeType !== "client" || !completed.assigneeId) {
    return {};
  }

  const client = clients.find(c => c.id === completed.assigneeId);
  if (!client) {
    return {};
  }

  const { schedule = [], completedAt = todayISO(), manualLessonsIncrement = 8 } = options;

  const updates = resolvePaymentCompletion({
    client,
    task: completed,
    schedule,
    completedAt,
    manualLessonsIncrement,
  });

  return {
    [client.id]: updates,
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

  const schedule = useMemo(() => db.schedule ?? [], [db.schedule]);
  const groupsByArea = useMemo(() => buildGroupsByArea(schedule), [schedule]);

  const { areaOptions, areaEntries, groupAreaMap } = useMemo(() => {
    const entries = new Map<string, AreaGroupEntry>();
    const groupArea = new Map<string, { areaKey: string; areaLabel: Area }[]>();
    const order: string[] = [];

    const ensureAreaEntry = (value?: string | null) => {
      const canonicalArea = canonicalize(value);
      if (!canonicalArea) return null;
      const areaKey = normalizeKey(value);
      let entry = entries.get(areaKey);
      if (!entry) {
        entry = { label: canonicalArea as Area, groups: new Map<string, Group>() };
        entries.set(areaKey, entry);
        order.push(areaKey);
      }
      return { key: areaKey, entry };
    };

    const recordGroup = (areaKey: string, areaLabel: Area, groupValue?: string | null) => {
      const canonicalGroup = canonicalize(groupValue);
      if (!canonicalGroup) return;
      const groupKey = normalizeKey(groupValue);
      const areaEntry = entries.get(areaKey);
      if (!areaEntry) return;
      if (!areaEntry.groups.has(groupKey)) {
        areaEntry.groups.set(groupKey, canonicalGroup as Group);
      }
      const bucket = groupArea.get(groupKey);
      if (bucket) {
        if (!bucket.some(item => item.areaKey === areaKey)) {
          bucket.push({ areaKey, areaLabel });
        }
      } else {
        groupArea.set(groupKey, [{ areaKey, areaLabel }]);
      }
    };

    groupsByArea.forEach((groups, areaName) => {
      const areaData = ensureAreaEntry(areaName);
      if (!areaData) return;
      const { key: areaKey, entry } = areaData;
      groups.forEach(groupValue => {
        recordGroup(areaKey, entry.label, groupValue);
      });
    });

    const recordTask = (task: TaskItem) => {
      const areaData = ensureAreaEntry(task.area);
      if (!areaData) return;
      const { key: areaKey, entry } = areaData;
      recordGroup(areaKey, entry.label, task.group);
    };

    db.tasks.forEach(recordTask);
    db.tasksArchive.forEach(recordTask);

    const options = order.map(areaKey => entries.get(areaKey)!.label);

    return { areaOptions: options, areaEntries: entries, groupAreaMap: groupArea };
  }, [groupsByArea, db.tasks, db.tasksArchive]);

  const availableGroups = useMemo(() => {
    if (!area) return [];
    const areaEntry = areaEntries.get(normalizeKey(area));
    if (!areaEntry) return [];
    return Array.from(areaEntry.groups.values());
  }, [area, areaEntries]);

  const normalizedAvailableGroups = useMemo(
    () => new Set(availableGroups.map(normalizeKey)),
    [availableGroups],
  );

  useEffect(() => {
    if (!area && group !== null) {
      setGroup(null);
      return;
    }
    if (area && group && !normalizedAvailableGroups.has(normalizeKey(group))) {
      setGroup(null);
    }
  }, [area, group, normalizedAvailableGroups]);

  useEffect(() => {
    if (area || group) {
      writeDailySelection("tasks", area ?? null, group ?? null);
    } else {
      clearDailySelection("tasks");
    }
  }, [area, group]);

  const normalizedArea = useMemo(() => normalizeKey(area), [area]);
  const normalizedGroup = useMemo(() => normalizeKey(group), [group]);

  const matchesFilter = useCallback(
    (task: TaskItem) => {
      const taskAreaKey = normalizeKey(task.area);
      const taskGroupKey = normalizeKey(task.group);

      if (normalizedArea) {
        if (taskAreaKey !== normalizedArea) {
          const areaGroups = areaEntries.get(normalizedArea)?.groups ?? null;
          if (!areaGroups || !taskGroupKey || !areaGroups.has(taskGroupKey)) {
            return false;
          }
        }
      }

      if (normalizedGroup && taskGroupKey !== normalizedGroup) {
        return false;
      }

      return true;
    },
    [normalizedArea, normalizedGroup, areaEntries],
  );

  const activeTasks = useMemo(() => db.tasks.filter(task => task.status !== "done"), [db.tasks]);
  const visibleActiveTasks = useMemo(() => activeTasks.filter(matchesFilter), [activeTasks, matchesFilter]);
  const filteredArchive = useMemo(() => db.tasksArchive.filter(matchesFilter), [db.tasksArchive, matchesFilter]);
  const sortedArchive = useMemo(
    () =>
      filteredArchive
        .slice()
        .sort((a, b) => +new Date(b.due) - +new Date(a.due)),
    [filteredArchive],
  );
  const archiveCount = sortedArchive.length;

  const groupedActiveTasks = useMemo(() => {
    if (area && !group) {
      return buildTaskSections(visibleActiveTasks, availableGroups);
    }

    return [{ key: "all", label: null, tasks: visibleActiveTasks }];
  }, [visibleActiveTasks, area, group, availableGroups]);

  const groupedArchiveTasks = useMemo(() => {
    if (area && !group) {
      return buildTaskSections(sortedArchive, availableGroups);
    }

    return [{ key: "all", label: null, tasks: sortedArchive }];
  }, [sortedArchive, area, group, availableGroups]);
  const recalcClients = (
    tasks: TaskItem[],
    archive: TaskItem[],
    updates: Partial<Record<string, Partial<Client>>> = {},
  ) => applyPaymentStatusRules(db.clients, tasks, archive, updates);

  const complete = async (id: string) => {
    const task = db.tasks.find(t => t.id === id);
    if (!task) return;

    const completedAt = todayISO();
    const completed: TaskItem = { ...task, status: "done" };
    const nextTasks = db.tasks.filter(t => t.id !== id);
    const nextArchive = [completed, ...db.tasksArchive];
    const clientUpdates = resolveClientsAfterTaskCompletion(db.clients, completed, {
      schedule,
      completedAt,
    });
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
    const t: TaskItem = {
      id: uid(),
      title: "Новая задача",
      due: todayISO(),
      status: "open",
      area: area ?? undefined,
      group: group ?? undefined,
    };
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
    const normalizedGroupKey = normalizeKey(task.group);
    const possibleAreas = normalizedGroupKey ? groupAreaMap.get(normalizedGroupKey) ?? [] : [];
    const inferredArea =
      task.area ?? (possibleAreas.length === 1 ? possibleAreas[0].areaLabel : undefined);
    setEdit({ ...task, area: inferredArea ?? task.area });
  };

  const groupOptionsForEdit = useMemo(() => {
    if (!edit) return [] as Group[];
    const areaKey = edit.area ? normalizeKey(edit.area) : "";
    if (areaKey) {
      const options = Array.from(areaEntries.get(areaKey)?.groups.values() ?? []);
      if (
        edit.group &&
        !options.some(option => normalizeKey(option) === normalizeKey(edit.group))
      ) {
        options.push(canonicalize(edit.group) as Group);
      }
      return options;
    }

    const unique = new Map<string, Group>();
    areaEntries.forEach(entry => {
      entry.groups.forEach((label, key) => {
        if (!unique.has(key)) {
          unique.set(key, label);
        }
      });
    });

    if (edit.group) {
      const key = normalizeKey(edit.group);
      if (!unique.has(key)) {
        unique.set(key, canonicalize(edit.group) as Group);
      }
    }

    return Array.from(unique.values());
  }, [edit, areaEntries]);

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
        <div className="space-y-4">
          {groupedActiveTasks.map(section => (
            <div key={section.key} className="space-y-2">
              {section.label ? (
                <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 border border-slate-200 rounded-md bg-slate-50 dark:text-slate-300 dark:border-slate-700 dark:bg-slate-800/60">
                  {section.label}
                </div>
              ) : null}
              <ul className="space-y-2">
                {section.tasks.map(t => (
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
            </div>
          ))}
        </div>
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
            <div className="space-y-4">
              {sortedArchive.length ? (
                groupedArchiveTasks.map(section => (
                  <div key={`archive-${section.key}`} className="space-y-2">
                    {section.label ? (
                      <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 border border-slate-200 rounded-md bg-slate-100 dark:text-slate-300 dark:border-slate-700 dark:bg-slate-900/60">
                        {section.label}
                      </div>
                    ) : null}
                    <ul className="space-y-2">
                      {section.tasks.map(task => (
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
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500 dark:text-slate-400 px-3">Архив пуст</div>
              )}
            </div>
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
            <select
              className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              value={edit.area ?? ""}
              onChange={event => {
                const nextArea = event.target.value ? (event.target.value as Area) : undefined;
                const areaKey = nextArea ? normalizeKey(nextArea) : "";
                const areaEntry = areaKey ? areaEntries.get(areaKey) ?? null : null;
                const hasGroup =
                  edit.group && areaEntry
                    ? areaEntry.groups.has(normalizeKey(edit.group))
                    : false;
                setEdit({
                  ...edit,
                  area: nextArea,
                  group: hasGroup ? edit.group : undefined,
                });
              }}
            >
              <option value="">Без района</option>
              {areaOptions.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              value={edit.group ?? ""}
              onChange={event => {
                const nextGroup = event.target.value ? (event.target.value as Group) : undefined;
                if (!nextGroup) {
                  setEdit({ ...edit, group: undefined });
                  return;
                }
                const owningAreas = groupAreaMap.get(normalizeKey(nextGroup)) ?? [];
                const currentAreaKey = edit.area ? normalizeKey(edit.area) : "";
                let nextAreaValue = edit.area;
                if (owningAreas.length === 1) {
                  nextAreaValue = owningAreas[0].areaLabel;
                } else if (
                  currentAreaKey &&
                  !owningAreas.some(candidate => candidate.areaKey === currentAreaKey)
                ) {
                  nextAreaValue = undefined;
                }
                setEdit({
                  ...edit,
                  group: nextGroup,
                  area: nextAreaValue,
                });
              }}
            >
              <option value="">Без группы</option>
              {groupOptionsForEdit.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
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
          attendance={attendance}
          performance={performance}
          onClose={() => setViewClientId(null)}
        />
      )}
    </>
  );
}
