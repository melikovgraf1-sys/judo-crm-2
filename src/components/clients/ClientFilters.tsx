import React from "react";
import type { DB, Area, Group, PaymentStatus } from "../../types";
import { MONTH_OPTIONS } from "../../state/period";

type Props = {
  db: DB,
  area: Area | null,
  setArea: (a: Area | null) => void,
  group: Group | null,
  setGroup: (g: Group | null) => void,
  groups: Group[],
  pay: PaymentStatus | "all",
  setPay: (p: PaymentStatus | "all") => void,
  listLength: number,
  onAddClient: () => void,
  monthValue: string,
  onMonthChange: (value: string) => void,
  year: number,
  onYearChange: (value: number) => void,
  yearOptions: number[],
  ageMin: string,
  onAgeMinChange: (value: string) => void,
  ageMax: string,
  onAgeMaxChange: (value: string) => void,
  experienceMin: string,
  onExperienceMinChange: (value: string) => void,
  experienceMax: string,
  onExperienceMaxChange: (value: string) => void,
};

function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
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

export default function ClientFilters({
  db,
  area,
  setArea,
  group,
  setGroup,
  groups,
  pay,
  setPay,
  listLength,
  onAddClient,
  monthValue,
  onMonthChange,
  year,
  onYearChange,
  yearOptions,
  ageMin,
  onAgeMinChange,
  ageMax,
  onAgeMaxChange,
  experienceMin,
  onExperienceMinChange,
  experienceMax,
  onExperienceMaxChange,
}: Props) {
  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        <Chip active={area === null} onClick={() => { setArea(null); setGroup(null); }}>Сбросить район</Chip>
        {db.settings.areas.map(a => (
          <Chip key={a} active={area === a} onClick={() => setArea(a)}>{a}</Chip>
        ))}
        <div className="flex-1" />
        <button
          onClick={onAddClient}
          className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700"
        >
          + Добавить клиента
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={monthValue}
          onChange={event => onMonthChange(event.target.value)}
          aria-label="Фильтр по месяцу"
        >
          <option value="">Все месяцы</option>
          {MONTH_OPTIONS.map(option => (
            <option key={option.value} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={year}
          onChange={event => {
            const nextYear = Number.parseInt(event.target.value, 10);
            if (Number.isFinite(nextYear)) {
              onYearChange(nextYear);
            }
          }}
          aria-label="Фильтр по году"
        >
          {yearOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={group ?? ""}
          onChange={e => setGroup(e.target.value ? (e.target.value as Group) : null)}
          disabled={!area}
          aria-label="Фильтр по группе"
        >
          <option value="">Выберите группу</option>
          {groups.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={pay}
          onChange={e => setPay(e.target.value as PaymentStatus | "all")}
          aria-label="Фильтр по статусу оплаты"
        >
          <option value="all">Все статусы оплаты</option>
          <option value="ожидание">ожидание</option>
          <option value="действует">действует</option>
          <option value="задолженность">задолженность</option>
        </select>
        <div className="text-xs text-slate-500">
          {area && group ? `Найдено: ${listLength}` : "Выберите район и группу"}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="number"
          min={0}
          placeholder="Возраст от"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={ageMin}
          onChange={event => onAgeMinChange(event.target.value)}
        />
        <input
          type="number"
          min={0}
          placeholder="Возраст до"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={ageMax}
          onChange={event => onAgeMaxChange(event.target.value)}
        />
        <input
          type="number"
          min={0}
          step="0.1"
          placeholder="Опыт от (лет)"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={experienceMin}
          onChange={event => onExperienceMinChange(event.target.value)}
        />
        <input
          type="number"
          min={0}
          step="0.1"
          placeholder="Опыт до (лет)"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={experienceMax}
          onChange={event => onExperienceMaxChange(event.target.value)}
        />
      </div>
    </>
  );
}

