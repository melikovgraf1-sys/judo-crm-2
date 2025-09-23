import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import Modal from "../Modal";
import { todayISO } from "../../state/utils";
import { getDefaultPayAmount, shouldAllowCustomPayAmount } from "../../state/payments";
import { buildGroupsByArea, estimateGroupRemainingLessonsByParams, requiresManualRemainingLessons } from "../../state/lessons";
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
      };
      reset(values);
    } else {
      reset(blankForm());
    }
  }, [editing, reset, blankForm]);

  const selectedGroup = watch("group");
  const currentPayAmount = watch("payAmount");
  const selectedArea = watch("area");
  const manualRemaining = requiresManualRemainingLessons(selectedGroup);
  const areaGroups = useMemo(() => {
    const manualGroups = db.settings.groups.filter(groupName => requiresManualRemainingLessons(groupName));
    if (!selectedArea) {
      return Array.from(new Set([...db.settings.groups, ...manualGroups]));
    }
    const scheduled = groupsByArea.get(selectedArea) ?? [];
    return Array.from(new Set([...scheduled, ...manualGroups]));
  }, [db.settings.groups, groupsByArea, selectedArea]);
  const selectedPayDate = watch("payDate");
  const computedRemaining = useMemo(() => {
    if (manualRemaining) return null;
    if (!selectedArea || !selectedGroup) return null;
    return (
      estimateGroupRemainingLessonsByParams(selectedArea, selectedGroup, selectedPayDate, db.schedule) ?? null
    );
  }, [db.schedule, manualRemaining, selectedArea, selectedGroup, selectedPayDate]);
  const canEditPayAmount = shouldAllowCustomPayAmount(selectedGroup);
  const defaultPayAmount = getDefaultPayAmount(selectedGroup);
  const prevGroupRef = useRef<string | null>(null);
  const prevAreaRef = useRef<string | null>(null);

  useEffect(() => {
    const previousGroup = prevGroupRef.current;
    prevGroupRef.current = selectedGroup ?? null;

    if (!canEditPayAmount && defaultPayAmount != null) {
      const targetValue = String(defaultPayAmount);
      if (currentPayAmount !== targetValue) {
        setValue("payAmount", targetValue, { shouldDirty: true, shouldValidate: false });
      }
      return;
    }

    if (canEditPayAmount && defaultPayAmount != null) {
      const switchedGroup = previousGroup !== selectedGroup;
      if (!currentPayAmount || switchedGroup) {
        setValue("payAmount", String(defaultPayAmount), { shouldDirty: false, shouldValidate: false });
      }
    }
  }, [canEditPayAmount, defaultPayAmount, currentPayAmount, selectedGroup, setValue]);

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

  return (
    <Modal size="xl" onClose={onClose}>
      <div className="font-semibold text-slate-800">{editing ? "Редактирование клиента" : "Новый клиент"}</div>
      <form onSubmit={handleSubmit(onSave)} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Имя</label>
            <input className="px-3 py-2 rounded-md border border-slate-300" {...register("firstName")} />
            {errors.firstName && <span className="text-xs text-rose-600">{errors.firstName.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Фамилия</label>
            <input className="px-3 py-2 rounded-md border border-slate-300" {...register("lastName")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Телефон</label>
            <input className="px-3 py-2 rounded-md border border-slate-300" {...register("phone")} />
            {errors.phone && <span className="text-xs text-rose-600">{errors.phone.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">WhatsApp</label>
            <input className="px-3 py-2 rounded-md border border-slate-300" {...register("whatsApp")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Telegram</label>
            <input className="px-3 py-2 rounded-md border border-slate-300" {...register("telegram")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Instagram</label>
            <input className="px-3 py-2 rounded-md border border-slate-300" {...register("instagram")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Канал</label>
            <select className="px-3 py-2 rounded-md border border-slate-300" {...register("channel")}>
              <option>Telegram</option>
              <option>WhatsApp</option>
              <option>Instagram</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Пол</label>
            <select className="px-3 py-2 rounded-md border border-slate-300" {...register("gender")}>
              <option value="м">м</option>
              <option value="ж">ж</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Район</label>
            <select className="px-3 py-2 rounded-md border border-slate-300" {...register("area")}>
              {db.settings.areas.map(a => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Группа</label>
            <select className="px-3 py-2 rounded-md border border-slate-300" {...register("group")}>
              {areaGroups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Дата рождения</label>
            <input type="date" className="px-3 py-2 rounded-md border border-slate-300" {...register("birthDate")} />
            {errors.birthDate && <span className="text-xs text-rose-600">{errors.birthDate.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Дата начала</label>
            <input type="date" className="px-3 py-2 rounded-md border border-slate-300" {...register("startDate")} />
            {errors.startDate && <span className="text-xs text-rose-600">{errors.startDate.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Способ оплаты</label>
            <select className="px-3 py-2 rounded-md border border-slate-300" {...register("payMethod")}>
              <option>перевод</option>
              <option>наличные</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Статус оплаты</label>
            <select className="px-3 py-2 rounded-md border border-slate-300" {...register("payStatus")}>
              <option>ожидание</option>
              <option>действует</option>
              <option>задолженность</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Статус</label>
            <select className="px-3 py-2 rounded-md border border-slate-300" {...register("status")}>
              <option value="действующий">действующий</option>
              <option value="отмена">отмена</option>
              <option value="новый">новый</option>
              <option value="вернувшийся">вернувшийся</option>
              <option value="продлившийся">продлившийся</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Дата оплаты</label>
            <input type="date" className="px-3 py-2 rounded-md border border-slate-300" {...register("payDate")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Сумма оплаты, €</label>
            <input
              type="number"
              inputMode="decimal"
              className="px-3 py-2 rounded-md border border-slate-300"
              {...register("payAmount")}
              disabled={!canEditPayAmount && defaultPayAmount != null}
              placeholder="Укажите сумму"
            />
            {!canEditPayAmount && defaultPayAmount != null && (
              <span className="text-xs text-slate-500">Сумма фиксирована для этой группы</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Остаток занятий</label>
            {manualRemaining ? (
              <input
                type="number"
                inputMode="numeric"
                className="px-3 py-2 rounded-md border border-slate-300"
                {...register("remainingLessons")}
                placeholder="Укажите количество"
              />
            ) : (
              <input
                type="text"
                value={computedRemaining != null ? String(computedRemaining) : "—"}
                readOnly
                className="px-3 py-2 rounded-md border border-slate-300 bg-slate-100 text-slate-600"
              />
            )}
            {!manualRemaining && (
              <span className="text-xs text-slate-500">Значение рассчитывается автоматически от даты оплаты</span>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300">
            Отмена
          </button>
          <button
            type="submit"
            disabled={!isValid}
            className="px-3 py-2 rounded-md bg-sky-600 text-white disabled:bg-slate-400"
          >
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}

