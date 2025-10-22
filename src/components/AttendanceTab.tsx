import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Breadcrumbs from "./Breadcrumbs";
import VirtualizedTable from "./VirtualizedTable";
import ClientDetailsModal from "./clients/ClientDetailsModal";
import ClientForm from "./clients/ClientForm";
import ColumnSettings from "./ColumnSettings";
import { compareValues, toggleSort } from "./tableUtils";
import { fmtDate, todayISO, uid } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import {
  buildGroupsByArea,
  calculateManualPayDate,
  clientRequiresManualRemainingLessons,
  estimateGroupRemainingLessonsByParams,
} from "../state/lessons";
import { transformClientFormValues } from "./clients/clientMutations";
import { isReserveArea } from "../state/areas";
import { getClientPlacements } from "../state/clients";
import type {
  Area,
  AttendanceEntry,
  Client,
  ClientFormValues,
  Currency,
  DB,
  Group,
  PaymentFact,
} from "../types";
import { readDailySelection, writeDailySelection, clearDailySelection } from "../state/filterPersistence";
import { usePersistentTableSettings } from "../utils/tableSettings";
import {
  commitClientPaymentFactsChange,
  type PaymentFactsChangeContext,
} from "./clients/paymentFactActions";

const DEFAULT_VISIBLE_COLUMNS = ["name", "area", "group", "mark"];
const TABLE_SETTINGS_KEY = "attendance";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

const toMiddayISO = (value: string): string | null => {
  if (!value) return null;
  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10) - 1;
  const day = Number.parseInt(dayStr, 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }
  const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

const createUTCDate = (year: number, monthIndex: number, day: number) =>
  new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));

export default function AttendanceTab({
  db,
  setDB,
  currency,
}: {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  currency: Currency;
}) {
  const storedSelection = useMemo(() => readDailySelection("attendance"), []);
  const [area, setArea] = useState<Area | null>(storedSelection.area);
  const [group, setGroup] = useState<Group | null>(storedSelection.group);
  const [selected, setSelected] = useState<Client | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => todayISO().slice(0, 10));
  const groupsByArea = useMemo(() => buildGroupsByArea(db.schedule), [db.schedule]);
  const areaOptions = useMemo(() => Array.from(groupsByArea.keys()), [groupsByArea]);
  const availableGroups = useMemo(() => {
    if (!area) return [];
    return groupsByArea.get(area) ?? [];
  }, [area, groupsByArea]);

  const handlePaymentFactsChange = (
    clientId: string,
    nextFacts: PaymentFact[],
    context: PaymentFactsChangeContext,
  ) =>
    commitClientPaymentFactsChange({
      db,
      setDB,
      clientId,
      nextFacts,
      action: context.action,
    });

  useEffect(() => {
    if (area && group && !availableGroups.includes(group)) {
      setGroup(null);
    }
  }, [area, availableGroups, group]);

  useEffect(() => {
    if (!area || group || !availableGroups.length) {
      return;
    }
    if (isReserveArea(area)) {
      return;
    }
    setGroup(availableGroups[0] ?? null);
  }, [area, availableGroups, group]);

  useEffect(() => {
    if (area || group) {
      writeDailySelection("attendance", area ?? null, group ?? null);
    } else {
      clearDailySelection("attendance");
    }
  }, [area, group]);

  const todayStr = useMemo(() => todayISO().slice(0, 10), []);
  const selectedMonthDate = useMemo(() => {
    if (!month) return null;
    const [yearStr, monthStr] = month.split("-");
    const year = Number.parseInt(yearStr, 10);
    const monthIndex = Number.parseInt(monthStr, 10) - 1;
    if (Number.isNaN(year) || Number.isNaN(monthIndex)) {
      return null;
    }
    const base = createUTCDate(year, monthIndex, 1);
    if (Number.isNaN(base.getTime())) {
      return null;
    }
    return base;
  }, [month]);

  useEffect(() => {
    if (!selectedMonthDate) return;
    const prefix = `${selectedMonthDate.getUTCFullYear()}-${String(selectedMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
    if (selectedDate.slice(0, 7) !== prefix) {
      const normalized = createUTCDate(
        selectedMonthDate.getUTCFullYear(),
        selectedMonthDate.getUTCMonth(),
        1,
      );
      setSelectedDate(normalized.toISOString().slice(0, 10));
    }
  }, [selectedDate, selectedMonthDate]);

  useEffect(() => {
    const prefix = selectedDate.slice(0, 7);
    if (prefix && prefix !== month) {
      setMonth(prefix);
    }
  }, [month, selectedDate]);

  const list = useMemo(() => {
    if (!area || !group) {
      return [];
    }
    return db.clients.filter(client => {
      if (client.status === "отмена") {
        return false;
      }
      return getClientPlacements(client).some(
        placement =>
          placement.area === area &&
          placement.group === group &&
          placement.status !== "отмена" &&
          !isReserveArea(placement.area),
      );
    });
  }, [area, group, db.clients]);


  type ColumnConfig = {
    id: string;
    label: string;
    width: string;
    headerClassName?: string;
    cellClassName?: string;
    renderCell: (client: Client) => React.ReactNode;
    sortValue?: (client: Client) => unknown;
    headerAlign?: "left" | "center" | "right";
  };

  const isoWeekday = (date: Date) => {
    const day = date.getUTCDay();
    return day === 0 ? 7 : day;
  };

  const monthLabel = useMemo(() => {
    if (!selectedMonthDate) return "";
    return selectedMonthDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }, [selectedMonthDate]);

  const scheduleDays = useMemo(() => {
    if (!area || !group || !selectedMonthDate) return [];
    const relevant = db.schedule.filter(slot => slot.area === area && slot.group === group);
    if (!relevant.length) return [];

    const timesByWeekday = new Map<number, string[]>();
    for (const slot of relevant) {
      const times = timesByWeekday.get(slot.weekday) ?? [];
      times.push(slot.time);
      timesByWeekday.set(slot.weekday, times);
    }
    for (const times of timesByWeekday.values()) {
      times.sort((a, b) => a.localeCompare(b));
    }

    type ScheduleDay = {
      date: string;
      label: string;
      times: string[];
      isToday: boolean;
      weekday: number;
    };

    const result: ScheduleDay[] = [];
    const cursor = new Date(selectedMonthDate.getTime());
    const monthIndex = cursor.getUTCMonth();
    while (cursor.getUTCMonth() === monthIndex) {
      const weekday = isoWeekday(cursor);
      const times = timesByWeekday.get(weekday);
      if (times?.length) {
        const iso = cursor.toISOString().slice(0, 10);
        const label = cursor.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", weekday: "short" });
        result.push({ date: iso, label, times, isToday: iso === todayStr, weekday });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    result.sort((a, b) => a.date.localeCompare(b.date));

    return result;
  }, [area, db.schedule, group, selectedMonthDate, todayStr]);

  const scheduleByDate = useMemo(() => {
    const map = new Map<string, (typeof scheduleDays)[number]>();
    for (const day of scheduleDays) {
      map.set(day.date, day);
    }
    return map;
  }, [scheduleDays]);

  const calendarCells = useMemo(() => {
    if (!selectedMonthDate) return [] as Array<{
      key: string;
      date: string | null;
      weekday: number;
      day: number | null;
      isToday: boolean;
      times: string[];
      monthLabel: string;
    }>;

    const year = selectedMonthDate.getUTCFullYear();
    const monthIndex = selectedMonthDate.getUTCMonth();
    const firstDay = createUTCDate(year, monthIndex, 1);
    const daysInMonth = createUTCDate(year, monthIndex + 1, 0).getUTCDate();

    const cells: {
      key: string;
      date: string | null;
      weekday: number;
      day: number | null;
      isToday: boolean;
      times: string[];
      monthLabel: string;
    }[] = [];

    const leadingEmpty = isoWeekday(firstDay) - 1;
    for (let i = 0; i < leadingEmpty; i += 1) {
      cells.push({
        key: `leading-${i}`,
        date: null,
        weekday: i + 1,
        day: null,
        isToday: false,
        times: [],
        monthLabel: "",
      });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const current = createUTCDate(year, monthIndex, day);
      const iso = current.toISOString().slice(0, 10);
      const weekday = isoWeekday(current);
      const schedule = scheduleByDate.get(iso);
      cells.push({
        key: iso,
        date: iso,
        weekday,
        day,
        isToday: iso === todayStr,
        times: schedule?.times ?? [],
        monthLabel: current.toLocaleDateString("ru-RU", { month: "short" }),
      });
    }

    const trailingEmpty = (7 - (cells.length % 7)) % 7;
    for (let i = 0; i < trailingEmpty; i += 1) {
      const weekday = ((cells.length + i) % 7) + 1;
      cells.push({
        key: `trailing-${i}`,
        date: null,
        weekday,
        day: null,
        isToday: false,
        times: [],
        monthLabel: "",
      });
    }

    return cells;
  }, [scheduleByDate, selectedMonthDate, todayStr]);

  const attendanceByDate = useMemo(() => {
    const grouped = new Map<string, AttendanceEntry[]>();
    for (const entry of db.attendance) {
      const key = entry.date.slice(0, 10);
      const list = grouped.get(key);
      if (list) {
        list.push(entry);
      } else {
        grouped.set(key, [entry]);
      }
    }
    return grouped;
  }, [db.attendance]);

  const marksForSelectedDate = useMemo(() => {
    const map: Map<string, AttendanceEntry> = new Map();
    const entries = attendanceByDate.get(selectedDate);
    if (!entries?.length) {
      return map;
    }
    for (const entry of entries) {
      map.set(entry.clientId, entry);
    }
    return map;
  }, [attendanceByDate, selectedDate]);

  const selectedDateISO = useMemo(() => toMiddayISO(selectedDate), [selectedDate]);
  const selectedDateLabel = useMemo(() => (selectedDateISO ? fmtDate(selectedDateISO) : ""), [selectedDateISO]);
  const adjustAttendanceClient = useCallback(
    (target: Client, manual: boolean, deltaRemaining: number, deltaFrozen: number): Client => {
      if (!deltaRemaining && !deltaFrozen) {
        return target;
      }

      const currentFrozen = target.frozenLessons ?? 0;
      const nextFrozen = Math.max(0, currentFrozen + deltaFrozen);
      const frozenChanged = nextFrozen !== currentFrozen;

      if (!manual) {
        if (!frozenChanged) {
          return target;
        }

        const referenceISO = selectedDateISO ?? todayISO();
        const referenceDate = new Date(referenceISO);

        const scheduledLessonsRemaining = estimateGroupRemainingLessonsByParams(
          target.area,
          target.group,
          target.payDate,
          db.schedule,
          referenceDate,
        );

        const activeLessonsRemaining =
          scheduledLessonsRemaining != null ? Math.max(0, scheduledLessonsRemaining - currentFrozen) : null;

        const totalLessonsToCover = activeLessonsRemaining != null ? activeLessonsRemaining + nextFrozen : null;

        const dueDate =
          totalLessonsToCover != null
            ? calculateManualPayDate(target.area, target.group, totalLessonsToCover, db.schedule, referenceDate)
            : null;

        const dueISO = dueDate?.toISOString();

        const updated: Client = {
          ...target,
          frozenLessons: nextFrozen,
          ...(dueISO ? { payDate: dueISO } : {}),
        };

        if (Array.isArray(target.placements) && target.placements.length) {
          updated.placements = target.placements.map(place => {
            if (place.area === target.area && place.group === target.group) {
              const nextPlace = { ...place, frozenLessons: nextFrozen };
              if (dueISO) {
                nextPlace.payDate = dueISO;
              }
              return nextPlace;
            }
            return place;
          });
        }

        return updated;
      }

      const currentRemaining = target.remainingLessons ?? 0;
      const nextRemaining = currentRemaining + deltaRemaining;
      const remainingChanged = nextRemaining !== currentRemaining;

      if (!remainingChanged && !frozenChanged) {
        return target;
      }

      const referenceISO = selectedDateISO ?? todayISO();
      const referenceDate = new Date(referenceISO);
      const due = calculateManualPayDate(
        target.area,
        target.group,
        nextRemaining + nextFrozen,
        db.schedule,
        referenceDate,
      );
      const dueISO = due?.toISOString();

      const updated: Client = {
        ...target,
        remainingLessons: nextRemaining,
        frozenLessons: nextFrozen,
      };

      if (dueISO) {
        updated.payDate = dueISO;
      }

      if (Array.isArray(target.placements) && target.placements.length) {
        updated.placements = target.placements.map(place => {
          if (place.area === target.area && place.group === target.group) {
            const nextPlace = {
              ...place,
              remainingLessons: nextRemaining,
              frozenLessons: nextFrozen,
            };
            if (dueISO) {
              nextPlace.payDate = dueISO;
            }
            return nextPlace;
          }
          return place;
        });
      }

      return updated;
    },
    [db.schedule, selectedDateISO],
  );

  const cycleMark = useCallback(
    async (clientId: string) => {
      if (!selectedDate) {
        window.alert("Выберите дату для отметки посещаемости.");
        return;
      }
      const mark = marksForSelectedDate.get(clientId);
      const client = db.clients.find(c => c.id === clientId);
      if (!client) return;
      const manual = clientRequiresManualRemainingLessons(client);

      const applyClientAdjustments = (deltaRemaining: number, deltaFrozen: number) =>
        db.clients.map(c =>
          c.id === clientId ? adjustAttendanceClient(c, manual, deltaRemaining, deltaFrozen) : c,
        );

      const desiredDate = toMiddayISO(selectedDate) ?? new Date().toISOString();

      if (!mark) {
        const entry: AttendanceEntry = { id: uid(), clientId, date: desiredDate, came: true, status: "came" };
        const nextClients = applyClientAdjustments(manual ? -1 : 0, 0);
        const next = { ...db, attendance: [entry, ...db.attendance], clients: nextClients };
        const result = await commitDBUpdate(next, setDB);
        if (!result.ok && result.reason === "error") {
          window.alert(
            "Не удалось сохранить отметку посещаемости. Изменение сохранено локально, проверьте доступ к базе данных.",
          );
        }
        return;
      }

      const currentStatus = mark.status ?? (mark.came ? "came" : "absent");

      if (currentStatus === "came") {
        const updated: AttendanceEntry = { ...mark, came: false, status: "absent" };
        const nextClients = applyClientAdjustments(manual ? 1 : 0, 0);
        const next = {
          ...db,
          attendance: db.attendance.map(entry => (entry.id === mark.id ? updated : entry)),
          clients: nextClients,
        };
        const result = await commitDBUpdate(next, setDB);
        if (!result.ok && result.reason === "error") {
          window.alert(
            "Не удалось обновить отметку посещаемости. Изменение сохранено локально, проверьте доступ к базе данных.",
          );
        }
        return;
      }

      if (currentStatus === "absent") {
        const updated: AttendanceEntry = { ...mark, came: false, status: "frozen" };
        const nextClients = applyClientAdjustments(0, 1);
        const next = {
          ...db,
          attendance: db.attendance.map(entry => (entry.id === mark.id ? updated : entry)),
          clients: nextClients,
        };
        const result = await commitDBUpdate(next, setDB);
        if (!result.ok && result.reason === "error") {
          window.alert(
            "Не удалось обновить отметку посещаемости. Изменение сохранено локально, проверьте доступ к базе данных.",
          );
        }
        return;
      }

      const nextClients = applyClientAdjustments(0, -1);
      const next = {
        ...db,
        attendance: db.attendance.filter(entry => entry.id !== mark.id),
        clients: nextClients,
      };
      const result = await commitDBUpdate(next, setDB);
      if (!result.ok && result.reason === "error") {
        window.alert(
          "Не удалось обновить отметку посещаемости. Изменение сохранено локально, проверьте доступ к базе данных.",
        );
      }
    },
    [adjustAttendanceClient, db, marksForSelectedDate, selectedDate, setDB],
  );

  const markAllAsCame = useCallback(async () => {
    if (!area || !group) {
      window.alert("Выберите район и группу для массовой отметки.");
      return;
    }

    if (!selectedDate) {
      window.alert("Выберите дату для отметки посещаемости.");
      return;
    }

    if (!list.length) {
      return;
    }

    const desiredDate = toMiddayISO(selectedDate) ?? new Date().toISOString();

    const newEntries: AttendanceEntry[] = [];
    const attendanceUpdates = new Map<string, AttendanceEntry>();
    const clientAdjustments = new Map<string, { manual: boolean; deltaRemaining: number; deltaFrozen: number }>();
    let changed = false;

    for (const client of list) {
      const mark = marksForSelectedDate.get(client.id);
      const manual = clientRequiresManualRemainingLessons(client);

      if (!mark) {
        const entry: AttendanceEntry = {
          id: uid(),
          clientId: client.id,
          date: desiredDate,
          came: true,
          status: "came",
        };
        newEntries.push(entry);
        clientAdjustments.set(client.id, { manual, deltaRemaining: manual ? -1 : 0, deltaFrozen: 0 });
        changed = true;
        continue;
      }

      const currentStatus = mark.status ?? (mark.came ? "came" : "absent");
      if (currentStatus === "came") {
        continue;
      }

      const deltaFrozen = currentStatus === "frozen" ? -1 : 0;
      const deltaRemaining = manual ? -1 : 0;
      attendanceUpdates.set(mark.id, { ...mark, came: true, status: "came" });
      clientAdjustments.set(client.id, { manual, deltaRemaining, deltaFrozen });
      changed = true;
    }

    if (!changed) {
      return;
    }

    const updatedAttendance = db.attendance.map(entry => attendanceUpdates.get(entry.id) ?? entry);
    const nextAttendance = newEntries.length ? [...newEntries, ...updatedAttendance] : updatedAttendance;

    const nextClients = db.clients.map(client => {
      const adjustment = clientAdjustments.get(client.id);
      if (!adjustment) {
        return client;
      }
      const { manual, deltaRemaining, deltaFrozen } = adjustment;
      return adjustAttendanceClient(client, manual, deltaRemaining, deltaFrozen);
    });

    const next = {
      ...db,
      attendance: nextAttendance,
      clients: nextClients,
    };

    const result = await commitDBUpdate(next, setDB);
    if (!result.ok && result.reason === "error") {
      window.alert(
        "Не удалось сохранить отметку посещаемости. Изменение сохранено локально, проверьте доступ к базе данных.",
      );
    }
  }, [adjustAttendanceClient, area, db, group, list, marksForSelectedDate, selectedDate, setDB]);

  const columns: ColumnConfig[] = useMemo(() => {
    return [
      {
        id: "name",
        label: "Ученик",
        width: "minmax(200px, max-content)",
        renderCell: (client: Client) => (
          <span className="font-medium text-slate-800 dark:text-slate-100">{client.firstName} {client.lastName}</span>
        ),
        sortValue: (client: Client) => `${client.firstName} ${client.lastName ?? ""}`.trim().toLowerCase(),
      },
      {
        id: "parent",
        label: "Родитель",
        width: "minmax(200px, max-content)",
        renderCell: (client: Client) => client.parentName ?? "—",
        sortValue: (client: Client) => (client.parentName ?? "").toLowerCase(),
      },
      {
        id: "area",
        label: "Район",
        width: "minmax(140px, max-content)",
        renderCell: (client: Client) => client.area,
        sortValue: (client: Client) => client.area,
      },
      {
        id: "group",
        label: "Группа",
        width: "minmax(140px, max-content)",
        renderCell: (client: Client) => client.group,
        sortValue: (client: Client) => client.group,
      },
      {
        id: "mark",
        label: selectedDateLabel ? `Отметка за ${selectedDateLabel}` : "Отметка",
        width: "minmax(160px, max-content)",
        headerAlign: "center" as const,
        cellClassName: "",
        renderCell: (client: Client) => {
          const mark = marksForSelectedDate.get(client.id);
          const status = mark?.status ?? (mark ? (mark.came ? "came" : "absent") : null);
          const label =
            status === "came"
              ? "пришёл"
              : status === "absent"
              ? "не пришёл"
              : status === "frozen"
              ? "заморозка"
              : "не отмечено";
          const tone =
            status === "came"
              ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700"
              : status === "absent"
              ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700"
              : status === "frozen"
              ? "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-700"
              : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700";
          return (
            <div className="flex justify-start">
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  cycleMark(client.id);
                }}
                className={`inline-flex items-center justify-center rounded-md border px-3 py-1 text-xs font-semibold ${tone}`}
              >
                {label}
              </button>
            </div>
          );
        },
        sortValue: (client: Client) => {
          const mark = marksForSelectedDate.get(client.id);
          if (!mark) return 0;
          const status = mark.status ?? (mark.came ? "came" : "absent");
          if (status === "came") return 3;
          if (status === "absent") return 2;
          if (status === "frozen") return 1;
          return 0;
        },
      },
    ];
  }, [cycleMark, marksForSelectedDate, selectedDateLabel]);

  const hasMarkableClients = useMemo(() => {
    if (!list.length) {
      return false;
    }
    return list.some(client => {
      const mark = marksForSelectedDate.get(client.id);
      const status = mark?.status ?? (mark ? (mark.came ? "came" : "absent") : null);
      return status !== "came";
    });
  }, [list, marksForSelectedDate]);

  const columnIds = useMemo(() => columns.map(column => column.id), [columns]);
  const { visibleColumns, setVisibleColumns, sort, setSort } = usePersistentTableSettings(
    TABLE_SETTINGS_KEY,
    columnIds,
    DEFAULT_VISIBLE_COLUMNS,
  );

  const activeColumns = useMemo(
    () => columns.filter(column => visibleColumns.includes(column.id)),
    [columns, visibleColumns],
  );

  const sortedClients = useMemo(() => {
    if (!sort) return list;
    const column = columns.find(col => col.id === sort.columnId);
    if (!column?.sortValue) return list;
    const copy = [...list];
    copy.sort((a, b) => {
      const compare = compareValues(column.sortValue!(a), column.sortValue!(b));
      return sort.direction === "asc" ? compare : -compare;
    });
    return copy;
  }, [columns, list, sort]);

  const columnTemplate = activeColumns.length ? activeColumns.map(column => column.width).join(" ") : "1fr";
  const startEdit = (client: Client) => {
    setEditing(client);
  };

  const saveClient = async (values: ClientFormValues) => {
    if (!editing) return;
    const prepared = transformClientFormValues(values, editing);
    const updated: Client = { ...editing, ...prepared };
    if (!Object.prototype.hasOwnProperty.call(prepared, "comment")) {
      delete updated.comment;
    }
    const next = {
      ...db,
      clients: db.clients.map(client => (client.id === editing.id ? updated : client)),
    };
    const result = await commitDBUpdate(next, setDB);
    if (!result.ok) {
      if (result.reason === "error") {
        window.alert("Не удалось сохранить изменения клиента. Проверьте доступ к базе данных.");
      }
      return;
    }
    setEditing(null);
    setSelected(updated);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Breadcrumbs items={["Посещаемость"]} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={area ?? ""}
          onChange={e => setArea(e.target.value ? (e.target.value as Area) : null)}
        >
          <option value="">Выберите район</option>
          {areaOptions.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={group ?? ""}
          onChange={e => setGroup(e.target.value ? (e.target.value as Group) : null)}
          disabled={!area}
        >
          <option value="">Выберите группу</option>
          {availableGroups.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          type="month"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={month}
          onChange={event => setMonth(event.target.value || todayISO().slice(0, 7))}
          disabled={!group}
        />
        <input
          type="date"
          className="px-2 py-2 rounded-md border border-slate-300 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          value={selectedDate}
          onChange={event => setSelectedDate(event.target.value || todayStr)}
          disabled={!group}
        />
        <div className="text-xs text-slate-500">Сегодня: {fmtDate(new Date().toISOString())}</div>
        <div className="text-xs text-slate-500">Отмечаем: {selectedDateLabel || "—"}</div>
        <div className="grow" />
        <button
          type="button"
          onClick={markAllAsCame}
          className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!area || !group || !selectedDate || !list.length || !hasMarkableClients}
        >
          Добавить всех
        </button>
        <ColumnSettings
          options={columns.map(column => ({ id: column.id, label: column.label }))}
          value={visibleColumns}
          onChange={setVisibleColumns}
        />
      </div>
      {area && group && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <span>Расписание на {monthLabel || "выбранный месяц"}</span>
            <span className="text-slate-400">{scheduleDays.length} тренировок</span>
          </div>
          <div className="p-3">
            {calendarCells.length ? (
              <div className="overflow-x-auto">
                <div className="min-w-[640px] space-y-2">
                  <div className="grid grid-cols-7 gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {WEEKDAY_LABELS.map(label => (
                      <div key={label} className="text-center">
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {calendarCells.map(cell => {
                      if (!cell.date) {
                        return <div key={cell.key} className="h-full min-h-[88px] rounded-lg border border-transparent" aria-hidden="true" />;
                      }

                      const cellDate = cell.date;
                      const isSelected = cellDate === selectedDate;
                      const hasLessons = cell.times.length > 0;
                      const selectionRing = isSelected ? "ring-2 ring-sky-400 dark:ring-sky-300" : "";
                      const todayTone = cell.isToday && hasLessons
                        ? "border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-900/40 dark:text-sky-200"
                        : "";
                      const inactiveTone = !hasLessons
                        ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500"
                        : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:border-sky-500 dark:hover:bg-sky-900/50";

                      return (
                        <button
                          key={cell.key}
                          type="button"
                          className={`flex min-h-[88px] flex-col justify-between rounded-lg border p-3 text-left text-xs shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-default disabled:opacity-100 dark:focus-visible:ring-sky-300 ${inactiveTone} ${todayTone} ${selectionRing}`}
                          onClick={() => {
                            if (hasLessons && cellDate) {
                              setSelectedDate(cellDate);
                            }
                          }}
                          aria-pressed={isSelected}
                          aria-disabled={!hasLessons}
                          disabled={!hasLessons}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-base font-semibold leading-none text-slate-700 dark:text-slate-100">
                              {cell.day}
                            </span>
                            <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              {cell.day === 1 ? cell.monthLabel : ""}
                            </span>
                          </div>
                          <div className="mt-3 space-y-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                            {hasLessons ? (
                              cell.times.map(time => <div key={time}>{time}</div>)
                            ) : (
                              <div className="text-slate-400 dark:text-slate-500">Нет занятий</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">Выберите месяц, чтобы посмотреть расписание.</div>
            )}
            {scheduleDays.length === 0 && (
              <div className="mt-3 text-xs text-slate-500">В выбранном месяце нет тренировок для этой группы.</div>
            )}
          </div>
        </div>
      )}
      <div className="text-xs text-slate-500">
        {area && group ? `Найдено: ${list.length}` : "Выберите район и группу"}
      </div>

      <div>
        <VirtualizedTable
          header={(
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr
              style={{ display: "grid", gridTemplateColumns: columnTemplate, alignItems: "center" }}
            >
              {activeColumns.map(column => {
                const canSort = Boolean(column.sortValue);
                const isSorted = sort?.columnId === column.id;
                const indicator = isSorted ? (sort?.direction === "asc" ? "↑" : "↓") : null;
                const alignment = column.headerAlign ?? "left";
                const justify =
                  alignment === "right" ? "justify-end" : alignment === "center" ? "justify-center" : "";
                const content = (
                  <div className={`flex items-center gap-1 ${justify}`}>
                    <span>{column.label}</span>
                    {indicator && <span className="text-xs">{indicator}</span>}
                  </div>
                );
                return (
                  <th
                    key={column.id}
                    className={`p-2 ${
                      alignment === "right"
                        ? "text-right"
                        : alignment === "center"
                        ? "text-center"
                        : "text-left"
                    }`}
                    style={{ cursor: canSort ? "pointer" : "default" }}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-1 focus:outline-none"
                        onClick={() => setSort(prev => toggleSort(prev, column.id))}
                      >
                        {content}
                      </button>
                    ) : (
                      content
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
        )}
          items={sortedClients}
          rowHeight={48}
          virtualize={false}
          renderRow={(client, style) => (
            <tr
              key={client.id}
              style={{
                ...style,
                display: "grid",
                gridTemplateColumns: columnTemplate,
                alignItems: "center",
                cursor: "pointer",
              }}
              className="border-t border-slate-100 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              onClick={() => setSelected(client)}
            >
            {activeColumns.map(column => (
              <td key={column.id} className={`p-2 ${column.cellClassName ?? ""}`}>
                {column.renderCell(client)}
              </td>
            ))}
          </tr>
          )}
        />
      </div>

      {selected && (
        <ClientDetailsModal
          client={selected}
          currency={currency}
          currencyRates={db.settings.currencyRates}
          schedule={db.schedule}
          attendance={db.attendance}
          performance={db.performance}
          billingPeriod={undefined}
          onEdit={startEdit}
          onPaymentFactsChange={handlePaymentFactsChange}
          onClose={() => setSelected(null)}
        />
      )}

      {editing && (
        <ClientForm
          db={db}
          editing={editing}
          onSave={saveClient}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
