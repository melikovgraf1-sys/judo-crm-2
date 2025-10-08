import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import type {
  Control,
  FieldErrors,
  Resolver,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import Modal from "../Modal";
import { todayISO, uid } from "../../state/utils";
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
import type {
  Area,
  DB,
  Client,
  ClientFormValues,
  ClientPlacementFormValues,
  Group,
  SubscriptionPlan,
} from "../../types";

type Props = {
  db: DB;
  editing: Client | null;
  onSave: (data: ClientFormValues) => void;
  onClose: () => void;
};

const MAX_PLACEMENTS = 4;
const MAX_AREAS = 3;

type PlacementFieldErrors = FieldErrors<ClientFormValues>["placements"];

type PlacementFieldProps = {
  index: number;
  db: DB;
  control: Control<ClientFormValues>;
  register: UseFormRegister<ClientFormValues>;
  setValue: UseFormSetValue<ClientFormValues>;
  errors: PlacementFieldErrors;
  areaOptions: Area[];
  groupsByArea: Map<Area, Group[]>;
  onRemove?: () => void;
  isPrimary: boolean;
};

const makePlacement = (
  groupsByArea: Map<Area, Group[]>,
  db: DB,
  area?: Area,
): ClientPlacementFormValues => {
  const availableAreas = db.settings.areas;
  const resolvedArea = area ?? groupsByArea.keys().next().value ?? availableAreas[0];
  const groups = groupsByArea.get(resolvedArea) ?? groupsByArea.values().next().value ?? db.settings.groups;
  const resolvedGroup = groups?.[0] ?? db.settings.groups[0];

  return {
    id: `placement-${uid()}`,
    area: resolvedArea,
    group: resolvedGroup,
    payStatus: "ожидание",
    status: "новый",
    subscriptionPlan: DEFAULT_SUBSCRIPTION_PLAN,
    payDate: todayISO().slice(0, 10),
    payAmount: String(getDefaultPayAmount(resolvedGroup) ?? ""),
    payActual: "",
    remainingLessons: "",
  };
};

const placementSchema: yup.ObjectSchema<ClientPlacementFormValues> = yup.object({
  id: yup.string().required(),
  area: yup.string().required("Укажите район"),
  group: yup.string().required("Укажите группу"),
  payStatus: yup
    .mixed<ClientPlacementFormValues["payStatus"]>()
    .oneOf(["ожидание", "действует", "задолженность"], "Укажите статус оплаты")
    .required("Укажите статус оплаты"),
  status: yup
    .mixed<ClientPlacementFormValues["status"]>()
    .oneOf(["действующий", "отмена", "новый", "вернувшийся", "продлившийся"], "Укажите статус")
    .required("Укажите статус"),
  subscriptionPlan: yup
    .mixed<ClientPlacementFormValues["subscriptionPlan"]>()
    .oneOf(
      SUBSCRIPTION_PLANS.map(option => option.value as SubscriptionPlan),
      "Выберите форму абонемента",
    )
    .required("Выберите форму абонемента"),
  payDate: yup.string().default(""),
  payAmount: yup.string().default(""),
  payActual: yup.string().default(""),
  remainingLessons: yup.string().default(""),
});

export default function ClientForm({ db, editing, onSave, onClose }: Props) {
  const groupsByArea = useMemo(() => buildGroupsByArea(db.schedule), [db.schedule]);
  const blankForm = useCallback((): ClientFormValues => ({
    firstName: "",
    lastName: "",
    phone: "",
    whatsApp: "",
    telegram: "",
    instagram: "",
    comment: "",
    gender: "м",
    channel: "Telegram",
    birthDate: "2017-01-01",
    parentName: "",
    startDate: todayISO().slice(0, 10),
    payMethod: "перевод",
    placements: [makePlacement(groupsByArea, db)],
  }), [db, groupsByArea]);

  const schema = yup
    .object({
      firstName: yup.string().required("Имя обязательно"),
      phone: yup.string().trim(),
      whatsApp: yup.string().trim(),
      telegram: yup.string().trim(),
      instagram: yup.string().trim(),
      comment: yup.string().trim(),
      birthDate: yup
        .string()
        .required("Дата рождения обязательна")
        .matches(/\d{4}-\d{2}-\d{2}/, "Неверный формат даты"),
      startDate: yup
        .string()
        .required("Дата начала обязательна")
        .matches(/\d{4}-\d{2}-\d{2}/, "Неверный формат даты"),
      placements: yup
        .array()
        .of(placementSchema)
        .min(1, "Добавьте хотя бы одно тренировочное место")
        .max(MAX_PLACEMENTS, `Не более ${MAX_PLACEMENTS} тренировочных мест`)
        .test("area-limit", "Можно выбрать максимум 3 района", placements => {
          if (!placements) return false;
          const unique = new Set(placements.map(p => p?.area).filter(Boolean));
          return unique.size <= MAX_AREAS;
        }),
    })
    .test("contact-required", "Укажите хотя бы один контакт", value => {
      if (!value) return false;
      const { phone, whatsApp, telegram, instagram } = value as ClientFormValues;
      return [phone, whatsApp, telegram, instagram].some(field => field?.trim().length);
    });

  const resolver = yupResolver(schema) as unknown as Resolver<ClientFormValues>;

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
    setValue,
  } = useForm<ClientFormValues>({
    resolver,
    mode: "onChange",
    defaultValues: blankForm(),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "placements" });

  useEffect(() => {
    if (editing) {
      const placements = (editing.placements && editing.placements.length
        ? editing.placements
        : [
            {
              id: editing.id,
              area: editing.area,
              group: editing.group,
              payStatus: editing.payStatus,
              status: editing.status,
              subscriptionPlan: editing.subscriptionPlan ?? DEFAULT_SUBSCRIPTION_PLAN,
              payDate: editing.payDate?.slice(0, 10) ?? todayISO().slice(0, 10),
              payAmount: editing.payAmount != null ? String(editing.payAmount) : "",
              payActual: editing.payActual != null ? String(editing.payActual) : "",
              remainingLessons: editing.remainingLessons != null ? String(editing.remainingLessons) : "",
            },
          ]).map(item => ({
        ...item,
        payDate: item.payDate?.slice(0, 10) ?? "",
      }));

      const values: ClientFormValues = {
        firstName: editing.firstName,
        lastName: editing.lastName ?? "",
        phone: editing.phone ?? "",
        whatsApp: editing.whatsApp ?? "",
        telegram: editing.telegram ?? "",
        instagram: editing.instagram ?? "",
        comment: editing.comment ?? "",
        channel: editing.channel,
        birthDate: editing.birthDate?.slice(0, 10) ?? todayISO().slice(0, 10),
        parentName: editing.parentName ?? "",
        gender: editing.gender,
        startDate: editing.startDate?.slice(0, 10) ?? todayISO().slice(0, 10),
        payMethod: editing.payMethod,
        placements: placements as ClientPlacementFormValues[],
      };

      reset(values, { keepDefaultValues: false });
    } else {
      reset(blankForm(), { keepDefaultValues: false });
    }
  }, [blankForm, editing, reset]);

  const placementsWatch = useWatch({ control, name: "placements" });
  const uniqueAreas = useMemo(() => new Set((placementsWatch ?? []).map(p => p?.area).filter(Boolean)), [
    placementsWatch,
  ]);
  const areaLimitExceeded = uniqueAreas.size > MAX_AREAS;

  const labelClass = "text-xs text-slate-500 dark:text-slate-400";
  const fieldClass =
    "px-3 py-2 rounded-md border border-slate-300 bg-white placeholder:text-slate-400 " +
    "dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500";
  const selectClass = `${fieldClass} appearance-none`;

  const onSubmit = handleSubmit(onSave);

  const addPlacement = () => {
    append(makePlacement(groupsByArea, db));
  };

  const disableAddPlacement = fields.length >= MAX_PLACEMENTS;

  return (
    <Modal size="xl" onClose={onClose}>
      <div className="font-semibold text-slate-800 dark:text-slate-100">
        {editing ? "Редактирование клиента" : "Новый клиент"}
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Имя</label>
            <input className={fieldClass} {...register("firstName")} />
            {errors.firstName && (
              <span className="text-xs text-rose-600">{errors.firstName.message}</span>
            )}
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
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className={labelClass}>Комментарий</label>
            <textarea
              className={`${fieldClass} min-h-[96px] resize-y`}
              {...register("comment")}
              placeholder="Свободные примечания"
            />
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
            <label className={labelClass}>Дата рождения</label>
            <input type="date" className={fieldClass} {...register("birthDate")} />
            {errors.birthDate && (
              <span className="text-xs text-rose-600">{errors.birthDate.message}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Дата начала</label>
            <input type="date" className={fieldClass} {...register("startDate")} />
            {errors.startDate && (
              <span className="text-xs text-rose-600">{errors.startDate.message}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Способ оплаты</label>
            <select className={selectClass} {...register("payMethod")}>
              <option>перевод</option>
              <option>наличные</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Тренировочные места
            </div>
            <button
              type="button"
              onClick={addPlacement}
              className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              disabled={disableAddPlacement}
            >
              Добавить
            </button>
          </div>

          {fields.map((field, index) => (
            <PlacementFields
              key={field.id}
              index={index}
              db={db}
              control={control}
              register={register}
              setValue={setValue}
              errors={errors.placements}
              areaOptions={db.settings.areas}
              groupsByArea={groupsByArea}
              onRemove={fields.length > 1 ? () => remove(index) : undefined}
              isPrimary={index === 0}
            />
          ))}

          {areaLimitExceeded && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-100">
              Можно выбрать не более трёх районов на клиента.
            </div>
          )}
          {errors.placements && !Array.isArray(errors.placements) && "message" in errors.placements && (
            <div className="text-xs text-rose-600">{(errors.placements as { message?: string }).message}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Отмена
          </button>
          <button
            type="submit"
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            disabled={!isValid || areaLimitExceeded}
          >
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PlacementFields({
  index,
  db,
  control,
  register,
  setValue,
  errors,
  areaOptions,
  groupsByArea,
  onRemove,
  isPrimary,
}: PlacementFieldProps) {
  const area = useWatch({ control, name: `placements.${index}.area` });
  const group = useWatch({ control, name: `placements.${index}.group` });
  const subscriptionPlan = useWatch({ control, name: `placements.${index}.subscriptionPlan` });
  const payAmount = useWatch({ control, name: `placements.${index}.payAmount` });
  const payDate = useWatch({ control, name: `placements.${index}.payDate` });
  const groupList = area ? groupsByArea.get(area) ?? groupsByArea.values().next().value ?? db.settings.groups : db.settings.groups;
  const previousGroupRef = useRef<Group | null>(null);
  const previousPlanRef = useRef<SubscriptionPlan | null>(null);

  useEffect(() => {
    if (!groupList?.length) {
      return;
    }
    if (!groupList.includes(group as Group)) {
      setValue(`placements.${index}.group`, groupList[0], { shouldDirty: true });
    }
  }, [groupList, group, index, setValue]);

  const defaultPayAmount = useMemo(() => (group ? getDefaultPayAmount(group) ?? undefined : undefined), [group]);
  const subscriptionPlanAmount = useMemo(
    () => (subscriptionPlan ? getSubscriptionPlanAmount(subscriptionPlan) ?? undefined : undefined),
    [subscriptionPlan],
  );
  const groupAllowsCustom = group ? shouldAllowCustomPayAmount(group) : false;
  const planAllowsCustom = subscriptionPlan ? subscriptionPlanAllowsCustomAmount(subscriptionPlan) : false;
  const payAmountLockedByPlan = subscriptionPlanAmount != null && !groupAllowsCustom;
  const canEditPayAmount = groupAllowsCustom || planAllowsCustom;

  useEffect(() => {
    const name = `placements.${index}.payAmount` as const;
    const previousGroup = previousGroupRef.current;
    const previousPlan = previousPlanRef.current;
    const groupChanged = previousGroup !== null && previousGroup !== group;
    const planChanged = previousPlan !== null && previousPlan !== subscriptionPlan;
    const currentPayAmount = payAmount;

    if (subscriptionPlanAmount != null && !groupAllowsCustom) {
      const target = String(subscriptionPlanAmount);
      if (currentPayAmount !== target) {
        setValue(name, target, {
          shouldDirty: groupChanged || planChanged,
          shouldValidate: false,
        });
      }
      previousGroupRef.current = group ?? null;
      previousPlanRef.current = subscriptionPlan ?? null;
      return;
    }

    if (!groupAllowsCustom && !planAllowsCustom && defaultPayAmount != null) {
      const target = String(defaultPayAmount);
      if (currentPayAmount !== target) {
        setValue(name, target, {
          shouldDirty: groupChanged || planChanged,
          shouldValidate: false,
        });
      }
      previousGroupRef.current = group ?? null;
      previousPlanRef.current = subscriptionPlan ?? null;
      return;
    }

    if (groupAllowsCustom && defaultPayAmount != null && !planAllowsCustom) {
      if (!currentPayAmount || groupChanged || planChanged) {
        setValue(name, String(defaultPayAmount), {
          shouldDirty: groupChanged || planChanged,
          shouldValidate: false,
        });
      }
      previousGroupRef.current = group ?? null;
      previousPlanRef.current = subscriptionPlan ?? null;
      return;
    }

    if (!currentPayAmount && defaultPayAmount != null) {
      setValue(name, String(defaultPayAmount), { shouldDirty: false, shouldValidate: false });
    }

    previousGroupRef.current = group ?? null;
    previousPlanRef.current = subscriptionPlan ?? null;
  }, [
    defaultPayAmount,
    group,
    groupAllowsCustom,
    index,
    planAllowsCustom,
    payAmount,
    payAmountLockedByPlan,
    setValue,
    subscriptionPlan,
    subscriptionPlanAmount,
  ]);

  const manualRemainingRequired = useMemo(
    () =>
      (group ? requiresManualRemainingLessons(group) : false) ||
      (subscriptionPlan ? subscriptionPlanRequiresManualRemainingLessons(subscriptionPlan) : false),
    [group, subscriptionPlan],
  );

  const recommendedRemaining = useMemo(() => {
    if (!area || !group || !payDate) {
      return null;
    }
    return estimateGroupRemainingLessonsByParams(area, group, payDate, db.schedule) ?? null;
  }, [area, group, payDate, db.schedule]);

  useEffect(() => {
    const name = `placements.${index}.remainingLessons` as const;
    if (!manualRemainingRequired) {
      if (recommendedRemaining != null) {
        setValue(name, String(recommendedRemaining), { shouldDirty: false, shouldValidate: false });
      } else {
        setValue(name, "", { shouldDirty: false, shouldValidate: false });
      }
    }
  }, [index, manualRemainingRequired, recommendedRemaining, setValue]);

  const placementErrors = Array.isArray(errors) ? errors[index] : undefined;

  const labelClass = "text-xs text-slate-500 dark:text-slate-400";
  const fieldClass =
    "px-3 py-2 rounded-md border border-slate-300 bg-white placeholder:text-slate-400 " +
    "dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500";
  const selectClass = `${fieldClass} appearance-none`;
  const subtleTextClass = "text-xs text-slate-500 dark:text-slate-400";

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-100">
          {isPrimary ? "Основное место" : "Дополнительное место"}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-rose-600 hover:text-rose-700"
          >
            Удалить
          </button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Район</label>
          <select className={selectClass} {...register(`placements.${index}.area` as const)}>
            {areaOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {placementErrors?.area && (
            <span className="text-xs text-rose-600">{placementErrors.area.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Группа</label>
          <select className={selectClass} {...register(`placements.${index}.group` as const)}>
            {groupList?.map((option: Group) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {placementErrors?.group && (
            <span className="text-xs text-rose-600">{placementErrors.group.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Статус оплаты</label>
          <select className={selectClass} {...register(`placements.${index}.payStatus` as const)}>
            <option value="ожидание">ожидание</option>
            <option value="действует">действует</option>
            <option value="задолженность">задолженность</option>
          </select>
          {placementErrors?.payStatus && (
            <span className="text-xs text-rose-600">{placementErrors.payStatus.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Статус абонемента</label>
          <select className={selectClass} {...register(`placements.${index}.status` as const)}>
            <option value="действующий">действующий</option>
            <option value="отмена">отмена</option>
            <option value="новый">новый</option>
            <option value="вернувшийся">вернувшийся</option>
            <option value="продлившийся">продлившийся</option>
          </select>
          {placementErrors?.status && (
            <span className="text-xs text-rose-600">{placementErrors.status.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Форма абонемента</label>
          <select className={selectClass} {...register(`placements.${index}.subscriptionPlan` as const)}>
            {SUBSCRIPTION_PLANS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {placementErrors?.subscriptionPlan && (
            <span className="text-xs text-rose-600">{placementErrors.subscriptionPlan.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Дата оплаты</label>
          <input type="date" className={fieldClass} {...register(`placements.${index}.payDate` as const)} />
          {placementErrors?.payDate && (
            <span className="text-xs text-rose-600">{placementErrors.payDate.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Сумма оплаты, €</label>
          <input
            type="number"
            inputMode="decimal"
            step={0.5}
            className={fieldClass}
            {...register(`placements.${index}.payAmount` as const)}
            disabled={!canEditPayAmount}
            placeholder="Укажите сумму"
          />
          {!canEditPayAmount && defaultPayAmount != null && (
            <span className={subtleTextClass}>
              {payAmountLockedByPlan
                ? "Сумма выбрана формой абонемента"
                : "Сумма фиксирована для этой группы"}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Факт оплаты, €</label>
          <input
            type="number"
            inputMode="decimal"
            step={0.5}
            className={fieldClass}
            {...register(`placements.${index}.payActual` as const)}
            placeholder="Оплата по факту"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Остаток занятий</label>
          <input
            type="number"
            inputMode="numeric"
            className={fieldClass}
            {...register(`placements.${index}.remainingLessons` as const)}
            disabled={!manualRemainingRequired}
            placeholder={manualRemainingRequired ? "Укажите вручную" : "Рассчитывается автоматически"}
          />
          {!manualRemainingRequired && recommendedRemaining != null && (
            <span className={subtleTextClass}>
              Рекомендуемое значение: {recommendedRemaining}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
