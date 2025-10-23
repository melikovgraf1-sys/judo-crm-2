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
import { buildGroupsByArea } from "../state/lessons";
import {
  DEFAULT_SUBSCRIPTION_PLAN,
  SUBSCRIPTION_PLANS,
  getAllowedSubscriptionPlansForGroup,
  getDefaultSubscriptionPlanForGroup,
  getGroupDefaultExpectedAmount,
  getSubscriptionPlanAmountForGroup,
  getSubscriptionPlanMeta,
} from "../state/payments";
import type {
  ContactChannel,
  DB,
  Lead,
  LeadStage,
  LeadFormValues,
  Client,
  ClientPlacement,
  LeadLifecycleEvent,
  LeadLifecycleOutcome,
  SubscriptionPlan,
  Area,
  Group,
} from "../types";
import { DEFAULT_PAYMENT_METHOD } from "../types";

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full border text-xs ${
        active
          ? "bg-sky-600 text-white border-sky-600"
          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

export default function LeadsTab({
  db,
  setDB,
}: {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
}) {
  const stages: LeadStage[] = ["Очередь", "Задержка", "Пробное", "Ожидание оплаты"];
  const [open, setOpen] = useState<Lead | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const groupsByArea = useMemo(() => buildGroupsByArea(db.schedule), [db.schedule]);
  const availableGroups = useMemo(() => {
    if (!selectedArea) return [];
    return groupsByArea.get(selectedArea) ?? [];
  }, [groupsByArea, selectedArea]);
  useEffect(() => {
    if (!selectedArea) {
      if (selectedGroup !== null) {
        setSelectedGroup(null);
      }
      return;
    }
    if (selectedGroup && !availableGroups.includes(selectedGroup)) {
      setSelectedGroup(null);
    }
  }, [availableGroups, selectedArea, selectedGroup]);
  const groupedLeads = useMemo((): Record<LeadStage, Lead[]> => {
    const filtered = db.leads.filter(lead => {
      if (selectedArea && lead.area !== selectedArea) {
        return false;
      }
      if (selectedGroup && lead.group !== selectedGroup) {
        return false;
      }
      return true;
    });
    return filtered.reduce((acc, l) => {
      if (acc[l.stage]) acc[l.stage].push(l); else acc[l.stage] = [l];
      return acc;
    }, {} as Record<LeadStage, Lead[]>);
  }, [db.leads, selectedArea, selectedGroup]);
  const move = async (id: string, dir: 1 | -1) => {
    const current = db.leads.find(x => x.id === id);
    if (!current) return;
    const idx = stages.indexOf(current.stage);
    const nextStage = stages[Math.min(stages.length - 1, Math.max(0, idx + dir))];
    const updatedLead: Lead = { ...current, stage: nextStage, updatedAt: todayISO() };

    const next = { ...db, leads: db.leads.map(x => (x.id === id ? updatedLead : x)) };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok) {
      if (result.reason === "error") {
        window.alert("Не удалось обновить статус лида. Изменение сохранено локально, проверьте доступ к базе данных.");
      }
      return;
    }
  };

  const saveLead = async (lead: Lead, data: LeadFormValues) => {
    const toISODate = (value: string): string | undefined => {
      const trimmed = value?.trim();
      return trimmed ? `${trimmed}T00:00:00.000Z` : undefined;
    };

    const fallbackArea = db.settings.areas[0] ?? "";
    const fallbackGroup = db.settings.groups[0] ?? "";

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
      area: data.area || fallbackArea,
      group: data.group || fallbackGroup,
      stage: data.stage as LeadStage,
      subscriptionPlan: data.subscriptionPlan,
      birthDate: toISODate(data.birthDate) ?? undefined,
      startDate: toISODate(data.startDate) ?? undefined,
      notes: data.notes?.trim() || undefined,
      updatedAt: todayISO(),
    };

    const next = {
      ...db,
      leads: db.leads.map(l => (l.id === lead.id ? nextLead : l)),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Обновлён лид ${nextLead.name}`, when: todayISO() }],
    };

    const result = await commitDBUpdate(next, setDB);
    if (!result.ok) {
      if (result.reason === "error") {
        window.alert("Не удалось синхронизировать изменения лида. Они сохранены локально, проверьте доступ к базе данных.");
      }
      return;
    }
  };

  const convertLead = async (lead: Lead) => {
    const newClient = convertLeadToClient(lead, db);
    const resolution = makeLeadHistoryEntry(lead, "converted");
    const next = {
      ...db,
      leads: db.leads.filter(l => l.id !== lead.id),
      clients: [newClient, ...db.clients],
      leadHistory: [resolution, ...db.leadHistory.filter(entry => entry.leadId !== lead.id)],
      changelog: [
        ...db.changelog,
        { id: uid(), who: "UI", what: `Лид ${lead.name} конвертирован в клиента ${newClient.firstName}`, when: todayISO() },
      ],
    };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok) {
      if (result.reason === "error") {
        window.alert("Не удалось обновить лида. Изменение сохранено локально, проверьте доступ к базе данных.");
      }
      return;
    }
  };

  const archiveLead = async (lead: Lead) => {
    const archivedLead: Lead = { ...lead, updatedAt: todayISO() };
    const resolution = makeLeadHistoryEntry(archivedLead, "canceled");
    const next = {
      ...db,
      leads: db.leads.filter(l => l.id !== lead.id),
      leadsArchive: [archivedLead, ...db.leadsArchive],
      leadHistory: [resolution, ...db.leadHistory.filter(entry => entry.leadId !== lead.id)],
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Лид ${lead.name} перенесён в архив`, when: todayISO() }],
    };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok) {
      if (result.reason === "error") {
        window.alert("Не удалось переместить лида в архив. Изменение сохранено локально, проверьте доступ к базе данных.");
      }
      return;
    }
  };

  const removeLead = async (lead: Lead) => {
    if (!window.confirm("Удалить лид?")) return;
    const next = {
      ...db,
      leads: db.leads.filter(l => l.id !== lead.id),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Удалён лид ${lead.id}`, when: todayISO() }],
    };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok && result.reason === "error") {
      window.alert("Не удалось удалить лида. Проверьте доступ к базе данных.");
    }
  };
  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Лиды"]} />
      <div className="flex flex-wrap gap-2 items-center">
        <Chip
          active={selectedArea === null && selectedGroup === null}
          onClick={() => {
            setSelectedArea(null);
            setSelectedGroup(null);
          }}
        >
          Сбросить фильтры
        </Chip>
        {db.settings.areas.map(area => (
          <Chip
            key={area}
            active={selectedArea === area}
            onClick={() => {
              setSelectedArea(area);
              setSelectedGroup(null);
            }}
          >
            {area}
          </Chip>
        ))}
        <div className="flex-1" />
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={selectedGroup ?? ""}
          onChange={event => {
            const value = event.target.value;
            setSelectedGroup(value ? (value as Group) : null);
          }}
          disabled={!selectedArea || availableGroups.length === 0}
          aria-label="Фильтр по группе"
        >
          <option value="">Все группы</option>
          {availableGroups.map(group => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stages.map(s => {

          const leads: Lead[] = groupedLeads[s] ?? [];

          return (
            <div key={s} className="p-3 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
              <div className="text-xs text-slate-500 mb-2">{s}</div>
              <FixedSizeList
                height={380}
                itemCount={leads.length}
                itemSize={90}
                width="100%"
              >
                {({ index, style }: ListChildComponentProps) => {
                  const l = leads[index];
                  return (
                    <div
                      key={l.id}
                      style={style}
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpen(l)}
                      onKeyDown={event => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setOpen(l);
                        }
                      }}
                      aria-label={l.name}
                      className="group p-2 rounded-xl border border-slate-200 bg-slate-50 transition hover:border-sky-200 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-sky-700 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <div className="text-sm font-medium text-slate-800 transition-colors duration-150 group-hover:text-sky-600 dark:text-slate-100 dark:group-hover:text-sky-300">
                        {l.name}
                      </div>
                      <div className="text-xs text-slate-500">{l.source}{formatLeadContactSummary(l)}</div>
                      <div className="text-xs text-slate-500">
                        {(l.area?.trim() || "—") + " · " + (l.group?.trim() || "—")}
                      </div>
                      <div className="flex gap-1 mt-2">
                        <button
                          onClick={event => {
                            event.stopPropagation();
                            void move(l.id, -1);
                          }}
                          className="px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800"
                        >
                          ◀
                        </button>
                        <button
                          onClick={event => {
                            event.stopPropagation();
                            void move(l.id, +1);
                          }}
                          className="px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800"
                        >
                          ▶
                        </button>
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
          onEdit={() => {
            setEditing(open);
            setOpen(null);
          }}
          onConvert={() => {
            setOpen(null);
            void convertLead(open);
          }}
          onArchive={() => {
            setOpen(null);
            void archiveLead(open);
          }}
          onRemove={() => {
            setOpen(null);
            void removeLead(open);
          }}
        />
      )}
      {editing && (
        <LeadFormModal
          lead={editing}
          db={db}
          stages={stages}
          onSave={async values => {
            await saveLead(editing, values);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

const CONTACT_CHANNELS: ContactChannel[] = ["Telegram", "WhatsApp", "Instagram"];
const SUBSCRIPTION_PLAN_VALUES = SUBSCRIPTION_PLANS.map(option => option.value as SubscriptionPlan);

function convertLeadToClient(lead: Lead, db: DB): Client {
  const fallbackDate = lead.updatedAt ?? todayISO();
  const area = lead.area ?? db.settings.areas[0];
  const group = lead.group ?? db.settings.groups[0];
  const coach =
    db.staff.find(member => member.role === "Тренер" && member.areas.includes(area) && member.groups.includes(group)) ??
    db.staff.find(member => member.role === "Тренер");
  const rawPlan = lead.subscriptionPlan ?? DEFAULT_SUBSCRIPTION_PLAN;
  const allowedPlans = getAllowedSubscriptionPlansForGroup(group);
  const defaultPlan = getDefaultSubscriptionPlanForGroup(group);
  const subscriptionPlan = allowedPlans.includes(rawPlan)
    ? rawPlan
    : allowedPlans[0] ?? defaultPlan ?? DEFAULT_SUBSCRIPTION_PLAN;
  const expectedAmount = getSubscriptionPlanAmountForGroup(area, group, subscriptionPlan);
  const resolvedExpectedAmount =
    expectedAmount != null ? expectedAmount : getGroupDefaultExpectedAmount(area, group);

  const rawName = (lead.firstName ?? lead.name ?? "Новый клиент").trim();
  const nameParts = rawName.split(/\s+/).filter(Boolean);
  const firstName = lead.firstName ?? nameParts[0] ?? "Новый";
  const lastName = lead.lastName ?? (nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined);
  const clientId = uid();

  const primaryPlacement: ClientPlacement = {
    id: `placement-${clientId}`,
    area,
    group,
    payMethod: "перевод",
    payStatus: "ожидание",
    status: "новый",
    subscriptionPlan,
    payDate: fallbackDate,
    ...(resolvedExpectedAmount != null
      ? { payAmount: resolvedExpectedAmount, payActual: resolvedExpectedAmount }
      : {}),
  };

  const client: Client = {
    id: clientId,
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
    payMethod: primaryPlacement.payMethod,
    payStatus: "ожидание",
    status: "новый",
    subscriptionPlan,
    payDate: fallbackDate,
    ...(resolvedExpectedAmount != null
      ? { payAmount: resolvedExpectedAmount, payActual: resolvedExpectedAmount }
      : {}),
    placements: [primaryPlacement],
  };

  return client;
}

function formatLeadContactSummary(lead: Lead): string {
  const contact = [lead.phone, lead.whatsApp, lead.telegram, lead.instagram].find(value => value?.trim().length);
  return contact ? ` · ${contact}` : "";
}

function makeLeadHistoryEntry(lead: Lead, outcome: LeadLifecycleOutcome): LeadLifecycleEvent {
  return {
    id: uid(),
    leadId: lead.id,
    name: lead.name,
    source: lead.source,
    area: lead.area,
    group: lead.group,
    createdAt: lead.createdAt ?? lead.updatedAt,
    resolvedAt: todayISO(),
    outcome,
  };
}

const toLeadFormValues = (
  current: Lead,
  defaults: { area: string; group: string },
): LeadFormValues => {
  const [firstName = "", ...restName] = (current.firstName ?? current.name ?? "").split(/\s+/).filter(Boolean);
  const resolvedGroup = current.group ?? defaults.group;
  const allowedPlans = getAllowedSubscriptionPlansForGroup(resolvedGroup);
  const defaultPlan = getDefaultSubscriptionPlanForGroup(resolvedGroup);
  const rawPlan = current.subscriptionPlan ?? DEFAULT_SUBSCRIPTION_PLAN;
  const subscriptionPlan = allowedPlans.includes(rawPlan)
    ? rawPlan
    : allowedPlans[0] ?? defaultPlan ?? DEFAULT_SUBSCRIPTION_PLAN;
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
    group: resolvedGroup,
    stage: current.stage,
    subscriptionPlan,
    birthDate: current.birthDate ? current.birthDate.slice(0, 10) : "",
    startDate: current.startDate ? current.startDate.slice(0, 10) : "",
    notes: current.notes ?? "",
  };
};


function LeadModal({
  lead,
  onClose,
  onEdit,
  onConvert,
  onArchive,
  onRemove,
}: {
  lead: Lead;
  onClose: () => void;
  onEdit: () => void;
  onConvert: () => void;
  onArchive: () => void;
  onRemove: () => void;
}) {
  return (
    <Modal size="lg" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{lead.name}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{lead.stage}</div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Закрыть
          </button>
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
          <InfoRow
            label="Форма абонемента"
            value={lead.subscriptionPlan ? getSubscriptionPlanMeta(lead.subscriptionPlan)?.label ?? "—" : "—"}
          />
          <InfoRow label="Дата рождения" value={lead.birthDate ? fmtDate(lead.birthDate) : "—"} />
          <InfoRow label="Старт" value={lead.startDate ? fmtDate(lead.startDate) : "—"} />
          <InfoRow label="Создан" value={fmtDate(lead.createdAt)} />
          <InfoRow label="Обновлён" value={fmtDate(lead.updatedAt)} />
        </div>

        <InfoRow
          label="Заметки"
          value={lead.notes ? <span className="whitespace-pre-line">{lead.notes}</span> : "—"}
        />

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <button
            onClick={onEdit}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Редактировать
          </button>
          <button
            onClick={onConvert}
            className="px-3 py-2 rounded-md bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            Оплаченный лид
          </button>
          <button
            onClick={onArchive}
            className="px-3 py-2 rounded-md border border-amber-300 text-sm text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/30"
          >
            Отмена
          </button>
          <button
            onClick={onRemove}
            className="px-3 py-2 rounded-md border border-rose-200 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/30"
          >
            Удалить
          </button>
        </div>
      </div>
    </Modal>
  );
}

function LeadFormModal({
  lead,
  db,
  stages,
  onSave,
  onClose,
}: {
  lead: Lead;
  db: DB;
  stages: LeadStage[];
  onSave: (values: LeadFormValues) => Promise<void> | void;
  onClose: () => void;
}) {
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
      subscriptionPlan: yup
        .string()
        .oneOf(SUBSCRIPTION_PLAN_VALUES, "Выберите форму абонемента")
        .required("Выберите форму абонемента"),
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

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<LeadFormValues>({
    resolver,
    mode: "onChange",
    defaultValues: toLeadFormValues(lead, { area: defaultArea, group: defaultGroup }),
  });

  useEffect(() => {
    reset(toLeadFormValues(lead, { area: defaultArea, group: defaultGroup }));
  }, [lead, reset, defaultArea, defaultGroup]);

  const submit = async (data: LeadFormValues) => {
    await onSave({
      ...data,
      area: data.area || defaultArea,
      group: data.group || defaultGroup,
    });
    onClose();
  };

  const currentGroup = watch("group");
  const currentPlan = watch("subscriptionPlan");
  const allowedPlans = useMemo(
    () => getAllowedSubscriptionPlansForGroup(currentGroup || undefined),
    [currentGroup],
  );
  const allowedPlanSet = useMemo(() => new Set(allowedPlans), [allowedPlans]);
  const fallbackPlan = useMemo(() => {
    const preferred = getDefaultSubscriptionPlanForGroup(currentGroup || undefined);
    if (allowedPlanSet.size === 0) {
      return preferred;
    }
    if (preferred && allowedPlanSet.has(preferred)) {
      return preferred;
    }
    return allowedPlans[0] ?? preferred;
  }, [allowedPlanSet, allowedPlans, currentGroup]);

  useEffect(() => {
    if (allowedPlans.length === 0) {
      return;
    }
    const normalizedPlan = (currentPlan || "") as SubscriptionPlan | "";
    if (!normalizedPlan || !allowedPlanSet.has(normalizedPlan as SubscriptionPlan)) {
      const nextPlan = fallbackPlan ?? DEFAULT_SUBSCRIPTION_PLAN;
      if (nextPlan && nextPlan !== normalizedPlan) {
        setValue("subscriptionPlan", nextPlan, { shouldDirty: Boolean(normalizedPlan), shouldValidate: true });
      }
    }
  }, [allowedPlanSet, allowedPlans, currentPlan, fallbackPlan, setValue]);

  const planOptions = useMemo(() => {
    if (allowedPlans.length === 0) {
      return SUBSCRIPTION_PLANS;
    }
    return SUBSCRIPTION_PLANS.filter(option => allowedPlanSet.has(option.value));
  }, [allowedPlanSet, allowedPlans]);

  const labelClass = "text-xs text-slate-500 dark:text-slate-400";
  const fieldClass =
    "px-3 py-2 rounded-md border border-slate-300 bg-white placeholder:text-slate-400 " +
    "dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500";
  const selectClass = `${fieldClass} appearance-none`;

  return (
    <Modal size="xl" onClose={onClose}>
      <div className="font-semibold text-slate-800 dark:text-slate-100">Редактирование лида</div>
      <form onSubmit={handleSubmit(submit)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-col gap-1">
            <label className={labelClass}>Название карточки</label>
            <input className={fieldClass} {...register("name")} placeholder="Имя" />
            {errors.name && <span className="text-xs text-rose-600">{errors.name.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Имя ребёнка</label>
            <input className={fieldClass} {...register("firstName")} placeholder="Имя ребёнка" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Фамилия</label>
            <input className={fieldClass} {...register("lastName")} placeholder="Фамилия" />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1">
            <label className={labelClass}>Родитель</label>
            <input className={fieldClass} {...register("parentName")} placeholder="Родитель" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Статус лида</label>
            <select className={selectClass} {...register("stage")}>
              {stages.map(stage => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
            {errors.stage && <span className="text-xs text-rose-600">{errors.stage.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Источник</label>
            <select className={selectClass} {...register("source")}>
              {CONTACT_CHANNELS.map(channel => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
            {errors.source && <span className="text-xs text-rose-600">{errors.source.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Район</label>
            <select className={selectClass} {...register("area")}>
              {db.settings.areas.map(area => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
            {errors.area && <span className="text-xs text-rose-600">{errors.area.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Группа</label>
            <select className={selectClass} {...register("group")}>
              {db.settings.groups.map(group => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
            {errors.group && <span className="text-xs text-rose-600">{errors.group.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Форма абонемента</label>
            <select className={selectClass} {...register("subscriptionPlan")}>
              {planOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.subscriptionPlan && (
              <span className="text-xs text-rose-600">{errors.subscriptionPlan.message}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Дата рождения</label>
            <input type="date" className={fieldClass} {...register("birthDate")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Дата старта</label>
            <input type="date" className={fieldClass} {...register("startDate")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Телефон</label>
            <input className={fieldClass} {...register("phone")} placeholder="Телефон" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>WhatsApp</label>
            <input className={fieldClass} {...register("whatsApp")} placeholder="WhatsApp" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Telegram</label>
            <input className={fieldClass} {...register("telegram")} placeholder="Telegram" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Instagram</label>
            <input className={fieldClass} {...register("instagram")} placeholder="Instagram" />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1">
            <label className={labelClass}>Заметки</label>
            <textarea rows={4} className={fieldClass} {...register("notes")} placeholder="Заметки" />
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
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Отмена
          </button>
        </div>
      </form>
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
