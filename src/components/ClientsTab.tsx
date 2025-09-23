import React, { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import ClientTable from "./clients/ClientTable";
import ClientForm from "./clients/ClientForm";
import { fmtMoney, todayISO, uid } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import { applyPaymentStatusRules } from "../state/payments";
import { transformClientFormValues } from "./clients/clientMutations";
import type { Client, ClientFormValues, DB, TaskItem, UIState } from "../types";

type ClientsTabProps = {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  ui: UIState;
};

export default function ClientsTab({ db, setDB, ui }: ClientsTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [query, setQuery] = useState(ui.search);

  useEffect(() => {
    setQuery(ui.search);
  }, [ui.search]);

  const search = query.trim().toLowerCase();
  const list = useMemo(() => {
    if (!search) {
      return db.clients;
    }
    return db.clients.filter(client => {
      const fullName = `${client.firstName} ${client.lastName ?? ""}`.trim().toLowerCase();
      if (fullName.includes(search)) {
        return true;
      }
      const contacts = `${client.phone ?? ""} ${client.whatsApp ?? ""} ${client.telegram ?? ""} ${client.instagram ?? ""}`
        .toLowerCase();
      return contacts.includes(search);
    });
  }, [db.clients, search]);

  const openAddModal = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const startEdit = (client: Client) => {
    setEditing(client);
    setModalOpen(true);
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
      const client: Client = {
        id: uid(),
        ...prepared,
        coachId: db.staff.find(staffMember => staffMember.role === "Тренер")?.id,
      };
      const next = {
        ...db,
        clients: [client, ...db.clients],
        changelog: [...db.changelog, { id: uid(), who: "UI", what: `Создан клиент ${client.firstName}`, when: todayISO() }],
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
      clients: db.clients.filter(client => client.id !== id),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Удалён клиент ${id}`, when: todayISO() }],
    };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось удалить клиента. Проверьте доступ к базе данных.");
    }
  };

  const total = db.clients.length;
  const visibleCount = list.length;
  const counterText = search
    ? `Найдено: ${visibleCount} из ${total}`
    : `Всего клиентов: ${total}`;

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Клиенты"]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Поиск клиента…"
            className="px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring focus:ring-sky-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          />
          <div className="text-xs text-slate-500">{counterText}</div>
        </div>
        <button
          onClick={openAddModal}
          className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700"
        >
          + Добавить клиента
        </button>
      </div>
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
      {modalOpen && (
        <ClientForm
          db={db}
          editing={editing}
          onSave={saveClient}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

