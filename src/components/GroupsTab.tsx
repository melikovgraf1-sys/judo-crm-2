import React, { useState, useMemo, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import ClientFilters from "./clients/ClientFilters";
import ClientTable from "./clients/ClientTable";
import ClientForm from "./clients/ClientForm";
import { uid, todayISO, fmtMoney } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import {
  applyPaymentStatusRules,
  getDefaultPayAmount,
  shouldAllowCustomPayAmount,
} from "../state/payments";
import { buildGroupsByArea } from "../state/lessons";
import { readDailyPeriod, readDailySelection, writeDailyPeriod, writeDailySelection, clearDailySelection } from "../state/filterPersistence";
import { transformClientFormValues } from "./clients/clientMutations";
import type { DB, UIState, Client, Area, Group, PaymentStatus, ClientFormValues, TaskItem } from "../types";
import {
  collectAvailableYears,
  formatMonthInput,
  getDefaultPeriod,
  isClientInPeriod,
  type PeriodFilter,
} from "../state/period";


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

  const list = useMemo(() => {
    if (!area || !group) {
      return [];
    }
    return db.clients.filter(c =>
      c.area === area &&
      c.group === group &&
      (pay === "all" || c.payStatus === pay) &&
      isClientInPeriod(c, period) &&
      (!ui.search || `${c.firstName} ${c.lastName ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(search))
    );
  }, [db.clients, area, group, pay, ui.search, search, period]);

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

  const resolvePayAmount = (rawValue: string, group: Group, previous?: number): number | undefined => {
    const defaultAmount = getDefaultPayAmount(group);
    if (!shouldAllowCustomPayAmount(group) && defaultAmount != null) {
      return defaultAmount;
    }

    const parsed = Number.parseFloat(rawValue);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }

    if (defaultAmount != null) {
      return defaultAmount;
    }

    return previous;
  };

  const saveClient = async (data: ClientFormValues) => {
    const prepared = transformClientFormValues(data, editing);
    if (editing) {
      const updated: Client = { ...editing, ...prepared };
      if (!Object.prototype.hasOwnProperty.call(prepared, "payAmount")) {
        delete updated.payAmount;
      }
      if (!Object.prototype.hasOwnProperty.call(prepared, "remainingLessons")) {
        delete updated.remainingLessons;
      }
      const next = {
        ...db,
        clients: db.clients.map(cl => (cl.id === editing.id ? updated : cl)),
        changelog: [...db.changelog, { id: uid(), who: "UI", what: `Обновлён клиент ${updated.firstName}`, when: todayISO() }],
      };
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert("Не удалось синхронизировать изменения клиента. Они сохранены локально, проверьте доступ к базе данных.");
        setDB(next);
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
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert("Не удалось синхронизировать нового клиента. Запись сохранена локально, проверьте доступ к базе данных.");
        setDB(next);
      }
    }
    setModalOpen(false);
    setEditing(null);
  };

  const createPaymentTask = async (client: Client) => {
    const titleParts = [
      `${client.firstName}${client.lastName ? ` ${client.lastName}` : ""}`.trim(),
      client.parentName ? `родитель: ${client.parentName}` : null,
      client.payAmount != null ? `сумма: ${fmtMoney(client.payAmount, ui.currency)}` : null,
      client.payDate ? `дата: ${client.payDate.slice(0, 10)}` : null,
    ].filter(Boolean);

    const task: TaskItem = {
      id: uid(),
      title: `Оплата клиента — ${titleParts.join(" • ") || client.firstName}`,
      due: client.payDate || todayISO(),
      status: "open",
      topic: "оплата",
      assigneeType: "client",
      assigneeId: client.id,
    };

    const nextTasks = [task, ...db.tasks];
    const nextClients = applyPaymentStatusRules(db.clients, nextTasks);
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
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось создать задачу. Проверьте доступ к базе данных.");
    }
  };

  const removeClient = async (id: string) => {
    if (!window.confirm("Удалить клиента?")) return;
    const next = {
      ...db,
      clients: db.clients.filter(c => c.id !== id),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Удалён клиент ${id}`, when: todayISO() }],
    };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
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
      <div className="flex-1 min-h-0">
        <ClientTable
          list={list}
          currency={ui.currency}
          onEdit={startEdit}
          onRemove={removeClient}
          onCreateTask={createPaymentTask}
          schedule={db.schedule}
          attendance={db.attendance}
          performance={db.performance}
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

