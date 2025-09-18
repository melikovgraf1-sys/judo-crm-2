import React, { useState, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import ClientFilters from "./clients/ClientFilters";
import ClientTable from "./clients/ClientTable";
import ClientForm from "./clients/ClientForm";
import { uid, todayISO, parseDateInput, fmtMoney } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import type { DB, UIState, Client, Area, Group, PaymentStatus, ClientFormValues, TaskItem } from "../types";


export default function ClientsTab({
  db,
  setDB,
  ui,
}: {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  ui: UIState;
}) {
  const [area, setArea] = useState<Area | "all">("all");
  const [group, setGroup] = useState<Group | "all">("all");
  const [pay, setPay] = useState<PaymentStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const search = ui.search.toLowerCase();

  const list = useMemo(() => {
    return db.clients.filter(c =>
      (area === "all" || c.area === area) &&
      (group === "all" || c.group === group) &&
      (pay === "all" || c.payStatus === pay) &&
      (!ui.search || `${c.firstName} ${c.lastName ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(search))
    );
  }, [db.clients, area, group, pay, ui.search, search]);

  const openAddModal = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const startEdit = (c: Client) => {
    setEditing(c);
    setModalOpen(true);
  };

  const saveClient = async (data: ClientFormValues) => {
    const prepared = {
      ...data,
      birthDate: parseDateInput(data.birthDate),
      startDate: parseDateInput(data.startDate),
      payDate: parseDateInput(data.payDate),
    };
    if (editing) {
      const updated: Client = { ...editing, ...prepared };
      const next = {
        ...db,
        clients: db.clients.map(cl => (cl.id === editing.id ? updated : cl)),
        changelog: [...db.changelog, { id: uid(), who: "UI", what: `Обновлён клиент ${updated.firstName}`, when: todayISO() }],
      };
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert("Не удалось сохранить изменения клиента. Проверьте доступ к базе данных.");
        return;
      }
    } else {
      const c: Client = {
        id: uid(),
        ...prepared,
        coachId: db.staff.find(s => s.role === "Тренер")?.id,
        payAmount: 0,
        payConfirmed: false,
      };
      const next = {
        ...db,
        clients: [c, ...db.clients],
        changelog: [...db.changelog, { id: uid(), who: "UI", what: `Создан клиент ${c.firstName}`, when: todayISO() }],
      };
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert("Не удалось сохранить нового клиента. Проверьте доступ к базе данных.");
        return;
      }
    }
    setModalOpen(false);
    setEditing(null);
  };

  const togglePayFact = async (id: string, value: boolean) => {
    const target = db.clients.find(c => c.id === id);
    if (!target) return;
    const next = {
      ...db,
      clients: db.clients.map(c => (c.id === id ? { ...c, payConfirmed: value } : c)),
      changelog: [
        ...db.changelog,
        { id: uid(), who: "UI", what: `Обновлён факт оплаты ${target.firstName}`, when: todayISO() },
      ],
    };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось обновить факт оплаты. Проверьте доступ к базе данных.");
    }
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

    const next = {
      ...db,
      tasks: [task, ...db.tasks],
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
    <div className="space-y-3">
      <Breadcrumbs items={["Клиенты"]} />
      <ClientFilters
        db={db}
        area={area}
        setArea={setArea}
        group={group}
        setGroup={setGroup}
        pay={pay}
        setPay={setPay}
        listLength={list.length}
        onAddClient={openAddModal}
      />
      <ClientTable
        list={list}
        currency={ui.currency}
        onEdit={startEdit}
        onRemove={removeClient}
        onTogglePayFact={togglePayFact}
        onCreateTask={createPaymentTask}
      />
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

