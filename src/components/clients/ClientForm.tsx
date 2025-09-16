import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import Modal from "../Modal";
import { todayISO } from "../../state/utils";
import type { DB, Client, ClientFormValues } from "../../types";

type Props = {
  db: DB,
  editing: Client | null,
  onSave: (data: ClientFormValues) => void,
  onClose: () => void,
};

export default function ClientForm({ db, editing, onSave, onClose }: Props) {
  const blankForm = (): ClientFormValues => ({
    firstName: "",
    lastName: "",
    phone: "",
    gender: "м",
    area: db.settings.areas[0],
    group: db.settings.groups[0],
    channel: "Telegram",
    startDate: todayISO().slice(0, 10),
    payMethod: "перевод",
    payStatus: "ожидание",
    birthDate: "2017-01-01",
    payDate: todayISO().slice(0, 10),
    parentName: "",
  });

  const schema = yup.object({
    firstName: yup.string().required("Имя обязательно"),
    phone: yup.string().required("Телефон обязателен"),
    birthDate: yup
      .string()
      .required("Дата рождения обязательна")
      .matches(/\d{4}-\d{2}-\d{2}/, "Неверный формат даты"),
    startDate: yup
      .string()
      .required("Дата начала обязательна")
      .matches(/\d{4}-\d{2}-\d{2}/, "Неверный формат даты"),
  });

  const resolver = yupResolver(schema) as unknown as Resolver<ClientFormValues>;

  const { register, handleSubmit, reset, formState: { errors, isValid } } = useForm<ClientFormValues>({
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
        gender: editing.gender,
        area: editing.area,
        group: editing.group,
        channel: editing.channel,
        startDate: editing.startDate?.slice(0, 10) ?? "",
        payMethod: editing.payMethod,
        payStatus: editing.payStatus,
        birthDate: editing.birthDate?.slice(0, 10) ?? "",
        payDate: editing.payDate?.slice(0, 10) ?? "",
        parentName: editing.parentName ?? "",
      };
      reset(values);
    } else {
      reset(blankForm());
    }
  }, [editing, reset, db.settings.areas, db.settings.groups]);

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
              {db.settings.groups.map(g => (
                <option key={g}>{g}</option>
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

