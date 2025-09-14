// @flow
import React from "react";
import type { DB, Area, Group, PaymentStatus } from "../../types";

type Props = {
  db: DB,
  area: Area | "all",
  setArea: (a: Area | "all") => void,
  group: Group | "all",
  setGroup: (g: Group | "all") => void,
  pay: PaymentStatus | "all",
  setPay: (p: PaymentStatus | "all") => void,
  listLength: number,
  onAddClient: () => void,
};

function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.Node }) {
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
  pay,
  setPay,
  listLength,
  onAddClient,
}: Props) {
  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        <Chip active={area === "all"} onClick={() => setArea("all")}>Все районы</Chip>
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
          value={group}
          onChange={e => setGroup(e.target.value)}
        >
          <option value="all">Все группы</option>
          {db.settings.groups.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={pay}
          onChange={e => setPay(e.target.value)}
        >
          <option value="all">Все статусы оплаты</option>
          <option value="ожидание">ожидание</option>
          <option value="действует">действует</option>
          <option value="задолженность">задолженность</option>
        </select>
        <div className="text-xs text-slate-500">Найдено: {listLength}</div>
      </div>
    </>
  );
}

