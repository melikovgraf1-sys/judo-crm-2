import { todayISO } from "./utils";
import type { AttendanceEntry, Client, DB, Lead, PerformanceEntry } from "../types";

export type PeriodFilter = {
  year: number;
  month: number | null;
};

const MONTH_PAD = new Intl.NumberFormat("ru-RU", { minimumIntegerDigits: 2 });

function parseYearPart(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function parseMonthPart(value?: string | null): number | null {
  if (!value || value.length < 7) {
    return null;
  }
  const month = Number.parseInt(value.slice(5, 7), 10);
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month : null;
}

function matchesParts(year: number, month: number | null, period: PeriodFilter): boolean {
  if (year !== period.year) {
    return false;
  }
  if (period.month == null) {
    return true;
  }
  return month === period.month;
}

export function matchesPeriod(value: string | null | undefined, period: PeriodFilter): boolean {
  if (!value) {
    return false;
  }
  const year = parseYearPart(value);
  if (year == null) {
    return false;
  }
  const month = parseMonthPart(value);
  return matchesParts(year, month, period);
}

export function isClientInPeriod(client: Client, period: PeriodFilter): boolean {
  return matchesPeriod(client.payDate ?? client.startDate, period);
}

export function isLeadInPeriod(lead: Lead, period: PeriodFilter): boolean {
  return matchesPeriod(lead.createdAt ?? lead.updatedAt, period);
}

export function isAttendanceInPeriod(entry: AttendanceEntry, period: PeriodFilter): boolean {
  return matchesPeriod(entry.date, period);
}

export function isPerformanceInPeriod(entry: PerformanceEntry, period: PeriodFilter): boolean {
  return matchesPeriod(entry.date, period);
}

export function filterClientsByPeriod(clients: Client[], period: PeriodFilter): Client[] {
  return clients.filter(client => isClientInPeriod(client, period));
}

export function filterLeadsByPeriod(leads: Lead[], period: PeriodFilter): Lead[] {
  return leads.filter(lead => isLeadInPeriod(lead, period));
}

export function filterAttendanceByPeriod(entries: AttendanceEntry[], period: PeriodFilter): AttendanceEntry[] {
  return entries.filter(entry => isAttendanceInPeriod(entry, period));
}

export function filterPerformanceByPeriod(entries: PerformanceEntry[], period: PeriodFilter): PerformanceEntry[] {
  return entries.filter(entry => isPerformanceInPeriod(entry, period));
}

export function getDefaultPeriod(): PeriodFilter {
  const today = todayISO();
  const year = parseYearPart(today) ?? new Date().getFullYear();
  const month = parseMonthPart(today);
  return { year, month };
}

export function formatMonthInput(period: PeriodFilter): string {
  if (period.month == null) {
    return "";
  }
  return `${period.year}-${MONTH_PAD.format(period.month)}`;
}

export function collectAvailableYears(db: DB): number[] {
  const years = new Set<number>();
  const push = (value?: string | null) => {
    const parsed = parseYearPart(value ?? undefined);
    if (parsed != null) {
      years.add(parsed);
    }
  };

  db.clients?.forEach?.(client => {
    push(client.payDate);
    push(client.startDate);
  });
  db.leads?.forEach?.(lead => {
    push(lead.createdAt);
    push(lead.updatedAt);
  });
  db.attendance?.forEach?.(entry => push(entry.date));
  db.performance?.forEach?.(entry => push(entry.date));

  if (!years.size) {
    years.add(new Date().getFullYear());
  }

  return Array.from(years).sort((a, b) => b - a);
}
