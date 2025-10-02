import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import Modal from "../Modal";
import { todayISO } from "../../state/utils";
import {
  DEFAULT_SUBSCRIPTION_PLAN,
  SUBSCRIPTION_PLANS,
  getDefaultPayAmount,
  getSubscriptionPlanAmount,
  shouldAllowCustomPayAmount,
  subscriptionPlanAllowsCustomAmount,
  subscriptionPlanRequiresManualRemainingLessons,
} from "../../state/payments";
import {
  buildGroupsByArea,
  estimateGroupRemainingLessonsByParams,
  requiresManualRemainingLessons,
} from "../../state/lessons";
import type { Area, DB, Client, ClientFormValues, Group } from "../../types";

type Props = {
  db: DB,
  editing: Client | null,
  onSave: (data: ClientFormValues) => void,
  onClose: () => void,
};

export default function ClientForm({ db, editing, onSave, onClose }: Props) {
  const groupsByArea = useMemo(() => buildGroupsByArea(db.schedule), [db.schedule]);
  const firstAreaWithSchedule = useMemo(() => {
    for (const [area] of groupsByArea) {
      return area;
    }
    return db.settings.areas[0];
  }, [db.settings.areas, groupsByArea]);

  const firstGroupForArea = useCallback(
    (area: Area | undefined): Group => {
      if (area) {
        const fromSchedule = groupsByArea.get(area);
        if (fromSchedule?.length) {
          return fromSchedule[0];
        }
      }
      return db.settings.groups[0];
    },
    [db.settings.groups, groupsByArea],
  );

  const blankForm = useCallback((): ClientFormValues => ({
    firstName: "",
    lastName: "",
    phone: "",
    whatsApp: "",
    telegram: "",
    instagram: "",
    gender: "м",
    area: firstAreaWithSchedule ?? db.settings.areas[0],
    group: firstGroupForArea(firstAreaWithSchedule ?? db.settings.areas[0]),
    channel: "Telegram",
    startDate: todayISO().slice(0, 10),
    payMethod: "перевод",
    payStatus: "ожидание",
    status: "новый",
    birthDate: "2017-01-01",
    payDate: todayISO().slice(0, 10),
    parentName: "",
    payAmount: String(getDefaultPayAmount(db.settings.groups[0]) ?? ""),
    remainingLessons: "",
    subscriptionPlan: DEFAULT_SUBSCRIPTION_PLAN,
  }), [db.settings.areas, db.settings.groups, firstAreaWithSchedule, firstGroupForArea]);

  const schema = yup.object({
    firstName: yup.string().required("Имя обязательно"),
    phone: yup.string().trim(),
    whatsApp: yup.string().trim(),
    telegram: yup.string().trim(),
    instagram: yup.string().trim(),
    birthDate: yup
      .string()
      .required("Дата рождения обязательна")
      .matches(/\d{4}-\d{2}-\d{2}/, "Неверный формат даты"),
    startDate: yup
      .string()
      .required("Дата начала обязательна")
      .matches(/\d{4}-\d{2}-\d{2}/, "Неверный формат даты"),
  }).test("contact-required", "Укажите хотя бы один контакт", function (value) {
    if (!value) return false;
    const { phone, whatsApp, telegram, instagram } = value as ClientFormValues;
    if ([phone, whatsApp, telegram, instagram].some(field => field?.trim().length)) {
      return true;
    }
    return this.createError({ path: "phone", message: "Укажите хотя бы один контакт" });
  });

  const resolver = yupResolver(schema) as unknown as Resolver<ClientFormValues>;

  const { register, handleSubmit, reset, formState: { errors, isValid }, watch, setValue } = useForm<ClientFormValues>({
    resolver,
    mode: "onChange",
    defaultValues: blankForm(),
  });

  useEffect(() => {
    if (editing) {
      const values: ClientFormValues = {
        firstName: editing.firstName,
        lastName: editing.lastName ?? "",
        phone: editing.phone ?? "",
        whatsApp: editing.whatsApp ?? "",
        telegram: editing.telegram ?? "",
        instagram: editing.instagram ?? "",
        gender: editing.gender,
        area: editing.area,
        group: editing.group,
        channel: editing.channel,
        startDate: editing.startDate?.slice(0, 10) ?? "",
        payMethod: editing.payMethod,
        payStatus: editing.payStatus,
        status: editing.status ?? "действующий",
        birthDate: editing.birthDate?.slice(0, 10) ?? "",
        payDate: editing.payDate?.slice(0, 10) ?? "",
        parentName: editing.parentName ?? "",
        payAmount: editing.payAmount != null ? String(editing.payAmount) : String(getDefaultPayAmount(editing.group) ?? ""),
        remainingLessons: editing.remainingLessons != null ? String(editing.remainingLessons) : "",
        subscriptionPlan: editing.subscriptionPlan ?? DEFAULT_SUBSCRIPTION_PLAN,
      };
      reset(values);
    } else {
      reset(blankForm());
    }
  }, [editing, reset, blankForm]);

  const selectedGroup = watch("group");
  const currentPayAmount = watch("payAmount");
  const subscriptionPlan = watch("subscriptionPlan");
  const selectedArea = watch("area");
  const planRequiresManual = subscriptionPlanRequiresManualRemainingLessons(subscriptionPlan);
  const manualRemaining = requiresManualRemainingLessons(selectedGroup) || planRequiresManual;
  const areaGroups = useMemo(() => {
    const manualGroups = db.settings.groups.filter(groupName => requiresManualRemainingLessons(groupName));
    if (!selectedArea) {
      return Array.from(new Set([...db.settings.groups, ...manualGroups]));
    }
    const scheduled = groupsByArea.get(selectedArea) ?? [];
    return Array.from(new Set([...scheduled, ...manualGroups]));
  }, [db.settings.groups, groupsByArea, selectedArea]);
  const selectedPayDate = watch("payDate");
  const groupAllowsCustom = selectedGroup ? shouldAllowCustomPayAmount(selectedGroup) : false;
  const planAllowsCustom = subscriptionPlanAllowsCustomAmount(subscriptionPlan);
  const subscriptionPlanAmount = getSubscriptionPlanAmount(subscriptionPlan);
  const computedRemaining = useMemo(() => {
    if (manualRemaining) return null;
    if (!selectedArea || !selectedGroup) return null;
    return (
      estimateGroupRemainingLessonsByParams(selectedArea, selectedGroup, selectedPayDate, db.schedule) ?? null
    );
  }, [db.schedule, manualRemaining, selectedArea, selectedGroup, selectedPayDate]);
  const canEditPayAmount = groupAllowsCustom || planAllowsCustom;
  const defaultPayAmount = getDefaultPayAmount(selectedGroup);
  const prevGroupRef = useRef<string | null>(null);
  const prevAreaRef = useRef<string | null>(null);

  useEffect(() => {
    const previousGroup = prevGroupRef.current;
    prevGroupRef.current = selectedGroup ?? null;

    if (subscriptionPlanAmount != null && !groupAllowsCustom) {
      const targetValue = String(subscriptionPlanAmount);
      if (currentPayAmount !== targetValue) {
        setValue("payAmount", targetValue, { shouldDirty: true, shouldValidate: false });
      }
      return;
    }

    if (!selectedGroup) {
      return;
    }

    if (!groupAllowsCustom && !planAllowsCustom && defaultPayAmount != null) {
      const targetValue = String(defaultPayAmount);
      if (currentPayAmount !== targetValue) {
        setValue("payAmount", targetValue, { shouldDirty: true, shouldValidate: false });
      }
      return;
    }

    if (groupAllowsCustom && defaultPayAmount != null && !planAllowsCustom) {
      const switchedGroup = previousGroup !== selectedGroup;
      if (!currentPayAmount || switchedGroup) {
        setValue("payAmount", String(defaultPayAmount), { shouldDirty: false, shouldValidate: false });
      }
    }
  }, [
    currentPayAmount,
    defaultPayAmount,
    groupAllowsCustom,
    planAllowsCustom,
    selectedGroup,
    setValue,
    subscriptionPlanAmount,
  ]);

  useEffect(() => {
    const previousArea = prevAreaRef.current;
    prevAreaRef.current = selectedArea ?? null;

    if (!selectedArea) {
      return;
    }

    if (!areaGroups.length) {
      return;
    }

    if (!selectedGroup || !areaGroups.includes(selectedGroup)) {
      setValue("group", areaGroups[0], {
        shouldDirty: previousArea !== null && previousArea !== selectedArea,
      });
    }
  }, [areaGroups, selectedArea, selectedGroup, setValue]);

  const labelClass = "text-xs text-slate-500 dark:text-slate-400";
  const fieldClass =
    "px-3 py-2 rounded-md border border-slate-300 bg-white placeholder:text-slate-400 " +
    "dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500";
  const selectClass = `${fieldClass} appearance-none`; // prevent iOS default background from breaking dark theme
  const subtleTextClass = "text-xs text-slate-500 dark:text-slate-400";
  const payAmountLockedByPlan = subscriptionPlanAmount != null && !groupAllowsCustom;

  return (
    <Modal size="xl" onClose={onClose}>
      <div className="font-semibold text-slate-800 dark:text-slate-100">{editing ? "Редактирование клиента" : "Новый клиент"}</div>
      <form onSubmit={handleSubmit(onSave)} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Имя</label>
            <input className={fieldClass} {...register("firstName")} />
            {errors.firstName && <span className="text-xs text-rose-600">{errors.firstName.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Фамилия</label>
            <input className={fieldClass} {...register("lastName")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Родитель</label>
            <input className={fieldClass} {...register("parentName")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Телефон</label>
            <input className={fieldClass} {...register("phone")} />
            {errors.phone && <span className="text-xs text-rose-600">{errors.phone.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>WhatsApp</label>
            <input className={fieldClass} {...register("whatsApp")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Telegram</label>
            <input className={fieldClass} {...register("telegram")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Instagram</label>
            <input className={fieldClass} {...register("instagram")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Канал</label>
            <select className={selectClass} {...register("channel")}>
              <option>Telegram</option>
              <option>WhatsApp</option>
              <option>Instagram</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Пол</label>
            <select className={selectClass} {...register("gender")}>
              <option value="м">м</option>
              <option value="ж">ж</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Район</label>
            <select className={selectClass} {...register("area")}>
              {db.settings.areas.map(a => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Группа</label>
            <select className={selectClass} {...register("group")}>
              {areaGroups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Дата рождения</label>
            <input type="date" className={fieldClass} {...register("birthDate")} />
            {errors.birthDate && <span className="text-xs text-rose-600">{errors.birthDate.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Дата начала</label>
            <input type="date" className={fieldClass} {...register("startDate")} />
            {errors.startDate && <span className="text-xs text-rose-600">{errors.startDate.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Способ оплаты</label>
            <select className={selectClass} {...register("payMethod")}>
              <option>перевод</option>
              <option>наличные</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Статус оплаты</label>
            <select className={selectClass} {...register("payStatus")}>
              <option>ожидание</option>
              <option>действует</option>
              <option>задолженность</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Статус</label>
            <select className={selectClass} {...register("status")}>
              <option value="действующий">действующий</option>
              <option value="отмена">отмена</option>
              <option value="новый">новый</option>
              <option value="вернувшийся">вернувшийся</option>
              <option value="продлившийся">продлившийся</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Форма абонемента</label>
            <select className={selectClass} {...register("subscriptionPlan")}>
              {SUBSCRIPTION_PLANS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Дата оплаты</label>
            <input type="date" className={fieldClass} {...register("payDate")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Сумма оплаты, €</label>
            <input
              type="number"
              inputMode="decimal"
              className={fieldClass}
              {...register("payAmount")}
              disabled={!canEditPayAmount && defaultPayAmount != null}
              placeholder="Укажите сумму"
            />
            {!canEditPayAmount && defaultPayAmount != null && (
              <span className={subtleTextClass}>
                {payAmountLockedByPlan ? "Сумма выбрана формой абонемента" : "Сумма фиксирована для этой группы"}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Остаток занятий</label>
            {manualRemaining ? (
              <input
                type="number"
                inputMode="numeric"
                className={fieldClass}
                {...register("remainingLessons")}
                placeholder="Укажите количество"
              />
            ) : (
              <input
                type="text"
                value={computedRemaining != null ? String(computedRemaining) : "—"}
                readOnly
                className="px-3 py-2 rounded-md border border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              />
            )}
            {!manualRemaining && (
              <span className={subtleTextClass}>Значение рассчитывается автоматически от даты оплаты</span>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={!isValid}
            className="px-3 py-2 rounded-md bg-sky-600 text-white disabled:bg-slate-400 dark:disabled:bg-slate-600"
          >
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}

