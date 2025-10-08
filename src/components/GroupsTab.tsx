import React, { useState, useMemo, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import ClientFilters from "./clients/ClientFilters";
import ClientTable from "./clients/ClientTable";
import ClientForm from "./clients/ClientForm";
import { fmtMoney, todayISO, uid } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import {
  DEFAULT_SUBSCRIPTION_PLAN,
  applyPaymentStatusRules,
} from "../state/payments";
import { buildGroupsByArea } from "../state/lessons";
import { readDailyPeriod, readDailySelection, writeDailyPeriod, writeDailySelection, clearDailySelection } from "../state/filterPersistence";
import { transformClientFormValues } from "./clients/clientMutations";
import type { DB, UIState, Client, Area, Group, PaymentStatus, ClientFormValues, TaskItem } from "../types";
import { getClientPlacements } from "../state/clients";
import {
  collectAvailableYears,
  formatMonthInput,
  getDefaultPeriod,
  isClientActiveInPeriod,
  isClientInPeriod,
  type PeriodFilter,
} from "../state/period";

import { isReserveArea } from "../state/areas";

export default function GroupsTab({
  db,
  setDB,
  ui,
  initialArea = null,
  initialGroup = null,
  initialPay = "all",
}: {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  ui: UIState;
  initialArea?: Area | null;
  initialGroup?: Group | null;
  initialPay?: PaymentStatus | "all";
}) {
  const storedFilters = useMemo(() => readDailySelection("groups"), []);
  const [area, setArea] = useState<Area | null>(initialArea ?? storedFilters.area);
  const [group, setGroup] = useState<Group | null>(initialGroup ?? storedFilters.group);
  const [pay, setPay] = useState<PaymentStatus | "all">(initialPay);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const persistedPeriod = useMemo(() => readDailyPeriod("groups"), []);
  const [period, setPeriod] = useState<PeriodFilter>(() => {
    const fallback = getDefaultPeriod();
    return {
      year: persistedPeriod.year ?? fallback.year,
      month: persistedPeriod.month ?? fallback.month,
    };
  });

  const search = ui.search.toLowerCase();
  const groupsByArea = useMemo(() => buildGroupsByArea(db.schedule), [db.schedule]);
  const availableGroups = useMemo(() => {
    if (!area) return [];
    return groupsByArea.get(area) ?? [];
  }, [area, groupsByArea]);
  useEffect(() => {
    writeDailyPeriod("groups", period.month, period.year);
  }, [period]);

  useEffect(() => {
    if (area || group) {
      writeDailySelection("groups", area ?? null, group ?? null);
    } else {
      clearDailySelection("groups");
    }
  }, [area, group]);

  useEffect(() => {
    if (!area) {
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
    if (!area || group || !availableGroups.length) {
      return;
    }
    if (isReserveArea(area)) {
      return;
    }
    setGroup(availableGroups[0] ?? null);
  }, [area, availableGroups, group]);

  const list = useMemo(() => {
    if (!area || !group) {
      return [];
    }
    const matchesPeriod = (client: Client) => {
      if (period.month == null) {
        return isClientInPeriod(client, period) || isClientActiveInPeriod(client, period);
      }
      return isClientInPeriod(client, period);
    };

    return db.clients.filter(c =>
      c.area === area &&
      c.group === group &&
      !isReserveArea(c.area) &&
      (pay === "all" || c.payStatus === pay) &&
      matchesPeriod(c) &&
      (!ui.search || `${c.firstName} ${c.lastName ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(search))
    );
  }, [db.clients, area, group, pay, ui.search, search, period]);

  const openPaymentTasks = useMemo(() => {
    const map: Record<string, TaskItem> = {};
    db.tasks.forEach(task => {
      if (
        task.status !== "done" &&
        task.topic === "оплата" &&
        task.assigneeType === "client" &&
        task.assigneeId
      ) {
        const existing = map[task.assigneeId];
        if (!existing || existing.due > task.due) {
          map[task.assigneeId] = task;
        }
      }
    });
    return map;
  }, [db.tasks]);

  const monthValue = formatMonthInput(period);
  const baseYears = useMemo(() => collectAvailableYears(db), [db]);
  const yearOptions = useMemo(() => {
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

  const handleYearChange = (value: number) => {
    setPeriod(prev => ({ year: value, month: prev.month }));
  };


  const openAddModal = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const startEdit = (c: Client) => {
    setEditing(c);
    setModalOpen(true);
  };

  const saveClient = async (data: ClientFormValues) => {
    const prepared = transformClientFormValues(data, editing);
    if (editing) {
      const updated: Client = { ...editing, ...prepared };
      if (!Object.prototype.hasOwnProperty.call(prepared, "payAmount")) {
        delete updated.payAmount;
      }
      if (!Object.prototype.hasOwnProperty.call(prepared, "payActual")) {
        delete updated.payActual;
      }
      if (!Object.prototype.hasOwnProperty.call(prepared, "remainingLessons")) {
        delete updated.remainingLessons;
      }
      if (!Object.prototype.hasOwnProperty.call(prepared, "comment")) {
        delete updated.comment;
      }
      const next = {
        ...db,
        clients: db.clients.map(cl => (cl.id === editing.id ? updated : cl)),
        changelog: [...db.changelog, { id: uid(), who: "UI", what: `Обновлён клиент ${updated.firstName}`, when: todayISO() }],
      };
      const result = await commitDBUpdate(next, setDB);
      if (!result.ok) {
        if (result.reason === "error") {
          window.alert("Не удалось синхронизировать изменения клиента. Они сохранены локально, проверьте доступ к базе данных.");
        }
        return;
      }
    } else {
      const c: Client = {
        id: uid(),
        ...prepared,
        coachId: db.staff.find(s => s.role === "Тренер")?.id,
      };
      const next = {
        ...db,
        clients: [c, ...db.clients],
        changelog: [...db.changelog, { id: uid(), who: "UI", what: `Создан клиент ${c.firstName}`, when: todayISO() }],
      };
      const result = await commitDBUpdate(next, setDB);
      if (!result.ok) {
        if (result.reason === "error") {
          window.alert(
            "Не удалось синхронизировать нового клиента. Запись сохранена локально, проверьте доступ к базе данных.",
          );
        }
        return;
      }
    }
    setModalOpen(false);
    setEditing(null);
  };

  const createPaymentTask = async (client: Client) => {
    const placements = getClientPlacements(client);
    const targetPlacement = placements.find(place => place.area === area && place.group === group) ?? placements[0];
    const payAmount = targetPlacement?.payAmount ?? client.payAmount;
    const payDate = targetPlacement?.payDate ?? client.payDate;

    const titleParts = [
      `${client.firstName}${client.lastName ? ` ${client.lastName}` : ""}`.trim(),
      client.parentName ? `родитель: ${client.parentName}` : null,
      payAmount != null ? `сумма: ${fmtMoney(payAmount, ui.currency, db.settings.currencyRates)}` : null,
      payDate ? `дата: ${payDate.slice(0, 10)}` : null,
    ].filter(Boolean);

    const task: TaskItem = {
      id: uid(),
      title: `Оплата клиента — ${titleParts.join(" • ") || client.firstName}`,
      due: payDate || todayISO(),
      status: "open",
      topic: "оплата",
      assigneeType: "client",
      assigneeId: client.id,
      area: targetPlacement?.area ?? client.area,
      group: targetPlacement?.group ?? client.group,
      placementId: targetPlacement?.id,
    };

    let updates: Partial<Client> | undefined;

    if (targetPlacement) {
      const nextPlacement = { ...targetPlacement, payStatus: "задолженность" as const };
      const nextPlacements = placements.map(placement =>
        placement.id === nextPlacement.id ? nextPlacement : placement,
      );

      updates = { placements: nextPlacements };

      if (placements[0]?.id === nextPlacement.id) {
        updates = {
          ...updates,
          payStatus: "задолженность",
          area: nextPlacement.area,
          group: nextPlacement.group,
          subscriptionPlan: nextPlacement.subscriptionPlan,
          ...(nextPlacement.payAmount != null ? { payAmount: nextPlacement.payAmount } : {}),
          ...(nextPlacement.payDate ? { payDate: nextPlacement.payDate } : {}),
          ...(nextPlacement.payActual != null ? { payActual: nextPlacement.payActual } : {}),
          ...(nextPlacement.remainingLessons != null
            ? { remainingLessons: nextPlacement.remainingLessons }
            : {}),
        };
      }
    }

    const nextTasks = [task, ...db.tasks];
    const nextClients = applyPaymentStatusRules(
      db.clients,
      nextTasks,
      db.tasksArchive,
      updates ? { [client.id]: updates } : {},
    );
    const next = {
      ...db,
      tasks: nextTasks,
      tasksArchive: db.tasksArchive,
      clients: nextClients,
      changelog: [
        ...db.changelog,
        { id: uid(), who: "UI", what: `Создана задача по оплате ${client.firstName}`, when: todayISO() },
      ],
    };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok && result.reason === "error") {
      window.alert("Не удалось создать задачу. Проверьте доступ к базе данных.");
    }
  };

  const completePaymentTask = async (client: Client, task: TaskItem) => {
    const completedAt = todayISO();
    const completed: TaskItem = { ...task, status: "done" };
    const nextTasks = db.tasks.filter(t => t.id !== task.id);
    const nextArchive = [completed, ...db.tasksArchive];
    const placements = getClientPlacements(client);
    const placementFromTask = task.placementId
      ? placements.find(place => place.id === task.placementId)
      : placements.find(place => place.area === task.area && place.group === task.group);
    const targetPlacement = placementFromTask ?? placements[0];
    const payAmount = targetPlacement?.payAmount ?? client.payAmount;
    const resolvedPayActual = payAmount ?? targetPlacement?.payActual ?? client.payActual;

    const updates: Partial<Client> = {
      payStatus: "действует",
      ...(resolvedPayActual != null ? { payActual: resolvedPayActual } : {}),
    };

    const toUTCDate = (value?: string | null): Date | null => {
      if (!value) {
        return null;
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    };

    const addMonths = (date: Date, count: number) => {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();
      const day = date.getUTCDate();
      const targetMonthIndex = month + count;
      const targetYear = year + Math.floor(targetMonthIndex / 12);
      const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
      const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      const clampedDay = Math.min(day, maxDay);
      return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
    };

    const completionDate = toUTCDate(completedAt);
    const currentPayDate = toUTCDate(targetPlacement?.payDate ?? client.payDate ?? null);
    const startDate = toUTCDate(client.startDate ?? null);
    const plan = targetPlacement?.subscriptionPlan ?? client.subscriptionPlan ?? DEFAULT_SUBSCRIPTION_PLAN;

    let historyAnchor: Date | null = null;
    let nextPayDate: Date | null = null;

    if (plan === "half-month") {
      const base = completionDate ?? currentPayDate ?? startDate;
      if (base) {
        const candidate = new Date(base.getTime());
        candidate.setUTCDate(candidate.getUTCDate() + 14);
        nextPayDate = candidate;
      }
    } else if (plan === "monthly" || plan === "discount") {
      const base = currentPayDate ?? startDate ?? completionDate;
      if (base) {
        historyAnchor = base;
        nextPayDate = addMonths(base, 1);
      }
    } else {
      const base = completionDate ?? currentPayDate ?? startDate;
      if (base) {
        historyAnchor = base;
        nextPayDate = base;
      }
    }

    if (nextPayDate) {
      updates.payDate = nextPayDate.toISOString();
    }

    if (historyAnchor) {
      const historyValue = historyAnchor.toISOString();
      const existingHistory = Array.isArray(client.payHistory) ? client.payHistory : [];
      if (!existingHistory.includes(historyValue)) {
        updates.payHistory = [...existingHistory, historyValue];
      }
    }

    if (targetPlacement) {
      const nextPlacement = {
        ...targetPlacement,
        payStatus: "действует" as const,
        ...(updates.payActual != null ? { payActual: updates.payActual } : {}),
        ...(updates.payDate ? { payDate: updates.payDate } : {}),
      };

      updates.placements = placements.map(placement =>
        placement.id === nextPlacement.id ? nextPlacement : placement,
      );

      const primaryPlacementId = placements[0]?.id;
      if (primaryPlacementId === nextPlacement.id) {
        updates.area = nextPlacement.area;
        updates.group = nextPlacement.group;
        updates.subscriptionPlan = nextPlacement.subscriptionPlan;
        if (nextPlacement.payAmount != null) {
          updates.payAmount = nextPlacement.payAmount;
        }
        if (nextPlacement.payActual != null) {
          updates.payActual = nextPlacement.payActual;
        }
        if (nextPlacement.remainingLessons != null) {
          updates.remainingLessons = nextPlacement.remainingLessons;
        }
      }
    }

    const nextClients = applyPaymentStatusRules(db.clients, nextTasks, nextArchive, {
      [client.id]: updates,
    });
    const next = {
      ...db,
      tasks: nextTasks,
      tasksArchive: nextArchive,
      clients: nextClients,
      changelog: [
        ...db.changelog,
        { id: uid(), who: "UI", what: `Задача по оплате ${client.firstName} выполнена`, when: completedAt },
      ],
    };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok && result.reason === "error") {
      window.alert(
        "Не удалось обновить задачу оплаты. Изменение сохранено локально, проверьте доступ к базе данных.",
      );
    }
  };

  const removeClient = async (id: string) => {
    if (!window.confirm("Удалить клиента?")) return;
    const next = {
      ...db,
      clients: db.clients.filter(c => c.id !== id),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Удалён клиент ${id}`, when: todayISO() }],
    };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok && result.reason === "error") {
      window.alert("Не удалось удалить клиента. Проверьте доступ к базе данных.");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Breadcrumbs items={["Группы"]} />
      <ClientFilters
        db={db}
        area={area}
        setArea={setArea}
        group={group}
        setGroup={setGroup}
        pay={pay}
        setPay={setPay}
        groups={availableGroups}
        listLength={list.length}
        onAddClient={openAddModal}
        monthValue={monthValue}
        onMonthChange={handleMonthChange}
        year={period.year}
        onYearChange={handleYearChange}
        yearOptions={yearOptions}
      />
      <div>
        <ClientTable
          list={list}
          currency={ui.currency}
          currencyRates={db.settings.currencyRates}
          onEdit={startEdit}
          onRemove={removeClient}
          onCreateTask={createPaymentTask}
          openPaymentTasks={openPaymentTasks}
          onCompletePaymentTask={completePaymentTask}
          schedule={db.schedule}
          attendance={db.attendance}
          performance={db.performance}
          billingPeriod={period}
        />
      </div>
      {modalOpen && (
        <ClientForm
          db={db}
          editing={editing}
          onSave={saveClient}
          onClose={() => { setModalOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

