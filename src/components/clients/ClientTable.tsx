import React, { useCallback, useMemo, useState } from "react";
import VirtualizedTable from "../VirtualizedTable";
import ClientDetailsModal from "./ClientDetailsModal";
import ColumnSettings from "../ColumnSettings";
import { compareValues, toggleSort } from "../tableUtils";
import { calcAgeYears, calcExperience, calcExperienceMonths, fmtDate, fmtMoney } from "../../state/utils";
import { getClientRecurringPayDate, matchesPeriod, type PeriodFilter } from "../../state/period";
import { getEffectiveRemainingLessons } from "../../state/lessons";
import { isReserveArea } from "../../state/areas";
import { normalizePaymentFacts } from "../../state/paymentFacts";
import type {
  Area,
  AttendanceEntry,
  Client,
  ClientStatus,
  Currency,
  PaymentFact,
  PaymentStatus,
  PerformanceEntry,
  ScheduleSlot,
  Settings,
  TaskItem,
  Group,
} from "../../types";
import { usePersistentTableSettings } from "../../utils/tableSettings";
import { getClientPlacementDisplayStatus, matchesPlacement } from "./paymentStatus";
import type { PaymentFactsChangeContext } from "./paymentFactActions";

type Props = {
  list: Client[];
  currency: Currency;
  currencyRates: Settings["currencyRates"];
  onEdit: (c: Client) => void;
  onRemove?: (id: string) => void;
  onCreateTask: (client: Client) => void;
  onSetWaiting?: (client: Client) => void;
  openPaymentTasks?: Record<string, TaskItem | undefined>;
  onCompletePaymentTask?: (client: Client, task: TaskItem) => void;
  onRemovePaymentTask?: (client: Client, task: TaskItem) => void;
  onReserve?: (client: Client) => void;
  schedule: ScheduleSlot[];
  attendance: AttendanceEntry[];
  performance: PerformanceEntry[];
  billingPeriod?: PeriodFilter;
  onPaymentFactsChange?: (
    clientId: string,
    nextFacts: PaymentFact[],
    context: PaymentFactsChangeContext,
  ) => Promise<boolean | void> | boolean | void;
  activeArea?: Area | null;
  activeGroup?: Group | null;
  resolveClient?: (clientId: string) => Client | null;
};

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

const DEFAULT_VISIBLE_COLUMNS = [
  "name",
  "phone",
  "whatsApp",
  "telegram",
  "instagram",
  "parent",
  "area",
  "group",
  "age",
  "experience",
  "status",
  "payStatus",
  "remainingLessons",
  "payAmount",
  "payDate",
  "actions",
];

const TABLE_SETTINGS_KEY = "clients";

export default function ClientTable({
  list,
  currency,
  currencyRates,
  onEdit,
  onRemove,
  onCreateTask,
  onSetWaiting,
  openPaymentTasks,
  onCompletePaymentTask,
  onRemovePaymentTask,
  onReserve,
  schedule,
  attendance,
  performance,
  billingPeriod,
  onPaymentFactsChange,
  activeArea,
  activeGroup,
  resolveClient,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedClient = useMemo(() => {
    if (!selectedId) {
      return null;
    }

    if (resolveClient) {
      const resolved = resolveClient(selectedId);
      if (resolved) {
        return resolved;
      }
    }

    return list.find(client => client.id === selectedId) ?? null;
  }, [list, resolveClient, selectedId]);
  const remainingMap = useMemo(() => {
    const map = new Map<string, number | null>();
    list.forEach(client => {
      map.set(client.id, getEffectiveRemainingLessons(client, schedule));
    });
    return map;
  }, [list, schedule]);

  const getActivePlacement = useCallback(
    (client: Client) => {
      if (activeArea == null && activeGroup == null) {
        return null;
      }

      if (!Array.isArray(client.placements)) {
        return null;
      }

      return (
        client.placements.find(placement => {
          const matchesArea = activeArea == null || placement.area === activeArea;
          const matchesGroup = activeGroup == null || placement.group === activeGroup;
          return matchesArea && matchesGroup;
        }) ?? null
      );
    },
    [activeArea, activeGroup],
  );

  const collectPlacementPaymentFacts = useCallback(
    (client: Client) => {
      const placement = getActivePlacement(client);
      const facts = normalizePaymentFacts(client.payHistory);
      const filteredFacts = facts.filter(fact => {
        const inSelectedPeriod = billingPeriod ? matchesPeriod(fact, billingPeriod) : true;
        if (!inSelectedPeriod) {
          return false;
        }
        return matchesPlacement(placement, fact);
      });
      const amount = filteredFacts.reduce((sum, fact) => {
        const value = typeof fact.amount === "number" && Number.isFinite(fact.amount) ? fact.amount : 0;
        return sum + value;
      }, 0);

      return {
        placement,
        amount,
        hasFacts: filteredFacts.length > 0,
      };
    },
    [billingPeriod, getActivePlacement],
  );

  const getPayActualAmount = useCallback(
    (client: Client) => {
      const { placement, amount, hasFacts } = collectPlacementPaymentFacts(client);
      if (hasFacts) {
        return amount;
      }

      const fallbackPlacement =
        placement ??
        (activeArea == null && activeGroup == null
          ? client.placements?.find(item => typeof item.payActual === "number" && Number.isFinite(item.payActual)) ??
            null
          : null);

      const fallbackAmount = fallbackPlacement?.payActual;
      return typeof fallbackAmount === "number" && Number.isFinite(fallbackAmount) ? fallbackAmount : null;
    },
    [activeArea, activeGroup, collectPlacementPaymentFacts],
  );

  const paidInPeriodMap = useMemo(() => {
    if (!billingPeriod || billingPeriod.month == null) {
      return null;
    }
    const map = new Map<string, boolean>();
    list.forEach(client => {
      const { hasFacts } = collectPlacementPaymentFacts(client);
      map.set(client.id, hasFacts);
    });
    return map;
  }, [billingPeriod, collectPlacementPaymentFacts, list]);

  const isPaidInSelectedPeriod = useCallback((client: Client): boolean => {
    const placement = getActivePlacement(client);
    if (!billingPeriod || billingPeriod.month == null) {
      const status = placement?.payStatus ?? client.payStatus;
      return status === "действует";
    }
    return paidInPeriodMap?.get(client.id) ?? false;
  }, [billingPeriod, getActivePlacement, paidInPeriodMap]);

  const getDisplayPayStatus = useCallback(
    (client: Client): string => {
      const placement = getActivePlacement(client);
      const placementStatus = placement?.payStatus ?? null;
      const aggregateStatus = getClientPlacementDisplayStatus(client);
      const baseStatus = placementStatus ?? aggregateStatus;

      if (!billingPeriod || billingPeriod.month == null) {
        return placementStatus ?? aggregateStatus;
      }

      if (baseStatus === "задолженность" || baseStatus === "ожидание") {
        return baseStatus;
      }

      return isPaidInSelectedPeriod(client) ? "действует" : "ожидание";
    },
    [billingPeriod, getActivePlacement, isPaidInSelectedPeriod],
  );

  const getPayStatusTone = useCallback(
    (client: Client): string => {
      const status = getDisplayPayStatus(client);
      if (status === "действует") {
        return "rounded-full bg-emerald-100 text-emerald-700";
      }
      if (status === "задолженность") {
        return "rounded-full bg-rose-100 text-rose-700";
      }
      return "rounded-full bg-amber-100 text-amber-700";
    },
    [getDisplayPayStatus],
  );

  const columns: ColumnConfig[] = useMemo(() => [
    {
      id: "name",
      label: "Имя",
      width: "minmax(220px, 2fr)",
      renderCell: client => (
        <span className="block max-w-full break-words font-medium text-slate-800 transition-colors duration-150 group-hover:text-sky-600 dark:text-slate-100 dark:group-hover:text-sky-300">
          {client.firstName} {client.lastName}
        </span>
      ),
      sortValue: client => `${client.firstName} ${client.lastName ?? ""}`.trim().toLowerCase(),
    },
    {
      id: "parent",
      label: "Родитель",
      width: "minmax(200px, max-content)",
      renderCell: client => client.parentName ?? "—",
      sortValue: client => (client.parentName ?? "").toLowerCase(),
    },
    {
      id: "phone",
      label: "Телефон",
      width: "minmax(140px, max-content)",
      renderCell: client => client.phone ?? "—",
      sortValue: client => client.phone ?? "",
    },
    {
      id: "whatsApp",
      label: "WhatsApp",
      width: "minmax(140px, max-content)",
      renderCell: client => client.whatsApp ?? "—",
      sortValue: client => client.whatsApp ?? "",
    },
    {
      id: "telegram",
      label: "Telegram",
      width: "minmax(140px, max-content)",
      renderCell: client => client.telegram ?? "—",
      sortValue: client => client.telegram ?? "",
    },
    {
      id: "instagram",
      label: "Instagram",
      width: "minmax(160px, max-content)",
      renderCell: client => client.instagram ?? "—",
      sortValue: client => client.instagram ?? "",
    },
    {
      id: "area",
      label: "Район",
      width: "minmax(120px, max-content)",
      renderCell: client => {
        const placements = client.placements?.length
          ? client.placements
          : [
              {
                id: client.id,
                area: client.area,
                group: client.group,
                payStatus: client.payStatus,
                status: client.status,
                subscriptionPlan: client.subscriptionPlan,
                payDate: client.payDate,
                payAmount: client.payAmount,
                payActual: client.payActual,
                remainingLessons: client.remainingLessons,
              },
            ];
        const uniqueAreas = Array.from(new Set(placements.map(item => item.area)));
        return uniqueAreas.join(", ");
      },
      sortValue: client => (client.placements?.[0]?.area ?? client.area ?? "").toString(),
    },
    {
      id: "group",
      label: "Группа",
      width: "minmax(120px, max-content)",
      renderCell: client => {
        const placements = client.placements?.length
          ? client.placements
          : [{
              id: client.id,
              area: client.area,
              group: client.group,
              payStatus: client.payStatus,
              status: client.status,
              subscriptionPlan: client.subscriptionPlan,
              payDate: client.payDate,
              payAmount: client.payAmount,
              payActual: client.payActual,
              remainingLessons: client.remainingLessons,
            }];
        return placements.map(item => item.group).join(", ");
      },
      sortValue: client => (client.placements?.[0]?.group ?? client.group ?? "").toString(),
    },
    {
      id: "age",
      label: "Возраст",
      width: "minmax(110px, max-content)",
      headerAlign: "center",
      cellClassName: "text-center",
      renderCell: client => {
        const age = calcAgeYears(client.birthDate);
        return Number.isNaN(age) ? "—" : `${age} лет`;
      },
      sortValue: client => {
        const age = calcAgeYears(client.birthDate);
        return Number.isNaN(age) ? -1 : age;
      },
    },
    {
      id: "experience",
      label: "Опыт",
      width: "minmax(140px, max-content)",
      renderCell: client => calcExperience(client.startDate),
      sortValue: client => calcExperienceMonths(client.startDate),
    },
    {
      id: "status",
      label: "Статус клиента",
      width: "minmax(140px, max-content)",
      renderCell: client => {
        if (!client.status) {
          return "—";
        }
        const isCanceled = client.status === "отмена";
        return (
          <span className={isCanceled ? "font-medium text-rose-500 dark:text-rose-400" : undefined}>
            {client.status}
          </span>
        );
      },
      sortValue: client => getStatusSortValue(client.status),
    },
    {
      id: "payStatus",
      label: "Статус оплаты",
      width: "minmax(150px, max-content)",
      renderCell: client => (
        <span
          className={`px-2 py-1 text-xs ${
            getPayStatusTone(client)
          }`}
        >
          {getDisplayPayStatus(client)}
        </span>
      ),
      sortValue: client => getDisplayPayStatus(client),
    },
    {
      id: "remainingLessons",
      label: "Остаток занятий",
      width: "minmax(150px, max-content)",
      headerAlign: "center",
      cellClassName: "text-center",
      renderCell: client => {
        const remaining = remainingMap.get(client.id);
        return remaining != null ? remaining : "—";
      },
      sortValue: client => remainingMap.get(client.id) ?? -1,
    },
    {
      id: "payAmount",
      label: "Сумма оплаты",
      width: "minmax(130px, max-content)",
      renderCell: client => (client.payAmount != null ? fmtMoney(client.payAmount, currency, currencyRates) : "—"),
      sortValue: client => client.payAmount ?? 0,
    },
    {
      id: "payActual",
      label: "Факт оплаты",
      width: "minmax(130px, max-content)",
      renderCell: client => {
        const placementStatus = getClientPlacementDisplayStatus(client);
        if (placementStatus === "ожидание") {
          return "—";
        }
        const paid = isPaidInSelectedPeriod(client);
        if (billingPeriod?.month != null && !paid) {
          return "—";
        }
        const amount = getPayActualAmount(client);
        return amount != null ? fmtMoney(amount, currency, currencyRates) : "—";
      },
      sortValue: client => {
        const placementStatus = getClientPlacementDisplayStatus(client);
        if (placementStatus === "ожидание") {
          return 0;
        }
        const paid = isPaidInSelectedPeriod(client);
        if (billingPeriod?.month != null && !paid) {
          return 0;
        }
        const amount = getPayActualAmount(client);
        return amount ?? 0;
      },
    },
    {
      id: "payDate",
      label: "Дата оплаты",
      width: "minmax(140px, max-content)",
      renderCell: client => {
        const displayDate = billingPeriod
          ? getClientRecurringPayDate(client, billingPeriod) ?? client.payDate ?? client.startDate ?? null
          : client.payDate ?? null;
        return displayDate ? fmtDate(displayDate) : "—";
      },
      sortValue: client => {
        const displayDate = billingPeriod
          ? getClientRecurringPayDate(client, billingPeriod) ?? client.payDate ?? client.startDate ?? null
          : client.payDate ?? null;
        return displayDate ?? "";
      },
    },
    {
      id: "actions",
      label: "Действия",
      width: "minmax(260px, 1fr)",
      headerClassName: "text-right",
      headerAlign: "right",
      cellClassName: "flex justify-end gap-1",
      renderCell: client => {
        const openTask = openPaymentTasks?.[client.id];
        const showReserveButton = Boolean(onReserve && !isReserveArea(client.area));
        const canSetWaiting =
          onSetWaiting && getClientPlacementDisplayStatus(client) !== "ожидание";
        return (
          <>
            {openTask && onCompletePaymentTask && (
              <button
                onClick={event => {
                  event.stopPropagation();
                  onCompletePaymentTask(client, openTask);
                }}
                className="px-2 py-1 text-xs rounded-md border border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                Оплатил
              </button>
            )}
            {openTask && onRemovePaymentTask && (
              <button
                onClick={event => {
                  event.stopPropagation();
                  onRemovePaymentTask(client, openTask);
                }}
                className="px-2 py-1 text-xs rounded-md border border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                Удалить задачу
              </button>
            )}
            {canSetWaiting && (
              <button
                onClick={event => {
                  event.stopPropagation();
                  onSetWaiting?.(client);
                }}
                className="px-2 py-1 text-xs rounded-md border border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                ожидание
              </button>
            )}
            {!openTask && (
              <button
                onClick={event => {
                  event.stopPropagation();
                  onCreateTask(client);
                }}
                className="px-2 py-1 text-xs rounded-md border border-sky-200 text-sky-600 hover:bg-sky-50 dark:border-sky-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                Создать задачу
              </button>
            )}
            {showReserveButton && onReserve && (
              <button
                onClick={event => {
                  event.stopPropagation();
                  onReserve(client);
                }}
                className="px-2 py-1 text-xs rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Резерв
              </button>
            )}
            {onRemove && (
              <button
                onClick={event => {
                  event.stopPropagation();
                  onRemove(client.id);
                }}
                className="px-2 py-1 text-xs rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:bg-rose-900/20 dark:hover:bg-rose-900/30"
              >
                Удалить
              </button>
            )}
          </>
        );
      },
    },
  ], [
    billingPeriod,
    currency,
    currencyRates,
    getDisplayPayStatus,
    getPayActualAmount,
    getPayStatusTone,
    isPaidInSelectedPeriod,
    onCompletePaymentTask,
    onRemovePaymentTask,
    onCreateTask,
    onRemove,
    onReserve,
    openPaymentTasks,
    remainingMap,
    onSetWaiting,
  ]);

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

  const sortedList = useMemo(() => {
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

  const numberColumnWidth = "56px";
  const columnTemplate = activeColumns.length
    ? [numberColumnWidth, ...activeColumns.map(column => column.width)].join(" ")
    : `${numberColumnWidth} 1fr`;

  const rows = useMemo(
    () =>
      sortedList.map((client, index) => ({
        client,
        index,
      })),
    [sortedList],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <ColumnSettings
          options={columns.map(column => ({ id: column.id, label: column.label }))}
          value={visibleColumns}
          onChange={setVisibleColumns}
        />
      </div>
        <div>
        <VirtualizedTable
          header={(
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr
              className="w-full"
              style={{ display: "grid", gridTemplateColumns: columnTemplate, alignItems: "center" }}
            >
              <th className="p-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">№</th>
              {activeColumns.map(column => {
                const isSorted = sort?.columnId === column.id;
                const canSort = Boolean(column.sortValue);
                const indicator = isSorted ? (sort?.direction === "asc" ? "↑" : "↓") : null;
                const alignment = column.headerAlign ?? "left";
                const justify = alignment === "right" ? "justify-end" : alignment === "center" ? "justify-center" : "";
                const content = (
                  <div className={`flex items-center gap-1 ${justify}`}>
                    <span>{column.label}</span>
                    {indicator && <span className="text-xs">{indicator}</span>}
                  </div>
                );
                return (
                  <th
                    key={column.id}
                    className={`p-2 ${column.headerClassName ?? "text-left"}`}
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
          items={rows}
          rowHeight={48}
          virtualize={false}
          renderRow={(row, style) => (
            <tr
              key={row.client.id}
              style={{
                ...style,
                display: "grid",
                gridTemplateColumns: columnTemplate,
                alignItems: "center",
              }}
              className="group cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              onClick={() => setSelectedId(row.client.id)}
            >
              <td className="p-2 text-center text-slate-500">{row.index + 1}</td>
              {activeColumns.map(column => (
                <td key={column.id} className={`p-2 ${column.cellClassName ?? ""}`}>
                  {column.renderCell(row.client)}
                </td>
              ))}
            </tr>
          )}
        />
      </div>

      {selectedClient && (
        <ClientDetailsModal
          client={selectedClient}
          currency={currency}
          currencyRates={currencyRates}
          attendance={attendance}
          performance={performance}
          billingPeriod={billingPeriod}
          onEdit={onEdit}
          onRemove={onRemove}
          onPaymentFactsChange={onPaymentFactsChange}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
const STATUS_ORDER: ClientStatus[] = [
  "отмена",
  "новый",
  "продлившийся",
  "вернувшийся",
  "действующий",
];

const getStatusSortValue = (status?: ClientStatus | null): number => {
  if (!status) {
    return STATUS_ORDER.length;
  }
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? STATUS_ORDER.length : index;
};

