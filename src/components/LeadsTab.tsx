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
import type { ContactChannel, DB, Lead, LeadStage, LeadFormValues, Client } from "../types";

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

    if (isPaidStage(nextStage)) {
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
          db={db}
          setDB={setDB}
          stages={stages}
        />
      )}
    </div>
  );
}

const isPaidStage = (stage: LeadStage): boolean => stage.toLowerCase().includes("оплач");

const CONTACT_CHANNELS: ContactChannel[] = ["Telegram", "WhatsApp", "Instagram"];
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
    payStatus: "ожидание",
    status: "новый",
    payDate: fallbackDate,
  };

  return client;
}

function formatLeadContactSummary(lead: Lead): string {
  const contact = [lead.phone, lead.whatsApp, lead.telegram, lead.instagram].find(value => value?.trim().length);
  return contact ? ` · ${contact}` : "";
}

const toLeadFormValues = (
  current: Lead,
  defaults: { area: string; group: string },
): LeadFormValues => {
  const [firstName = "", ...restName] = (current.firstName ?? current.name ?? "").split(/\s+/).filter(Boolean);
  return {
    name: current.name,
    firstName: current.firstName ?? firstName ?? "",
    lastName: current.lastName ?? restName.join(" "),
    parentName: current.parentName ?? "",
    phone: current.phone ?? "",
    whatsApp: current.whatsApp ?? "",
    telegram: current.telegram ?? "",
    instagram: current.instagram ?? "",
    source: current.source,
    area: current.area ?? defaults.area,
    group: current.group ?? defaults.group,
    stage: current.stage,
    birthDate: current.birthDate ? current.birthDate.slice(0, 10) : "",
    startDate: current.startDate ? current.startDate.slice(0, 10) : "",
    notes: current.notes ?? "",
  };
};

function LeadModal(
  {
    lead,
    onClose,
    db,
    setDB,
    stages,
  }: {
    lead: Lead;
    onClose: () => void;
    db: DB;
    setDB: Dispatch<SetStateAction<DB>>;
    stages: LeadStage[];
  },
) {
  const [edit, setEdit] = useState(false);

  const schema = yup
    .object({
      name: yup.string().trim().required("Имя обязательно"),
      firstName: yup.string().trim().nullable(),
      lastName: yup.string().trim().nullable(),
      parentName: yup.string().trim().nullable(),
      phone: yup.string().trim(),
      whatsApp: yup.string().trim(),
      telegram: yup.string().trim(),
      instagram: yup.string().trim(),
      source: yup
        .string()
        .oneOf(CONTACT_CHANNELS, "Выберите канал")
        .required("Выберите канал"),
      area: yup.string().trim().required("Укажите район"),
      group: yup.string().trim().required("Укажите группу"),
      stage: yup
        .string()
        .oneOf(stages, "Выберите стадию")
        .required("Выберите стадию"),
      birthDate: yup.string().nullable(),
      startDate: yup.string().nullable(),
      notes: yup.string().trim().nullable(),
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

  const defaultArea = db.settings.areas[0] ?? "";
  const defaultGroup = db.settings.groups[0] ?? "";

  const { register, handleSubmit, reset, formState: { errors, isValid } } = useForm<LeadFormValues>({
    resolver,
    mode: "onChange",
    defaultValues: toLeadFormValues(lead, { area: defaultArea, group: defaultGroup }),
  });

  useEffect(() => {
    reset(toLeadFormValues(lead, { area: defaultArea, group: defaultGroup }));
  }, [lead, reset, defaultArea, defaultGroup]);

  const save = async (data: LeadFormValues) => {
    const toISODate = (value: string): string | undefined => {
      const trimmed = value?.trim();
      return trimmed ? `${trimmed}T00:00:00.000Z` : undefined;
    };
    const nextLead: Lead = {
      ...lead,
      name: data.name.trim(),
      firstName: data.firstName?.trim() || undefined,
      lastName: data.lastName?.trim() || undefined,
      parentName: data.parentName?.trim() || undefined,
      phone: data.phone?.trim() || undefined,
      whatsApp: data.whatsApp?.trim() || undefined,
      telegram: data.telegram?.trim() || undefined,
      instagram: data.instagram?.trim() || undefined,
      source: data.source as ContactChannel,
      area: data.area || defaultArea,
      group: data.group || defaultGroup,
      stage: data.stage as LeadStage,
      birthDate: toISODate(data.birthDate) ?? undefined,
      startDate: toISODate(data.startDate) ?? undefined,
      notes: data.notes?.trim() || undefined,
      updatedAt: todayISO(),
    };

    if (isPaidStage(nextLead.stage)) {
      const newClient = convertLeadToClient(nextLead, db);
      const next = {
        ...db,
        leads: db.leads.filter(l => l.id !== lead.id),
        clients: [newClient, ...db.clients],
        changelog: [
          ...db.changelog,
          { id: uid(), who: "UI", what: `Лид ${nextLead.name} конвертирован в клиента ${newClient.firstName}`, when: todayISO() },
        ],
      };
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert(
          "Не удалось синхронизировать изменения лида. Они сохранены локально, проверьте доступ к базе данных.",
        );
        setDB(next);
      }
      setEdit(false);
      onClose();
      return;
    }

    const next = {
      ...db,
      leads: db.leads.map(l => (l.id === lead.id ? nextLead : l)),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Обновлён лид ${nextLead.name}`, when: todayISO() }],
    };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось синхронизировать изменения лида. Они сохранены локально, проверьте доступ к базе данных.");
      setDB(next);
    }
    setEdit(false);
    onClose();
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{lead.name}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{lead.stage}</div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {!edit && (
              <button
                onClick={() => setEdit(true)}
                className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Редактировать
              </button>
            )}
            <button
              onClick={remove}
              className="px-3 py-2 rounded-md border border-rose-200 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/30"
            >
              Удалить
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Закрыть
            </button>
          </div>
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <InfoRow label="Имя ребёнка" value={lead.firstName ?? "—"} />
          <InfoRow label="Фамилия" value={lead.lastName ?? "—"} />
          <InfoRow label="Родитель" value={lead.parentName || "—"} />
          <InfoRow label="Источник" value={lead.source} />
          <InfoRow label="Телефон" value={lead.phone || "—"} />
          <InfoRow label="WhatsApp" value={lead.whatsApp || "—"} />
          <InfoRow label="Telegram" value={lead.telegram || "—"} />
          <InfoRow label="Instagram" value={lead.instagram || "—"} />
          <InfoRow label="Район" value={lead.area ?? "—"} />
          <InfoRow label="Группа" value={lead.group ?? "—"} />
          <InfoRow label="Дата рождения" value={lead.birthDate ? fmtDate(lead.birthDate) : "—"} />
          <InfoRow label="Старт" value={lead.startDate ? fmtDate(lead.startDate) : "—"} />
          <InfoRow label="Создан" value={fmtDate(lead.createdAt)} />
          <InfoRow label="Обновлён" value={fmtDate(lead.updatedAt)} />
        </div>

        <InfoRow
          label="Заметки"
          value={lead.notes ? <span className="whitespace-pre-line">{lead.notes}</span> : "—"}
        />

        {edit && (
          <form
            onSubmit={handleSubmit(save)}
            className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Название карточки
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("name")}
                  placeholder="Имя"
                />
                {errors.name && <span className="text-xs text-rose-600">{errors.name.message}</span>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Имя ребёнка
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("firstName")}
                  placeholder="Имя ребёнка"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Фамилия
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("lastName")}
                  placeholder="Фамилия"
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Родитель
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("parentName")}
                  placeholder="Родитель"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Статус лида
                </label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("stage")}
                >
                  {stages.map(stage => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
                {errors.stage && <span className="text-xs text-rose-600">{errors.stage.message}</span>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Источник
                </label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("source")}
                >
                  {CONTACT_CHANNELS.map(channel => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
                {errors.source && <span className="text-xs text-rose-600">{errors.source.message}</span>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Район
                </label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("area")}
                >
                  {db.settings.areas.map(area => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
                {errors.area && <span className="text-xs text-rose-600">{errors.area.message}</span>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Группа
                </label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("group")}
                >
                  {db.settings.groups.map(group => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
                {errors.group && <span className="text-xs text-rose-600">{errors.group.message}</span>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Дата рождения
                </label>
                <input
                  type="date"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("birthDate")}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Дата старта
                </label>
                <input
                  type="date"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("startDate")}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Телефон
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("phone")}
                  placeholder="Телефон"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  WhatsApp
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("whatsApp")}
                  placeholder="WhatsApp"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Telegram
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("telegram")}
                  placeholder="Telegram"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Instagram
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("instagram")}
                  placeholder="Instagram"
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Заметки
                </label>
                <textarea
                  rows={4}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  {...register("notes")}
                  placeholder="Заметки"
                />
              </div>
            </div>
            {errors.phone && <span className="text-xs text-rose-600">{errors.phone.message}</span>}
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={!isValid}
                className="rounded-md bg-sky-600 px-3 py-2 text-sm text-white disabled:bg-slate-400"
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={() => setEdit(false)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Отмена
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-slate-700 dark:text-slate-100">{value}</span>
    </div>
  );
}
