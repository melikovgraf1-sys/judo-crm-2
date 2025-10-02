import type { Area, Currency } from "../types";

export const rnd = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const todayISO = () => {
  const now = new Date();
  const normalized = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return normalized.toISOString();
};

export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU").format(new Date(iso));

export const fmtMoney = (v: number, c: Currency) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: c }).format(v);

export const parseDateInput = (value: string) => {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : d.toISOString();
};

export const calcAgeYears = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
};

export const calcExperience = (iso: string) => {
  const start = new Date(iso);
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    now.getMonth() - start.getMonth();
  if (months < 12) return `${months} мес.`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} г.${rest ? ` ${rest} мес.` : ""}`;
};

export const RESERVE_AREA_NAME = "резерв";

export function isReserveArea(area?: Area | null): boolean {
  if (!area) {
    return false;
  }
  return area.trim().toLowerCase() === RESERVE_AREA_NAME;
}

export function ensureReserveAreaIncluded(areas: readonly Area[]): Area[] {
  if (areas.some(isReserveArea)) {
    return [...areas];
  }
  return [...areas, RESERVE_AREA_NAME];
}
