import React, { useState, useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import Breadcrumbs from "./Breadcrumbs";
import Modal from "./Modal";
import { FixedSizeList, ListChildComponentProps } from "react-window";
import { todayISO, uid, fmtDate } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import type { DB, Lead, LeadStage, StaffMember, LeadFormValues, Client } from "../types";

export default function LeadsTab({
  db,
  setDB,
}: {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
}) {
  const stages: LeadStage[] = ["Очередь", "Задержка", "Пробное", "Ожидание оплаты", "Оплаченный абонемент", "Отмена"];
  const [open, setOpen] = useState<Lead | null>(null);
  const groupedLeads = useMemo((): Record<LeadStage, Lead[]> =>
    db.leads.reduce((acc, l) => {
      if (acc[l.stage]) acc[l.stage].push(l); else acc[l.stage] = [l];
      return acc;
    }, {} as Record<LeadStage, Lead[]>), [db.leads]);
  const move = async (id: string, dir: 1 | -1) => {
    const current = db.leads.find(x => x.id === id);
    if (!current) return;
    const idx = stages.indexOf(current.stage);
    const nextStage = stages[Math.min(stages.length - 1, Math.max(0, idx + dir))];
    const updatedLead: Lead = { ...current, stage: nextStage, updatedAt: todayISO() };

    if (nextStage === "Оплаченный абонемент") {
      const newClient = convertLeadToClient(updatedLead, db);
      const next = {
        ...db,
        leads: db.leads.filter(lead => lead.id !== id),
        clients: [newClient, ...db.clients],
        changelog: [
          ...db.changelog,
          { id: uid(), who: "UI", what: `Лид ${current.name} конвертирован в клиента ${newClient.firstName}`, when: todayISO() },
        ],
      };
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert("Не удалось обновить статус лида. Проверьте доступ к базе данных.");
      }
      return;
    }

    const next = { ...db, leads: db.leads.map(x => (x.id === id ? updatedLead : x)) };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось обновить статус лида. Проверьте доступ к базе данных.");
    }
  };
  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Лиды"]} />
      <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stages.map(s => {

          const leads: Lead[] = groupedLeads[s] ?? [];

          return (
            <div key={s} className="p-3 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
              <div className="text-xs text-slate-500 mb-2">{s}</div>
              <FixedSizeList
                height={200}
                itemCount={leads.length}
                itemSize={90}
                width="100%"
              >
                {({ index, style }: ListChildComponentProps) => {
                  const l = leads[index];
                  return (
                    <div key={l.id} style={style} className="p-2 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      <button onClick={() => setOpen(l)} className="text-sm font-medium text-left hover:underline w-full">{l.name}</button>
                      <div className="text-xs text-slate-500">{l.source}{formatLeadContactSummary(l)}</div>
                      <div className="flex gap-1 mt-2">
                        <button onClick={() => move(l.id, -1)} className="px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800">◀</button>
                        <button onClick={() => move(l.id, +1)} className="px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800">▶</button>
                      </div>
                    </div>
                  );
                }}
              </FixedSizeList>
            </div>
          );
        })}
      </div>
      {open && (
        <LeadModal
          lead={open}
          onClose={() => setOpen(null)}
          staff={db.staff}
          db={db}
          setDB={setDB}
        />
      )}
    </div>
  );
}

function convertLeadToClient(lead: Lead, db: DB): Client {
  const fallbackDate = lead.updatedAt ?? todayISO();
  const area = lead.area ?? db.settings.areas[0];
  const group = lead.group ?? db.settings.groups[0];
  const coach =
    db.staff.find(member => member.role === "Тренер" && member.areas.includes(area) && member.groups.includes(group)) ??
    db.staff.find(member => member.role === "Тренер");

  const rawName = (lead.firstName ?? lead.name ?? "Новый клиент").trim();
  const nameParts = rawName.split(/\s+/).filter(Boolean);
  const firstName = lead.firstName ?? nameParts[0] ?? "Новый";
  const lastName = lead.lastName ?? (nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined);

  const client: Client = {
    id: uid(),
    firstName,
    lastName,
    parentName: lead.parentName,
    phone: lead.phone,
    whatsApp: lead.whatsApp,
    telegram: lead.telegram,
    instagram: lead.instagram,
    channel: lead.source,
    birthDate: lead.birthDate ?? fallbackDate,
    gender: "м",
    area,
    group,
    coachId: coach?.id,
    startDate: lead.startDate ?? fallbackDate,
    payMethod: "перевод",
    payStatus: "действует",
    status: "действующий",
    payDate: fallbackDate,
  };

  return client;
}

function formatLeadContactSummary(lead: Lead): string {
  const contact = [lead.phone, lead.whatsApp, lead.telegram, lead.instagram].find(value => value?.trim().length);
  return contact ? ` · ${contact}` : "";
}

const toLeadFormValues = (current: Lead): LeadFormValues => ({
  name: current.name,
  parentName: current.parentName ?? "",
  phone: current.phone ?? "",
  whatsApp: current.whatsApp ?? "",
  telegram: current.telegram ?? "",
  instagram: current.instagram ?? "",
});

function LeadModal(
  {
    lead,
    onClose,
    staff,
    db,
    setDB,
  }: {
    lead: Lead;
    onClose: () => void;
    staff: StaffMember[];
    db: DB;
    setDB: Dispatch<SetStateAction<DB>>;
  },
) {
  const [edit, setEdit] = useState(false);

  const schema = yup
    .object({
      name: yup.string().required("Имя обязательно"),
      parentName: yup.string().nullable(),
      phone: yup.string().trim(),
      whatsApp: yup.string().trim(),
      telegram: yup.string().trim(),
      instagram: yup.string().trim(),
    })
    .test("contact-required", "Укажите хотя бы один контакт", function (value) {
      if (!value) return false;
      const { phone, whatsApp, telegram, instagram } = value as LeadFormValues;
      if ([phone, whatsApp, telegram, instagram].some(field => field?.trim().length)) {
        return true;
      }
      return this.createError({ path: "phone", message: "Укажите хотя бы один контакт" });
    });

  const resolver = yupResolver(schema) as unknown as Resolver<LeadFormValues>;

  const { register, handleSubmit, reset, formState: { errors, isValid } } = useForm<LeadFormValues>({
    resolver,
    mode: "onChange",
    defaultValues: toLeadFormValues(lead),
  });

  useEffect(() => reset(toLeadFormValues(lead)), [lead, reset]);

  const save = async (data: LeadFormValues) => {
    const nextLead: Lead = {
      ...lead,
      ...data,
      parentName: data.parentName?.trim() || undefined,
      phone: data.phone?.trim() || undefined,
      whatsApp: data.whatsApp?.trim() || undefined,
      telegram: data.telegram?.trim() || undefined,
      instagram: data.instagram?.trim() || undefined,
      updatedAt: todayISO(),
    };
    const next = {
      ...db,
      leads: db.leads.map(l => (l.id === lead.id ? nextLead : l)),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Обновлён лид ${nextLead.name}`, when: todayISO() }],
    };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось сохранить изменения лида. Проверьте доступ к базе данных.");
      return;
    }
    setEdit(false); onClose();
  };

  const remove = async () => {
    if (!window.confirm("Удалить лид?")) return;
    const next = {
      ...db,
      leads: db.leads.filter(l => l.id !== lead.id),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Удалён лид ${lead.id}`, when: todayISO() }],
    };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось удалить лида. Проверьте доступ к базе данных.");
      return;
    }
    onClose();
  };

  return (
    <Modal size="lg" onClose={onClose}>
      <div className="font-semibold text-slate-800">{lead.name}</div>
      <div className="grid gap-1 text-sm">
        <div><span className="text-slate-500">Родитель:</span> {lead.parentName || "—"}</div>
        <div><span className="text-slate-500">Имя ребёнка:</span> {lead.firstName ?? "—"}</div>
        <div><span className="text-slate-500">Фамилия:</span> {lead.lastName ?? "—"}</div>
        <div><span className="text-slate-500">Дата рождения:</span> {lead.birthDate ? fmtDate(lead.birthDate) : "—"}</div>
        <div><span className="text-slate-500">Старт:</span> {lead.startDate ? fmtDate(lead.startDate) : "—"}</div>
        <div><span className="text-slate-500">Источник:</span> {lead.source}</div>
        <div><span className="text-slate-500">Телефон:</span> {lead.phone || "—"}</div>
        <div><span className="text-slate-500">WhatsApp:</span> {lead.whatsApp || "—"}</div>
        <div><span className="text-slate-500">Telegram:</span> {lead.telegram || "—"}</div>
        <div><span className="text-slate-500">Instagram:</span> {lead.instagram || "—"}</div>
        <div><span className="text-slate-500">Создан:</span> {fmtDate(lead.createdAt)}</div>
        <div><span className="text-slate-500">Обновлён:</span> {fmtDate(lead.updatedAt)}</div>
      </div>
      <div className="flex justify-end gap-2">
        {!edit && <button onClick={() => setEdit(true)} className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800">Редактировать</button>}
        <button onClick={remove} className="px-3 py-2 rounded-md border border-rose-200 text-rose-600 dark:border-rose-700 dark:bg-rose-900/20">Удалить</button>
        <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800">Закрыть</button>
      </div>
      {edit && (
        <form onSubmit={handleSubmit(save)} className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <input className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" {...register("name")} placeholder="Имя" />
          {errors.name && <span className="text-xs text-rose-600">{errors.name.message}</span>}
          <input className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" {...register("parentName")} placeholder="Родитель" />
          <input className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" {...register("phone")} placeholder="Телефон" />
          {errors.phone && <span className="text-xs text-rose-600">{errors.phone.message}</span>}
          <input className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" {...register("whatsApp")} placeholder="WhatsApp" />
          <input className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" {...register("telegram")} placeholder="Telegram" />
          <input className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" {...register("instagram")} placeholder="Instagram" />
          <div className="flex justify-end gap-2">
            <button type="submit" disabled={!isValid} className="px-3 py-2 rounded-md bg-sky-600 text-white disabled:bg-slate-400">Сохранить</button>
            <button type="button" onClick={() => setEdit(false)} className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800">Отмена</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
