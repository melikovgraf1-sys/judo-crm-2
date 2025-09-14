// @flow
import React, { useState, useMemo } from "react";
import Breadcrumbs from "./Breadcrumbs";
import ClientFilters from "./clients/ClientFilters";
import ClientTable from "./clients/ClientTable";
import ClientForm from "./clients/ClientForm";
import { uid, todayISO, parseDateInput, saveDB } from "../state/appState";
import type { DB, UIState, Client, Area, Group, PaymentStatus } from "../types";


export default function ClientsTab({ db, setDB, ui }: { db: DB; setDB: (db: DB) => void; ui: UIState }) {
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
  }, [db.clients, area, group, pay, ui.search]);

  const openAddModal = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const startEdit = (c: Client) => {
    setEditing(c);
    setModalOpen(true);
  };

  const saveClient = async (data: any) => {
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
      setDB(next); await saveDB(next);
    } else {
      const c: Client = {
        id: uid(),
        ...prepared,
        coachId: db.staff.find(s => s.role === "Тренер")?.id,
        payAmount: 0,
      };
      const next = {
        ...db,
        clients: [c, ...db.clients],
        changelog: [...db.changelog, { id: uid(), who: "UI", what: `Создан клиент ${c.firstName}`, when: todayISO() }],
      };
      setDB(next); await saveDB(next);
    }
    setModalOpen(false);
    setEditing(null);
  };

  const removeClient = async (id: string) => {
    if (!window.confirm("Удалить клиента?")) return;
    const next = {
      ...db,
      clients: db.clients.filter(c => c.id !== id),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Удалён клиент ${id}`, when: todayISO() }],
    };
    setDB(next); await saveDB(next);
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
        ui={ui}
        onEdit={startEdit}
        onRemove={removeClient}
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

