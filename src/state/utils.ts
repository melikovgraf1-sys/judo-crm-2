import type { Currency, Settings } from "../types";

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

export const convertMoney = (
  value: number,
  currency: Currency,
  rates: Settings["currencyRates"],
): number => {
  if (!Number.isFinite(value)) {
    return value;
  }
  const rate = currency === "EUR" ? 1 : rates?.[currency];
  const multiplier = typeof rate === "number" && Number.isFinite(rate) ? rate : 1;
  return value * multiplier;
};

export const fmtMoney = (v: number, c: Currency, rates: Settings["currencyRates"]) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: c }).format(convertMoney(v, c, rates));

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

const calcMonthDifference = (start: Date, end: Date) => {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  const base = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return base < 0 ? 0 : base;
};

export const calcExperienceMonths = (iso: string) => {
  const start = new Date(iso);
  const now = new Date();
  return calcMonthDifference(start, now);
};

export const calcExperience = (iso: string) => {
  const months = calcExperienceMonths(iso);
  if (months < 12) return `${months} мес.`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} г.${rest ? ` ${rest} мес.` : ""}`;
};

export { RESERVE_AREA_NAME, ensureReserveAreaIncluded, isReserveArea } from "./reserve";
