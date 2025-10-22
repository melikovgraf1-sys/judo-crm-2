import { getClientPlacements } from "./clients";
import {
  getAreaGroupOverride,
  getDefaultPayAmount,
  getPlacementPricing,
  getSubscriptionPlanCadenceMultiplier,
} from "./payments";
import { normalizePaymentFacts } from "./paymentFacts";
import { convertMoney, isReserveArea } from "./utils";
import { isAttendanceInPeriod, isClientActiveInPeriod, matchesPeriod, type PeriodFilter } from "./period";
import type {
  Area,
  Client,
  ClientPlacement,
  Currency,
  DB,
  Group,
  Lead,
  LeadLifecycleEvent,
} from "../types";

const CANCELED_STATUSES = new Set(["отмена", "отменен", "отменён", "cancelled"]);

const isCanceledStatus = (status?: Client["status"] | string | null): boolean => {
  if (!status) {
    return false;
  }
  const normalized = status.toString().toLowerCase();
  return CANCELED_STATUSES.has(normalized);
};

type ClientPlacements = ReturnType<typeof getClientPlacements>;

const buildPlacementFromClient = (client: Client): ClientPlacement => ({
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
  frozenLessons: client.frozenLessons,
});

const selectLatestPlacement = (
  placements: ClientPlacements,
  client: Client,
): ClientPlacement => {
  if (!placements.length) {
    return buildPlacementFromClient(client);
  }
  const latest = placements[placements.length - 1];
  return {
    ...latest,
    area: latest.area || client.area,
    group: latest.group || client.group,
  };
};

const resolveScopePlacements = (
  client: Client,
  placements: ClientPlacements,
): ClientPlacements => {
  if (!placements.length) {
    return [buildPlacementFromClient(client)];
  }
  const activePlacements = placements.filter(placement => !isCanceledStatus(placement.status));
  if (activePlacements.length) {
    return activePlacements;
  }
  return [selectLatestPlacement(placements, client)];
};

export type AreaScope = Area | "all";

export type MetricKey = "revenue" | "profit" | "fill" | "athletes";
export type ProjectionKey = "actual" | "forecast" | "remaining" | "target";

type Unit = "money" | "percent" | "number";

export const METRIC_LABELS: Record<MetricKey, string> = {
  revenue: "Выручка",
  profit: "Прибыль",
  fill: "Заполняемость",
  athletes: "Кол-во спортсменов",
};

export const PROJECTION_LABELS: Record<ProjectionKey, string> = {
  actual: "Фактические",
  forecast: "Прогноз",
  remaining: "Остаток",
  target: "Цель",
};

const METRIC_UNITS: Record<MetricKey, Unit> = {
  revenue: "money",
  profit: "money",
  fill: "percent",
  athletes: "number",
};

const FAVORITE_SEPARATOR = "::";

export type AnalyticsFavorite =
  | {
      kind: "metric";
      area: AreaScope;
      group: Group | null;
      metric: MetricKey;
      projection: ProjectionKey;
    }
  | {
      kind: "athlete";
      area: AreaScope;
      group: Group | null;
      metric: AthleteMetricKey;
    }
  | {
      kind: "lead";
      area: AreaScope;
      group: Group | null;
      metric: LeadMetricKey;
    };

export type MetricSnapshot = {
  unit: Unit;
  values: Record<ProjectionKey, number>;
};

export type AthleteStats = {
  total: number;
  payments: number;
  new: number;
  firstRenewals: number;
  canceled: number;
  returned: number;
  dropIns: number;
  attendanceRate: number;
};

export type LeadStats = {
  created: number;
  converted: number;
  canceled: number;
};

export type AthleteMetricKey = keyof AthleteStats;
export type LeadMetricKey = keyof LeadStats;

export const ATHLETE_METRIC_KEYS: AthleteMetricKey[] = [
  "total",
  "payments",
  "new",
  "firstRenewals",
  "canceled",
  "returned",
  "dropIns",
  "attendanceRate",
];

export const LEAD_METRIC_KEYS: LeadMetricKey[] = ["created", "converted", "canceled"];

export const ATHLETE_METRIC_LABELS: Record<AthleteMetricKey, string> = {
  total: "Кол-во спортсменов",
  payments: "Кол-во оплат",
  new: "Кол-во новых спортсменов",
  firstRenewals: "Кол-во первых продлений",
  canceled: "Кол-во отмененных клиентов",
  returned: "Кол-во возвращенных клиентов",
  dropIns: "Кол-во разовых",
  attendanceRate: "Посещаемость",
};

export const LEAD_METRIC_LABELS: Record<LeadMetricKey, string> = {
  created: "Новые лиды",
  converted: "Оплаченные лиды",
  canceled: "Отмененные лиды",
};

export type AnalyticsSnapshot = {
  area: AreaScope;
  group: Group | null;
  metrics: Record<MetricKey, MetricSnapshot>;
  capacity: number;
  rent: number;
  coachSalary: number;
  athleteStats: AthleteStats;
  leadStats: LeadStats;
};

export function encodeFavorite(favorite: AnalyticsFavorite): string {
  const areaPart = favorite.area === "all" ? "*" : encodeURIComponent(favorite.area);
  const groupPart = favorite.group ? encodeURIComponent(favorite.group) : "*";
  switch (favorite.kind) {
    case "metric":
      if (!favorite.group) {
        return [areaPart, favorite.metric, favorite.projection].join(FAVORITE_SEPARATOR);
      }
      return ["metric", areaPart, groupPart, favorite.metric, favorite.projection].join(FAVORITE_SEPARATOR);
    case "athlete":
      if (!favorite.group) {
        return ["athlete", areaPart, favorite.metric].join(FAVORITE_SEPARATOR);
      }
      return ["athlete", areaPart, groupPart, favorite.metric].join(FAVORITE_SEPARATOR);
    case "lead":
      if (!favorite.group) {
        return ["lead", areaPart, favorite.metric].join(FAVORITE_SEPARATOR);
      }
      return ["lead", areaPart, groupPart, favorite.metric].join(FAVORITE_SEPARATOR);
    default: {
      const exhaustiveCheck: never = favorite;
      return exhaustiveCheck;
    }
  }
}

export function decodeFavorite(id: string): AnalyticsFavorite | null {
  const parts = id.split(FAVORITE_SEPARATOR);
  if (!parts.length) {
    return null;
  }
  if (parts[0] === "metric" && (parts.length === 5 || parts.length === 4)) {
    if (parts.length === 5) {
      const [, areaPart, groupPart, metric, projection] = parts as [
        "metric",
        string,
        string,
        MetricKey,
        ProjectionKey,
      ];
      if (!METRIC_LABELS[metric] || !PROJECTION_LABELS[projection]) {
        return null;
      }
      const area = areaPart === "*" ? "all" : (decodeURIComponent(areaPart) as Area);
      const group = groupPart === "*" ? null : (decodeURIComponent(groupPart) as Group);
      return { kind: "metric", area, group, metric, projection };
    }
    const [, areaPart, metric, projection] = parts as ["metric", string, MetricKey, ProjectionKey];
    if (!METRIC_LABELS[metric] || !PROJECTION_LABELS[projection]) {
      return null;
    }
    const area = areaPart === "*" ? "all" : (decodeURIComponent(areaPart) as Area);
    return { kind: "metric", area, group: null, metric, projection };
  }
  if (parts[0] === "athlete" && (parts.length === 4 || parts.length === 3)) {
    if (parts.length === 4) {
      const [, areaPart, groupPart, metric] = parts as ["athlete", string, string, AthleteMetricKey];
      if (!ATHLETE_METRIC_LABELS[metric]) {
        return null;
      }
      const area = areaPart === "*" ? "all" : (decodeURIComponent(areaPart) as Area);
      const group = groupPart === "*" ? null : (decodeURIComponent(groupPart) as Group);
      return { kind: "athlete", area, group, metric };
    }
    const [, areaPart, metric] = parts as ["athlete", string, AthleteMetricKey];
    if (!ATHLETE_METRIC_LABELS[metric]) {
      return null;
    }
    const area = areaPart === "*" ? "all" : (decodeURIComponent(areaPart) as Area);
    return { kind: "athlete", area, group: null, metric };
  }
  if (parts[0] === "lead" && (parts.length === 4 || parts.length === 3)) {
    if (parts.length === 4) {
      const [, areaPart, groupPart, metric] = parts as ["lead", string, string, LeadMetricKey];
      if (!LEAD_METRIC_LABELS[metric]) {
        return null;
      }
      const area = areaPart === "*" ? "all" : (decodeURIComponent(areaPart) as Area);
      const group = groupPart === "*" ? null : (decodeURIComponent(groupPart) as Group);
      return { kind: "lead", area, group, metric };
    }
    const [, areaPart, metric] = parts as ["lead", string, LeadMetricKey];
    if (!LEAD_METRIC_LABELS[metric]) {
      return null;
    }
    const area = areaPart === "*" ? "all" : (decodeURIComponent(areaPart) as Area);
    return { kind: "lead", area, group: null, metric };
  }
  if (parts.length === 3) {
    const [areaPart, metric, projection] = parts as [string, MetricKey, ProjectionKey];
    if (!METRIC_LABELS[metric] || !PROJECTION_LABELS[projection]) {
      return null;
    }
    const area = areaPart === "*" ? "all" : (decodeURIComponent(areaPart) as Area);
    return { kind: "metric", area, group: null, metric, projection };
  }
  return null;
}

const ensureNumber = (value: number | string): number => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }
    const normalized = trimmed.replace(/\s+/g, "");
    const withDecimal =
      normalized.includes(",") && !normalized.includes(".")
        ? normalized.replace(",", ".")
        : normalized.replace(/,/g, "");
    const parsed = Number.parseFloat(withDecimal);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return Number.isFinite(value) ? value : 0;
};

function ensureLeadHistoryEntries(entries?: LeadLifecycleEvent[]): LeadLifecycleEvent[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.filter((entry): entry is LeadLifecycleEvent => !!entry && typeof entry === "object");
}

function collectActiveAreas(db: DB): Area[] {
  const scheduled = new Set<Area>();
  for (const slot of db.schedule) {
    scheduled.add(slot.area);
  }

  const clientAreas = new Set<Area>();
  for (const client of db.clients) {
    for (const placement of getClientPlacements(client)) {
      if (isCanceledStatus(placement.status)) {
        continue;
      }
      if (placement.area) {
        clientAreas.add(placement.area);
      }
    }
  }

  const result: Area[] = [];
  for (const area of db.settings.areas) {
    if (scheduled.has(area) || clientAreas.has(area)) {
      result.push(area);
    }
  }
  const areas = result.length ? result : [...db.settings.areas];
  return areas.filter(area => !isReserveArea(area));
}

function groupsForArea(db: DB, area: Area): string[] {
  const groups = new Set<string>();
  for (const slot of db.schedule) {
    if (slot.area === area) {
      groups.add(slot.group);
    }
  }
  for (const client of db.clients) {
    for (const placement of getClientPlacements(client)) {
      if (isCanceledStatus(placement.status)) {
        continue;
      }
      if (placement.area === area && placement.group) {
        groups.add(placement.group);
      }
    }
  }
  return Array.from(groups);
}

function groupLimit(db: DB, area: Area, group: string): number {
  return db.settings.limits?.[`${area}|${group}`] ?? 0;
}

function deriveGroupPrice(db: DB, group: string, area?: Area | null): number {
  const cached = getDefaultPayAmount(group, area);
  if (cached != null) {
    return cached;
  }

  const amounts: number[] = [];

  for (const client of db.clients) {
    const placements = getClientPlacements(client);
    for (const placement of placements) {
      if (isCanceledStatus(placement.status)) {
        continue;
      }
      if (placement.group !== group) {
        continue;
      }
      if (area && placement.area !== area) {
        continue;
      }
      if (placement.payAmount != null) {
        amounts.push(ensureNumber(placement.payAmount));
      }
    }
  }

  if (!amounts.length) {
    return 0;
  }

  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return total / amounts.length;
}

function getClientForecastAmount(
  client: Client,
  area?: Area | null,
  group?: Group | null,
  period?: PeriodFilter,
  scope: AnalyticsScope = { area: "all", group: null },
): number {
  const placements = getClientPlacements(client);
  const effectiveScope = scope ?? { area: "all" as AreaScope, group: null };

  let actualFactsTotal = 0;
  if (period) {
    const history = normalizePaymentFacts(client.payHistory);
    const matchingFacts = history.filter(fact => {
      if (!matchesPeriod(fact, period)) {
        return false;
      }
      return factMatchesScope(fact.area, fact.group, effectiveScope, placements, client);
    });
    actualFactsTotal = matchingFacts.reduce((sum, fact) => sum + ensureNumber(fact.amount ?? 0), 0);
  }

  const scopedPlacements = resolveScopePlacements(client, placements);

  const placementsMatchingPeriod = !period
    ? scopedPlacements
    : scopedPlacements.filter(placement => {
        const referenceDate = placement.payDate ?? client.payDate ?? null;
        if (!referenceDate) {
          return true;
        }
        return matchesPeriod(referenceDate, period);
      });

  const matchesScope = (placement: (typeof placements)[number]): boolean => {
    if (group) {
      if (placement.group !== group) {
        return false;
      }
    }
    if (area) {
      if (placement.area !== area) {
        return false;
      }
    }
    return true;
  };

  const getExpectedRevenueForPlacement = (
    placement?: (typeof placements)[number],
  ): number => {
    const { amount, plan } = getPlacementPricing(client, placement, { area, group });
    const baseAmount = amount != null ? ensureNumber(amount) : 0;
    if (!period) {
      return baseAmount;
    }
    const cadenceMultiplier = getSubscriptionPlanCadenceMultiplier(plan, period);
    return baseAmount * cadenceMultiplier;
  };

  const matchingPlacements = placementsMatchingPeriod.filter(matchesScope);

  let expectedRevenue = 0;
  if (matchingPlacements.length > 0) {
    expectedRevenue = matchingPlacements.reduce(
      (sum, placement) => sum + getExpectedRevenueForPlacement(placement),
      0,
    );
  } else {
    const fallbackPlacement =
      (group
        ? placementsMatchingPeriod.find(placement => {
            if (placement.group !== group) {
              return false;
            }
            if (area && placement.area !== area) {
              return false;
            }
            return true;
          })
        : undefined) ??
      (area ? placementsMatchingPeriod.find(placement => placement.area === area) : undefined) ??
      placementsMatchingPeriod[0];

    if (fallbackPlacement) {
      expectedRevenue = getExpectedRevenueForPlacement(fallbackPlacement);
    } else if (!period) {
      expectedRevenue = getExpectedRevenueForPlacement();
    }
  }

  if (period && actualFactsTotal > 0) {
    return Math.max(expectedRevenue, actualFactsTotal);
  }

  return expectedRevenue;
}

type AnalyticsScope = {
  area: AreaScope;
  group: Group | null;
};

function factMatchesScope(
  factArea: Area | undefined,
  factGroup: Group | undefined,
  scope: AnalyticsScope,
  placements: ReturnType<typeof getClientPlacements>,
  client: Client,
): boolean {
  const scopedPlacements = resolveScopePlacements(client, placements);

  if (scope.area !== "all") {
    if (factArea) {
      if (factArea !== scope.area) {
        return false;
      }
    } else {
      const placementsInScopeArea = scopedPlacements.filter(
        placement => placement.area === scope.area,
      );
      if (!placementsInScopeArea.length) {
        return false;
      }
      const isAreaUnambiguous = scopedPlacements.every(placement => placement.area === scope.area);
      if (!isAreaUnambiguous) {
        return false;
      }
    }
  }

  if (scope.group) {
    if (factGroup) {
      if (factGroup !== scope.group) {
        return false;
      }
    } else {
      const placementsInScopedArea = scopedPlacements.filter(placement => {
        if (scope.area !== "all" && placement.area !== scope.area) {
          return false;
        }
        return true;
      });

      if (!placementsInScopedArea.length) {
        return false;
      }

      const matchingGroupPlacements = placementsInScopedArea.filter(
        placement => placement.group === scope.group,
      );
      if (!matchingGroupPlacements.length) {
        return false;
      }

      const isGroupUnambiguous = placementsInScopedArea.every(
        placement => placement.group === scope.group,
      );
      if (!isGroupUnambiguous) {
        return false;
      }
    }
  }

  return true;
}

function getClientActualAmount(
  client: Client,
  period?: PeriodFilter,
  scope: AnalyticsScope = { area: "all", group: null },
): number {
  if (period) {
    const history = normalizePaymentFacts(client.payHistory);
    const placements = getClientPlacements(client);
    const matchingFacts = history.filter(fact => {
      if (!matchesPeriod(fact, period)) {
        return false;
      }

      return factMatchesScope(fact.area, fact.group, scope, placements, client);
    });
    if (!matchingFacts.length) {
      return 0;
    }
    return matchingFacts.reduce((sum, fact) => sum + ensureNumber(fact.amount ?? 0), 0);
  }
  return ensureNumber(client.payActual ?? 0);
}

function capacityForArea(db: DB, area: Area): number {
  return groupsForArea(db, area).reduce((sum, group) => sum + groupLimit(db, area, group), 0);
}

function maxRevenueForArea(db: DB, area: Area): number {
  return groupsForArea(db, area).reduce((sum, group) => {
    const limit = groupLimit(db, area, group);
    if (!limit) {
      return sum;
    }
    const price = deriveGroupPrice(db, group, area);
    return sum + price * limit;
  }, 0);
}

function maxRevenueForGroup(db: DB, area: Area, group: string): number {
  const limit = groupLimit(db, area, group);
  if (!limit) {
    return 0;
  }
  const price = deriveGroupPrice(db, group, area);
  return price * limit;
}

function rentForAreas(db: DB, areas: Area[]): number {
  return areas.reduce((sum, area) => sum + ensureNumber(db.settings.rentByAreaEUR?.[area] ?? 0), 0);
}

function coachSalaryForAreas(db: DB, areas: Area[]): number {
  return areas.reduce((sum, area) => sum + ensureNumber(db.settings.coachSalaryByAreaEUR?.[area] ?? 0), 0);
}

type EarliestSlot = { time: string; weekday: number };

export function getAnalyticsGroups(db: DB, area: Area): Group[] {
  const groups = groupsForArea(db, area);
  if (groups.length <= 1) {
    return groups;
  }

  const earliestByGroup = new Map<Group, EarliestSlot>();
  for (const slot of db.schedule) {
    if (slot.area !== area) {
      continue;
    }

    const candidate: EarliestSlot = { time: slot.time, weekday: slot.weekday };
    const current = earliestByGroup.get(slot.group);
    if (!current) {
      earliestByGroup.set(slot.group, candidate);
      continue;
    }

    const timeCompare = candidate.time.localeCompare(current.time);
    if (timeCompare < 0 || (timeCompare === 0 && candidate.weekday < current.weekday)) {
      earliestByGroup.set(slot.group, candidate);
    }
  }

  return groups.sort((groupA, groupB) => {
    const earliestA = earliestByGroup.get(groupA);
    const earliestB = earliestByGroup.get(groupB);

    if (earliestA && earliestB) {
      const timeCompare = earliestA.time.localeCompare(earliestB.time);
      if (timeCompare !== 0) {
        return timeCompare;
      }
      const weekdayCompare = earliestA.weekday - earliestB.weekday;
      if (weekdayCompare !== 0) {
        return weekdayCompare;
      }
    } else if (earliestA) {
      return -1;
    } else if (earliestB) {
      return 1;
    }

    return groupA.localeCompare(groupB);
  });
}

export function getAnalyticsAreas(db: DB): AreaScope[] {
  const active = collectActiveAreas(db);
  const unique = new Set<Area>();
  active.forEach(area => unique.add(area));
  return ["all", ...Array.from(unique)];
}

export function computeAnalyticsSnapshot(
  db: DB,
  area: AreaScope,
  period?: PeriodFilter,
  group?: Group | null,
): AnalyticsSnapshot {
  const activeAreas = collectActiveAreas(db);
  const isReserveScope = area !== "all" && isReserveArea(area);
  const relevantAreas =
    area === "all"
      ? activeAreas.filter(activeArea => !isReserveArea(activeArea))
      : isReserveScope
        ? []
        : activeAreas.includes(area)
          ? [area]
          : [];
  if (!relevantAreas.length && area !== "all" && !isReserveScope) {
    relevantAreas.push(area);
  }

  const relevantAreaSet = new Set(relevantAreas);
  const scopedGroup = area === "all" ? null : group ?? null;
  const hasGroupScope = area !== "all" && typeof scopedGroup === "string" && scopedGroup.length > 0;
  const scope: AnalyticsScope = {
    area,
    group: hasGroupScope ? (scopedGroup as Group) : null,
  };
  const periodClients = db.clients.filter(client => {
    const placements = getClientPlacements(client);
    const scopedPlacements = resolveScopePlacements(client, placements);
    const matchesArea =
      area === "all"
        ? scopedPlacements.some(placement => relevantAreaSet.has(placement.area))
        : isReserveScope
          ? false
          : scopedPlacements.some(placement => placement.area === area);
    if (!matchesArea) {
      return false;
    }
    if (hasGroupScope) {
      const matchesGroup = scopedPlacements.some(
        placement => placement.area === area && placement.group === scopedGroup,
      );
      if (!matchesGroup) {
        return false;
      }
    }
    if (!period) {
      return true;
    }
    return isClientActiveInPeriod(client, period);
  });
  const rosterClients = periodClients.filter(client => !isCanceledStatus(client.status));
  const actualClients = rosterClients.filter(client => client.payStatus === "действует");

  const targetArea = area === "all" ? undefined : (area as Area);
  const targetGroup = hasGroupScope ? (scopedGroup as string) : undefined;

  const capacity = hasGroupScope
    ? groupLimit(db, area as Area, scopedGroup as string)
    : relevantAreas.reduce((sum, item) => sum + capacityForArea(db, item), 0);
  const rent = hasGroupScope ? 0 : rentForAreas(db, relevantAreas);
  const coachSalary = hasGroupScope ? 0 : coachSalaryForAreas(db, relevantAreas);

  const actualRevenue = periodClients.reduce(
    (sum, client) => sum + getClientActualAmount(client, period, scope),
    0,
  );
  const forecastRevenue = periodClients.reduce(
    (sum, client) => sum + getClientForecastAmount(client, targetArea, targetGroup, period, scope),
    0,
  );
  const maxRevenue = hasGroupScope
    ? maxRevenueForGroup(db, area as Area, scopedGroup as string)
    : relevantAreas.reduce((sum, item) => sum + maxRevenueForArea(db, item), 0);

  const totalExpenses = hasGroupScope ? 0 : rent + coachSalary;

  const actualProfit = hasGroupScope ? 0 : actualRevenue - totalExpenses;
  const forecastProfit = hasGroupScope ? 0 : forecastRevenue - totalExpenses;
  const maxProfit = hasGroupScope ? 0 : maxRevenue - totalExpenses;

  const actualFill = capacity ? (actualClients.length / capacity) * 100 : 0;
  const forecastFill = capacity ? (rosterClients.length / capacity) * 100 : 0;

  const metrics: AnalyticsSnapshot["metrics"] = {
    revenue: {
      unit: METRIC_UNITS.revenue,
      values: {
        actual: ensureNumber(actualRevenue),
        forecast: ensureNumber(forecastRevenue),
        remaining: Math.max(0, ensureNumber(forecastRevenue - actualRevenue)),
        target: ensureNumber(maxRevenue),
      },
    },
    profit: {
      unit: METRIC_UNITS.profit,
      values: {
        actual: ensureNumber(actualProfit),
        forecast: ensureNumber(forecastProfit),
        remaining: Math.max(0, ensureNumber(forecastProfit - actualProfit)),
        target: ensureNumber(maxProfit),
      },
    },
    fill: {
      unit: METRIC_UNITS.fill,
      values: {
        actual: ensureNumber(actualFill),
        forecast: ensureNumber(forecastFill),
        remaining: Math.max(0, ensureNumber(forecastFill - actualFill)),
        target: capacity ? 100 : 0,
      },
    },
    athletes: {
      unit: METRIC_UNITS.athletes,
      values: {
        actual: actualClients.length,
        forecast: rosterClients.length,
        remaining: Math.max(0, rosterClients.length - actualClients.length),
        target: capacity,
      },
    },
  };

  const clientIds = new Set(rosterClients.map(client => client.id));
  const attendanceEntries = db.attendance.filter(entry => {
    if (!clientIds.has(entry.clientId)) {
      return false;
    }
    if (!period) {
      return true;
    }
    return isAttendanceInPeriod(entry, period);
  });
  const attendanceTotal = attendanceEntries.length;
  const attendanceCame = attendanceEntries.filter(entry => entry.came).length;
  const attendanceRate = attendanceTotal ? (attendanceCame / attendanceTotal) * 100 : 0;

  const athleteStats: AthleteStats = {
    total: rosterClients.length,
    payments: periodClients.filter(client => getClientActualAmount(client, period, scope) > 0).length,
    new: rosterClients.filter(client => client.status === "новый").length,
    firstRenewals: rosterClients.filter(client => client.status === "продлившийся").length,
    canceled: periodClients.filter(client => isCanceledStatus(client.status)).length,
    returned: rosterClients.filter(client => client.status === "вернувшийся").length,
    dropIns: rosterClients.filter(client => (client.remainingLessons ?? 0) > 0).length,
    attendanceRate: ensureNumber(attendanceRate),
  };

  const leadHistoryEntries = ensureLeadHistoryEntries(db.leadHistory);
  const leadsById = new Map<string, Lead>();
  db.leads.forEach(lead => {
    leadsById.set(lead.id, lead);
  });
  db.leadsArchive.forEach(lead => {
    leadsById.set(lead.id, lead);
  });

  const matchesLeadScope = (leadArea?: Area | null, leadGroup?: Group | null): boolean => {
    if (area === "all") {
      return true;
    }
    if (leadArea !== area) {
      return false;
    }
    if (!hasGroupScope) {
      return true;
    }
    return leadGroup === scopedGroup;
  };

  const matchesLeadScopeById = (leadId: string): boolean => {
    const lead = leadsById.get(leadId);
    if (!lead) {
      return area === "all";
    }
    return matchesLeadScope(lead.area ?? null, lead.group ?? null);
  };

  const scopedHistoryEntries = leadHistoryEntries.filter(entry => {
    if (matchesLeadScope(entry.area ?? null, entry.group ?? null)) {
      return true;
    }
    if (entry.area || entry.group) {
      return false;
    }
    return matchesLeadScopeById(entry.leadId);
  });

  const creationMap = new Map<string, string>();
  const pushCreation = (leadId: string, value?: string | null) => {
    if (!leadId || !value || creationMap.has(leadId)) {
      return;
    }
    creationMap.set(leadId, value);
  };
  const pushLead = (lead: Lead) => {
    if (!matchesLeadScope(lead.area ?? null, lead.group ?? null)) {
      return;
    }
    pushCreation(lead.id, lead.createdAt ?? lead.updatedAt ?? null);
  };
  db.leads.forEach(pushLead);
  db.leadsArchive.forEach(pushLead);
  scopedHistoryEntries.forEach(entry => {
    if (!matchesLeadScope(entry.area ?? null, entry.group ?? null) && !matchesLeadScopeById(entry.leadId)) {
      return;
    }
    pushCreation(entry.leadId, entry.createdAt ?? entry.resolvedAt);
  });

  const createdCount = period
    ? Array.from(creationMap.values()).filter(value => matchesPeriod(value, period)).length
    : creationMap.size;

  const resolvedInPeriod = period
    ? scopedHistoryEntries.filter(entry => matchesPeriod(entry.resolvedAt, period))
    : scopedHistoryEntries;
  const convertedCount = resolvedInPeriod.filter(entry => entry.outcome === "converted").length;
  let canceledCount = resolvedInPeriod.filter(entry => entry.outcome === "canceled").length;

  const historyLeadIds = new Set(scopedHistoryEntries.map(entry => entry.leadId));
  const legacyCanceled = period
    ? db.leadsArchive.filter(
        lead =>
          !historyLeadIds.has(lead.id) &&
          matchesLeadScope(lead.area ?? null, lead.group ?? null) &&
          matchesPeriod(lead.updatedAt ?? lead.createdAt, period),
      ).length
    : db.leadsArchive.filter(lead => !historyLeadIds.has(lead.id) && matchesLeadScope(lead.area ?? null, lead.group ?? null))
        .length;
  canceledCount += legacyCanceled;

  const leadStats: LeadStats = {
    created: createdCount,
    converted: convertedCount,
    canceled: canceledCount,
  };

  return { area, group: hasGroupScope ? (scopedGroup as Group) : null, metrics, capacity, rent, coachSalary, athleteStats, leadStats };
}

export type FavoriteSummary = {
  id: string;
  title: string;
  value: string;
  accent: "green" | "sky" | "slate";
};

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatNumber(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify([locale, options]);
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, options);
    formatterCache.set(key, fmt);
  }
  return fmt;
}

export function formatMetricValue(
  value: number,
  unit: Unit,
  currency: Currency,
  rates: DB["settings"]["currencyRates"],
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  switch (unit) {
    case "money":
      return formatNumber("ru-RU", {
        style: "currency",
        currency,
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(
        convertMoney(value, currency, rates),
      );
    case "percent":
      return `${formatNumber("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
    default:
      return formatNumber("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  }
}

export function formatAthleteMetricValue(key: AthleteMetricKey, stats: AthleteStats): string {
  const value = stats[key];
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (key === "attendanceRate") {
    return `${formatNumber("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
  }
  return formatNumber("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

export function formatLeadMetricValue(key: LeadMetricKey, stats: LeadStats): string {
  const value = stats[key];
  if (!Number.isFinite(value)) {
    return "—";
  }
  return formatNumber("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

const METRIC_ACCENTS: Record<MetricKey, FavoriteSummary["accent"]> = {
  revenue: "sky",
  profit: "green",
  fill: "slate",
  athletes: "sky",
};

const ATHLETE_METRIC_ACCENTS: Record<AthleteMetricKey, FavoriteSummary["accent"]> = {
  total: "sky",
  payments: "green",
  new: "sky",
  firstRenewals: "green",
  canceled: "slate",
  returned: "green",
  dropIns: "slate",
  attendanceRate: "green",
};

const LEAD_METRIC_ACCENTS: Record<LeadMetricKey, FavoriteSummary["accent"]> = {
  created: "sky",
  converted: "green",
  canceled: "slate",
};

export function buildFavoriteSummaries(db: DB, currency: Currency, period?: PeriodFilter): FavoriteSummary[] {
  const favorites = db.settings.analyticsFavorites ?? [];
  if (!favorites.length) {
    return [];
  }
  const summaries: FavoriteSummary[] = [];
  const rates = db.settings.currencyRates;
  for (const id of favorites) {
    const decoded = decodeFavorite(id);
    if (!decoded) {
      continue;
    }
    const snapshot = computeAnalyticsSnapshot(db, decoded.area, period, decoded.group ?? null);
    const areaLabel = decoded.area === "all" ? "Все районы" : decoded.area;
    const scopeLabel = decoded.area === "all" || !decoded.group ? areaLabel : `${areaLabel} · ${decoded.group}`;
    if (decoded.kind === "metric") {
      const metric = snapshot.metrics[decoded.metric];
      if (!metric) {
        continue;
      }
      const value = metric.values[decoded.projection];
      const formatted = formatMetricValue(value, metric.unit, currency, rates);
      const title = `${PROJECTION_LABELS[decoded.projection]} · ${METRIC_LABELS[decoded.metric]} — ${scopeLabel}`;
      summaries.push({ id, title, value: formatted, accent: METRIC_ACCENTS[decoded.metric] });
      continue;
    }
    if (decoded.kind === "athlete") {
      const formatted = formatAthleteMetricValue(decoded.metric, snapshot.athleteStats);
      const title = `Спортсмены · ${ATHLETE_METRIC_LABELS[decoded.metric]} — ${scopeLabel}`;
      summaries.push({ id, title, value: formatted, accent: ATHLETE_METRIC_ACCENTS[decoded.metric] });
      continue;
    }
    if (decoded.kind === "lead") {
      const formatted = formatLeadMetricValue(decoded.metric, snapshot.leadStats);
      const title = `Лиды · ${LEAD_METRIC_LABELS[decoded.metric]} — ${scopeLabel}`;
      summaries.push({ id, title, value: formatted, accent: LEAD_METRIC_ACCENTS[decoded.metric] });
    }
  }
  return summaries;
}
