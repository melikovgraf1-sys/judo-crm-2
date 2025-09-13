// @flow
import React, { useState, useEffect, useContext } from "react";
import Breadcrumbs from "./Breadcrumbs";
import { todayISO, saveDB, uid, fmtDate } from "../App";
import type { Lead, LeadStage, StaffMember } from "../App";
import { DBContext } from "../context/DBContext";

export default function LeadsTab() {
  const { db, setDB } = useContext(DBContext);
  const stages: LeadStage[] = ["Очередь", "Задержка", "Пробное", "Ожидание оплаты", "Оплаченный абонемент", "Отмена"];
  const [open, setOpen] = useState<Lead | null>(null);
  const move = (id: string, dir: 1 | -1) => {
    const l = db.leads.find(x => x.id === id); if (!l) return;
    const idx = stages.indexOf(l.stage);
    const nextStage = stages[Math.min(stages.length - 1, Math.max(0, idx + dir))];
    const next = { ...db, leads: db.leads.map(x => x.id === id ? { ...x, stage: nextStage, updatedAt: todayISO() } : x) };
    setDB(next); saveDB(next);
  };
  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Лиды"]} />
      <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stages.map(s => (
          <div key={s} className="p-3 rounded-2xl border border-slate-200 bg-white">
            <div className="text-xs text-slate-500 mb-2">{s}</div>
            <div className="space-y-2">
              {db.leads.filter(l => l.stage === s).map(l => (
                <div key={l.id} className="p-2 rounded-xl border border-slate-200 bg-slate-50">
                  <button onClick={() => setOpen(l)} className="text-sm font-medium text-left hover:underline w-full">{l.name}</button>
                  <div className="text-xs text-slate-500">{l.source}{l.contact ? " · " + l.contact : ""}</div>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => move(l.id, -1)} className="px-2 py-1 text-xs rounded-md border border-slate-300">◀</button>
                    <button onClick={() => move(l.id, +1)} className="px-2 py-1 text-xs rounded-md border border-slate-300">▶</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {open && (
        <LeadModal
          lead={open}
          onClose={() => setOpen(null)}
          staff={db.staff}
        />
      )}
    </div>
  );
}

function LeadModal(
  {
    lead,
    onClose,
    staff,
  }: {
    lead: Lead;
    onClose: () => void;
    staff: StaffMember[];
  },
) {
  const { db, setDB } = useContext(DBContext);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Partial<Lead>>(lead);
  useEffect(() => setForm(lead), [lead]);

  const save = () => {
    const nextLead: Lead = { ...lead, ...form, updatedAt: todayISO() };
    const next = {
      ...db,
      leads: db.leads.map(l => (l.id === lead.id ? nextLead : l)),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Обновлён лид ${nextLead.name}`, when: todayISO() }],
    };
    setDB(next); saveDB(next); setEdit(false); onClose();
  };

  const remove = () => {
    if (!confirm("Удалить лид?")) return;
    const next = {
      ...db,
      leads: db.leads.filter(l => l.id !== lead.id),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Удалён лид ${lead.id}`, when: todayISO() }],
    };
    setDB(next); saveDB(next); onClose();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 space-y-3">
        <div className="font-semibold text-slate-800">{lead.name}</div>
        <div className="grid gap-1 text-sm">
          <div><span className="text-slate-500">Родитель:</span> {lead.parentName || "—"}</div>
          <div><span className="text-slate-500">Имя ребёнка:</span> {lead.firstName}</div>
          <div><span className="text-slate-500">Фамилия:</span> {lead.lastName}</div>
          <div><span className="text-slate-500">Дата рождения:</span> {fmtDate(lead.birthDate)}</div>
          <div><span className="text-slate-500">Старт:</span> {fmtDate(lead.startDate)}</div>
          <div><span className="text-slate-500">Источник:</span> {lead.source}</div>
          <div><span className="text-slate-500">Контакт:</span> {lead.contact || "—"}</div>
          <div><span className="text-slate-500">Создан:</span> {fmtDate(lead.createdAt)}</div>
          <div><span className="text-slate-500">Обновлён:</span> {fmtDate(lead.updatedAt)}</div>
        </div>
        <div className="flex justify-end gap-2">
          {!edit && <button onClick={() => setEdit(true)} className="px-3 py-2 rounded-md border border-slate-300">Редактировать</button>}
          <button onClick={remove} className="px-3 py-2 rounded-md border border-rose-200 text-rose-600">Удалить</button>
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300">Закрыть</button>
        </div>
        {edit && (
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <input className="w-full px-3 py-2 rounded-md border border-slate-300" value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Имя" />
            <input className="w-full px-3 py-2 rounded-md border border-slate-300" value={form.parentName || ""} onChange={e => setForm({ ...form, parentName: e.target.value })} placeholder="Родитель" />
            <input className="w-full px-3 py-2 rounded-md border border-slate-300" value={form.contact || ""} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Контакт" />
            <div className="flex justify-end gap-2">
              <button onClick={save} className="px-3 py-2 rounded-md bg-sky-600 text-white">Сохранить</button>
              <button onClick={() => setEdit(false)} className="px-3 py-2 rounded-md border border-slate-300">Отмена</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
