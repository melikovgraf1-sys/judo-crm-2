import { todayISO } from "./utils";
import type { Area, Group } from "../types";

const PREFIX = "judo_crm_filters_";

type StoredSelection = {
  date: string;
  area: Area | null;
  group: Group | null;
};

type StoredPeriod = {
  date: string;
  month: number | null;
  year: number | null;
};

function getStorage(): Storage | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}

function buildKey(key: string): string {
  return `${PREFIX}${key}`;
}

function buildPeriodKey(key: string): string {
  return `${PREFIX}${key}_period`;
}

export function readDailySelection(key: string): { area: Area | null; group: Group | null } {
  const storage = getStorage();
  if (!storage) {
    return { area: null, group: null };
  }
  const today = todayISO().slice(0, 10);
  try {
    const raw = storage.getItem(buildKey(key));
    if (!raw) {
      return { area: null, group: null };
    }
    const parsed = JSON.parse(raw) as StoredSelection | null;
    if (!parsed || parsed.date !== today) {
      storage.removeItem(buildKey(key));
      return { area: null, group: null };
    }
    return { area: parsed.area ?? null, group: parsed.group ?? null };
  } catch (err) {
    console.warn("Failed to read persisted selection", err);
    return { area: null, group: null };
  }
}

export function writeDailySelection(key: string, area: Area | null, group: Group | null) {
  const storage = getStorage();
  if (!storage) return;
  const today = todayISO().slice(0, 10);
  const payload: StoredSelection = { date: today, area, group };
  try {
    storage.setItem(buildKey(key), JSON.stringify(payload));
  } catch (err) {
    console.warn("Failed to persist selection", err);
  }
}

export function clearDailySelection(key: string) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(buildKey(key));
  } catch (err) {
    console.warn("Failed to clear selection", err);
  }
}

export function readDailyPeriod(key: string): { month: number | null; year: number | null } {
  const storage = getStorage();
  if (!storage) {
    return { month: null, year: null };
  }
  const today = todayISO().slice(0, 10);
  try {
    const raw = storage.getItem(buildPeriodKey(key));
    if (!raw) {
      return { month: null, year: null };
    }
    const parsed = JSON.parse(raw) as StoredPeriod | null;
    if (!parsed || parsed.date !== today) {
      storage.removeItem(buildPeriodKey(key));
      return { month: null, year: null };
    }
    const month = typeof parsed.month === "number" && parsed.month >= 1 && parsed.month <= 12 ? parsed.month : null;
    const year = typeof parsed.year === "number" ? parsed.year : null;
    return { month, year };
  } catch (err) {
    console.warn("Failed to read persisted period", err);
    return { month: null, year: null };
  }
}

export function writeDailyPeriod(key: string, month: number | null, year: number | null) {
  const storage = getStorage();
  if (!storage) return;
  const today = todayISO().slice(0, 10);
  const payload: StoredPeriod = { date: today, month: month ?? null, year: year ?? null };
  try {
    storage.setItem(buildPeriodKey(key), JSON.stringify(payload));
  } catch (err) {
    console.warn("Failed to persist period", err);
  }
}

export function clearDailyPeriod(key: string) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(buildPeriodKey(key));
  } catch (err) {
    console.warn("Failed to clear period", err);
  }
}
