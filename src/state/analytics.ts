import { getDefaultPayAmount } from "./payments";
import type { Area, Client, Currency, DB } from "../types";

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

export type AnalyticsFavorite = {
  area: AreaScope;
  metric: MetricKey;
  projection: ProjectionKey;
};

export type MetricSnapshot = {
  unit: Unit;
  values: Record<ProjectionKey, number>;
};

export type AnalyticsSnapshot = {
  area: AreaScope;
  metrics: Record<MetricKey, MetricSnapshot>;
  capacity: number;
  rent: number;
};

export function encodeFavorite(favorite: AnalyticsFavorite): string {
  const areaPart = favorite.area === "all" ? "*" : encodeURIComponent(favorite.area);
  return [areaPart, favorite.metric, favorite.projection].join(FAVORITE_SEPARATOR);
}

export function decodeFavorite(id: string): AnalyticsFavorite | null {
  const parts = id.split(FAVORITE_SEPARATOR);
  if (parts.length !== 3) {
    return null;
  }
  const [areaPart, metric, projection] = parts as [string, MetricKey, ProjectionKey];
  if (!METRIC_LABELS[metric] || !PROJECTION_LABELS[projection]) {
    return null;
  }
  const area = areaPart === "*" ? "all" : (decodeURIComponent(areaPart) as Area);
  return { area, metric, projection };
}

const ensureNumber = (value: number) => (Number.isFinite(value) ? value : 0);

function collectActiveAreas(db: DB): Area[] {
  const scheduled = new Set<Area>();
  for (const slot of db.schedule) {
    scheduled.add(slot.area);
  }
  const result: Area[] = [];
  for (const area of db.settings.areas) {
    if (scheduled.has(area)) {
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

export function getAnalyticsAreas(db: DB): AreaScope[] {
  const active = collectActiveAreas(db);
  const unique = new Set<Area>();
  active.forEach(area => unique.add(area));
  return ["all", ...Array.from(unique)];
}

export function computeAnalyticsSnapshot(db: DB, area: AreaScope): AnalyticsSnapshot {
  const activeAreas = collectActiveAreas(db);
  const relevantAreas = area === "all" ? activeAreas : activeAreas.includes(area) ? [area] : [];
  if (!relevantAreas.length && area !== "all") {
    relevantAreas.push(area);
  }

  const relevantAreaSet = new Set(relevantAreas);
  const clients = db.clients.filter(client => area === "all" ? relevantAreaSet.has(client.area) : client.area === area);
  const actualClients = clients.filter(client => client.payStatus === "действует");

  const capacity = relevantAreas.reduce((sum, item) => sum + capacityForArea(db, item), 0);
  const rent = rentForAreas(db, relevantAreas);

  const actualRevenue = actualClients.reduce((sum, client) => sum + getClientAmount(client), 0);
  const forecastRevenue = clients.reduce((sum, client) => sum + getClientAmount(client), 0);
  const maxRevenue = relevantAreas.reduce((sum, item) => sum + maxRevenueForArea(db, item), 0);

  const actualProfit = actualRevenue - rent;
  const forecastProfit = forecastRevenue - rent;
  const maxProfit = maxRevenue - rent;

  const actualFill = capacity ? (actualClients.length / capacity) * 100 : 0;
  const forecastFill = capacity ? (clients.length / capacity) * 100 : 0;

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
        forecast: clients.length,
        remaining: Math.max(0, clients.length - actualClients.length),
        target: Math.max(0, capacity - actualClients.length),
      },
    },
  };

  return { area, metrics, capacity, rent };
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

const METRIC_ACCENTS: Record<MetricKey, FavoriteSummary["accent"]> = {
  revenue: "sky",
  profit: "green",
  fill: "slate",
  athletes: "sky",
};

export function buildFavoriteSummaries(db: DB, currency: Currency): FavoriteSummary[] {
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
    const snapshot = computeAnalyticsSnapshot(db, decoded.area);
    const metric = snapshot.metrics[decoded.metric];
    if (!metric) {
      continue;
    }
    const value = metric.values[decoded.projection];
    const formatted = formatMetricValue(value, metric.unit, currency);
    const areaLabel = decoded.area === "all" ? "Все районы" : decoded.area;
    const title = `${PROJECTION_LABELS[decoded.projection]} · ${METRIC_LABELS[decoded.metric]} — ${areaLabel}`;
    summaries.push({ id, title, value: formatted, accent: METRIC_ACCENTS[decoded.metric] });
  }
  return summaries;
}
