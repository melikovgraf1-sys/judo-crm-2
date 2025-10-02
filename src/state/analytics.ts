import { getDefaultPayAmount } from "./payments";
import { isAttendanceInPeriod, isClientActiveInPeriod, matchesPeriod, type PeriodFilter } from "./period";
import type { Area, Client, Currency, DB, Lead, LeadLifecycleEvent } from "../types";

const CANCELED_STATUSES = new Set(["отмена", "отменен", "отменён", "cancelled"]);

const isCanceledStatus = (status?: Client["status"] | string | null): boolean => {
  if (!status) {
    return false;
  }
  const normalized = status.toString().toLowerCase();
  return CANCELED_STATUSES.has(normalized);
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
  target: "До цели",
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
      metric: MetricKey;
      projection: ProjectionKey;
    }
  | {
      kind: "athlete";
      area: AreaScope;
      metric: AthleteMetricKey;
    }
  | {
      kind: "lead";
      area: AreaScope;
      metric: LeadMetricKey;
    };

export type MetricSnapshot = {
  unit: Unit;
  values: Record<ProjectionKey, number>;
};

export type AthleteStats = {
  total: number;
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
  metrics: Record<MetricKey, MetricSnapshot>;
  capacity: number;
  rent: number;
  coachSalary: number;
  athleteStats: AthleteStats;
  leadStats: LeadStats;
};

export function encodeFavorite(favorite: AnalyticsFavorite): string {
  const areaPart = favorite.area === "all" ? "*" : encodeURIComponent(favorite.area);
  switch (favorite.kind) {
    case "metric":
      return [areaPart, favorite.metric, favorite.projection].join(FAVORITE_SEPARATOR);
    case "athlete":
      return ["athlete", areaPart, favorite.metric].join(FAVORITE_SEPARATOR);
    case "lead":
      return ["lead", areaPart, favorite.metric].join(FAVORITE_SEPARATOR);
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
  if (parts[0] === "metric" && parts.length === 4) {
    const [, areaPart, metric, projection] = parts as ["metric", string, MetricKey, ProjectionKey];
    if (!METRIC_LABELS[metric] || !PROJECTION_LABELS[projection]) {
      return null;
    }
    const area = areaPart === "*" ? "all" : (decodeURIComponent(areaPart) as Area);
    return { kind: "metric", area, metric, projection };
  }
  if (parts[0] === "athlete" && parts.length === 3) {
    const [, areaPart, metric] = parts as ["athlete", string, AthleteMetricKey];
    if (!ATHLETE_METRIC_LABELS[metric]) {
      return null;
    }
    const area = areaPart === "*" ? "all" : (decodeURIComponent(areaPart) as Area);
    return { kind: "athlete", area, metric };
  }
  if (parts[0] === "lead" && parts.length === 3) {
    const [, areaPart, metric] = parts as ["lead", string, LeadMetricKey];
    if (!LEAD_METRIC_LABELS[metric]) {
      return null;
    }
    const area = areaPart === "*" ? "all" : (decodeURIComponent(areaPart) as Area);
    return { kind: "lead", area, metric };
  }
  if (parts.length === 3) {
    const [areaPart, metric, projection] = parts as [string, MetricKey, ProjectionKey];
    if (!METRIC_LABELS[metric] || !PROJECTION_LABELS[projection]) {
      return null;
    }
    const area = areaPart === "*" ? "all" : (decodeURIComponent(areaPart) as Area);
    return { kind: "metric", area, metric, projection };
  }
  return null;
}

const ensureNumber = (value: number) => (Number.isFinite(value) ? value : 0);

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
    clientAreas.add(client.area);
  }

  const result: Area[] = [];
  for (const area of db.settings.areas) {
    if (scheduled.has(area) || clientAreas.has(area)) {
      result.push(area);
    }
  }
  return result.length ? result : [...db.settings.areas];
}

function groupsForArea(db: DB, area: Area): string[] {
  const groups = new Set<string>();
  for (const slot of db.schedule) {
    if (slot.area === area) {
      groups.add(slot.group);
    }
  }
  if (!groups.size) {
    for (const client of db.clients) {
      if (client.area === area) {
        groups.add(client.group);
      }
    }
  }
  return Array.from(groups);
}

function groupLimit(db: DB, area: Area, group: string): number {
  return db.settings.limits?.[`${area}|${group}`] ?? 0;
}

function deriveGroupPrice(db: DB, group: string): number {
  const cached = getDefaultPayAmount(group);
  if (cached != null) {
    return cached;
  }
  const relevant = db.clients.filter(client => client.group === group && client.payAmount != null);
  if (!relevant.length) {
    return 0;
  }
  const total = relevant.reduce((sum, client) => sum + (client.payAmount ?? 0), 0);
  return total / relevant.length;
}

function getClientAmount(client: Client): number {
  return ensureNumber(client.payAmount ?? getDefaultPayAmount(client.group) ?? 0);
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
    const price = deriveGroupPrice(db, group);
    return sum + price * limit;
  }, 0);
}

function rentForAreas(db: DB, areas: Area[]): number {
  return areas.reduce((sum, area) => sum + ensureNumber(db.settings.rentByAreaEUR?.[area] ?? 0), 0);
}

function coachSalaryForAreas(db: DB, areas: Area[]): number {
  return areas.reduce((sum, area) => sum + ensureNumber(db.settings.coachSalaryByAreaEUR?.[area] ?? 0), 0);
}

export function getAnalyticsAreas(db: DB): AreaScope[] {
  const active = collectActiveAreas(db);
  const unique = new Set<Area>();
  active.forEach(area => unique.add(area));
  return ["all", ...Array.from(unique)];
}

export function computeAnalyticsSnapshot(db: DB, area: AreaScope, period?: PeriodFilter): AnalyticsSnapshot {
  const activeAreas = collectActiveAreas(db);
  const relevantAreas = area === "all" ? activeAreas : activeAreas.includes(area) ? [area] : [];
  if (!relevantAreas.length && area !== "all") {
    relevantAreas.push(area);
  }

  const relevantAreaSet = new Set(relevantAreas);
  const periodClients = db.clients.filter(client => {
    const inScope = area === "all" ? relevantAreaSet.has(client.area) : client.area === area;
    if (!inScope) {
      return false;
    }
    if (!period) {
      return true;
    }
    return isClientActiveInPeriod(client, period);
  });
  const rosterClients = periodClients.filter(client => !isCanceledStatus(client.status));
  const actualClients = rosterClients.filter(client => client.payStatus === "действует");

  const capacity = relevantAreas.reduce((sum, item) => sum + capacityForArea(db, item), 0);
  const rent = rentForAreas(db, relevantAreas);
  const coachSalary = coachSalaryForAreas(db, relevantAreas);

  const actualRevenue = actualClients.reduce((sum, client) => sum + getClientAmount(client), 0);
  const forecastRevenue = rosterClients.reduce((sum, client) => sum + getClientAmount(client), 0);
  const maxRevenue = relevantAreas.reduce((sum, item) => sum + maxRevenueForArea(db, item), 0);

  const totalExpenses = rent + coachSalary;

  const actualProfit = actualRevenue - totalExpenses;
  const forecastProfit = forecastRevenue - totalExpenses;
  const maxProfit = maxRevenue - totalExpenses;

  const actualFill = capacity ? (actualClients.length / capacity) * 100 : 0;
  const forecastFill = capacity ? (rosterClients.length / capacity) * 100 : 0;

  const metrics: AnalyticsSnapshot["metrics"] = {
    revenue: {
      unit: METRIC_UNITS.revenue,
      values: {
        actual: ensureNumber(actualRevenue),
        forecast: ensureNumber(forecastRevenue),
        remaining: Math.max(0, ensureNumber(forecastRevenue - actualRevenue)),
        target: Math.max(0, ensureNumber(maxRevenue - actualRevenue)),
      },
    },
    profit: {
      unit: METRIC_UNITS.profit,
      values: {
        actual: ensureNumber(actualProfit),
        forecast: ensureNumber(forecastProfit),
        remaining: Math.max(0, ensureNumber(forecastProfit - actualProfit)),
        target: Math.max(0, ensureNumber(maxProfit - actualProfit)),
      },
    },
    fill: {
      unit: METRIC_UNITS.fill,
      values: {
        actual: ensureNumber(actualFill),
        forecast: ensureNumber(forecastFill),
        remaining: Math.max(0, ensureNumber(forecastFill - actualFill)),
        target: capacity ? Math.max(0, 100 - ensureNumber(actualFill)) : 0,
      },
    },
    athletes: {
      unit: METRIC_UNITS.athletes,
      values: {
        actual: actualClients.length,
        forecast: rosterClients.length,
        remaining: Math.max(0, rosterClients.length - actualClients.length),
        target: Math.max(0, capacity - actualClients.length),
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
    new: rosterClients.filter(client => client.status === "новый").length,
    firstRenewals: rosterClients.filter(client => client.status === "продлившийся").length,
    canceled: periodClients.filter(client => isCanceledStatus(client.status)).length,
    returned: rosterClients.filter(client => client.status === "вернувшийся").length,
    dropIns: rosterClients.filter(client => (client.remainingLessons ?? 0) > 0).length,
    attendanceRate: ensureNumber(attendanceRate),
  };

  const leadHistoryEntries = ensureLeadHistoryEntries(db.leadHistory);
  const creationMap = new Map<string, string>();
  const pushCreation = (leadId: string, value?: string | null) => {
    if (!leadId || !value || creationMap.has(leadId)) {
      return;
    }
    creationMap.set(leadId, value);
  };
  const pushLead = (lead: Lead) => {
    pushCreation(lead.id, lead.createdAt ?? lead.updatedAt ?? null);
  };
  db.leads.forEach(pushLead);
  db.leadsArchive.forEach(pushLead);
  leadHistoryEntries.forEach(entry => {
    pushCreation(entry.leadId, entry.createdAt ?? entry.resolvedAt);
  });

  const createdCount = period
    ? Array.from(creationMap.values()).filter(value => matchesPeriod(value, period)).length
    : creationMap.size;

  const resolvedInPeriod = period
    ? leadHistoryEntries.filter(entry => matchesPeriod(entry.resolvedAt, period))
    : leadHistoryEntries;
  const convertedCount = resolvedInPeriod.filter(entry => entry.outcome === "converted").length;
  let canceledCount = resolvedInPeriod.filter(entry => entry.outcome === "canceled").length;

  const historyLeadIds = new Set(leadHistoryEntries.map(entry => entry.leadId));
  const legacyCanceled = period
    ? db.leadsArchive.filter(lead => !historyLeadIds.has(lead.id) && matchesPeriod(lead.updatedAt ?? lead.createdAt, period))
        .length
    : db.leadsArchive.filter(lead => !historyLeadIds.has(lead.id)).length;
  canceledCount += legacyCanceled;

  const leadStats: LeadStats = {
    created: createdCount,
    converted: convertedCount,
    canceled: canceledCount,
  };

  return { area, metrics, capacity, rent, coachSalary, athleteStats, leadStats };
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

export function formatMetricValue(value: number, unit: Unit, currency: Currency): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  switch (unit) {
    case "money":
      return formatNumber("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
    case "percent":
      return `${formatNumber("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;
    default:
      return formatNumber("ru-RU", { maximumFractionDigits: 0 }).format(value);
  }
}

export function formatAthleteMetricValue(key: AthleteMetricKey, stats: AthleteStats): string {
  const value = stats[key];
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (key === "attendanceRate") {
    return `${formatNumber("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;
  }
  return formatNumber("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

export function formatLeadMetricValue(key: LeadMetricKey, stats: LeadStats): string {
  const value = stats[key];
  if (!Number.isFinite(value)) {
    return "—";
  }
  return formatNumber("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

const METRIC_ACCENTS: Record<MetricKey, FavoriteSummary["accent"]> = {
  revenue: "sky",
  profit: "green",
  fill: "slate",
  athletes: "sky",
};

const ATHLETE_METRIC_ACCENTS: Record<AthleteMetricKey, FavoriteSummary["accent"]> = {
  total: "sky",
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
  for (const id of favorites) {
    const decoded = decodeFavorite(id);
    if (!decoded) {
      continue;
    }
    const snapshot = computeAnalyticsSnapshot(db, decoded.area, period);
    const areaLabel = decoded.area === "all" ? "Все районы" : decoded.area;
    if (decoded.kind === "metric") {
      const metric = snapshot.metrics[decoded.metric];
      if (!metric) {
        continue;
      }
      const value = metric.values[decoded.projection];
      const formatted = formatMetricValue(value, metric.unit, currency);
      const title = `${PROJECTION_LABELS[decoded.projection]} · ${METRIC_LABELS[decoded.metric]} — ${areaLabel}`;
      summaries.push({ id, title, value: formatted, accent: METRIC_ACCENTS[decoded.metric] });
      continue;
    }
    if (decoded.kind === "athlete") {
      const formatted = formatAthleteMetricValue(decoded.metric, snapshot.athleteStats);
      const title = `Спортсмены · ${ATHLETE_METRIC_LABELS[decoded.metric]} — ${areaLabel}`;
      summaries.push({ id, title, value: formatted, accent: ATHLETE_METRIC_ACCENTS[decoded.metric] });
      continue;
    }
    if (decoded.kind === "lead") {
      const formatted = formatLeadMetricValue(decoded.metric, snapshot.leadStats);
      const title = `Лиды · ${LEAD_METRIC_LABELS[decoded.metric]} — ${areaLabel}`;
      summaries.push({ id, title, value: formatted, accent: LEAD_METRIC_ACCENTS[decoded.metric] });
    }
  }
  return summaries;
}
