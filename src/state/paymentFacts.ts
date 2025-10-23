import type { Area, Group, PaymentFact, ScheduleSlot, SubscriptionPlan } from "../types";
import { getSubscriptionPlanMeta } from "./payments";

const parseAmountValue = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const normalized = trimmed.replace(/\s+/g, "");
    const withDecimal =
      normalized.includes(",") && !normalized.includes(".")
        ? normalized.replace(",", ".")
        : normalized.replace(/,/g, "");
    const parsed = Number.parseFloat(withDecimal);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const parseLessonsValue = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const normalized = trimmed.replace(/\s+/g, "");
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const monthFormatter = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});

function normalizeISO(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

export function formatPaymentPeriod(
  plan: SubscriptionPlan | undefined,
  referenceDate?: string | null,
): string | undefined {
  if (!plan) {
    return undefined;
  }

  const normalizedReference = normalizeISO(referenceDate);

  if (plan === "single") {
    return "1 день";
  }

  if (plan === "half-month") {
    return "14 дней";
  }

  if (plan === "discount") {
    if (normalizedReference) {
      return monthFormatter.format(new Date(normalizedReference));
    }

    return undefined;
  }

  if (normalizedReference) {
    return monthFormatter.format(new Date(normalizedReference));
  }

  return undefined;
}

export function createPaymentFact(options: {
  id?: string;
  area?: Area;
  group?: Group;
  paidAt?: string | null;
  recordedAt?: string | null;
  amount?: number | null;
  subscriptionPlan?: SubscriptionPlan | null;
  remainingLessons?: number | null;
  frozenLessons?: number | null;
}): PaymentFact {
  const { id, area, group, paidAt, recordedAt, amount, subscriptionPlan, remainingLessons, frozenLessons } = options;
  const normalizedPaidAt = normalizeISO(paidAt);
  const normalizedRecordedAt = normalizeISO(recordedAt);
  const effectiveDate = normalizedPaidAt ?? normalizedRecordedAt;
  const periodLabel = formatPaymentPeriod(subscriptionPlan ?? undefined, effectiveDate);
  const normalizedRemaining = parseLessonsValue(remainingLessons ?? undefined);
  const normalizedFrozen = parseLessonsValue(frozenLessons ?? undefined);

  const fact: PaymentFact = {
    id: id ?? `payment-${normalizedPaidAt ?? normalizedRecordedAt ?? "pending"}`,
    ...(area ? { area } : {}),
    ...(group ? { group } : {}),
    ...(normalizedPaidAt ? { paidAt: normalizedPaidAt } : {}),
    ...(normalizedRecordedAt ? { recordedAt: normalizedRecordedAt } : {}),
    ...(typeof amount === "number" ? { amount } : {}),
    ...(subscriptionPlan ? { subscriptionPlan } : {}),
    ...(periodLabel ? { periodLabel } : {}),
    ...(normalizedRemaining != null ? { remainingLessons: normalizedRemaining } : {}),
    ...(normalizedFrozen != null ? { frozenLessons: normalizedFrozen } : {}),
  };

  return fact;
}

export function isPaymentFact(value: unknown): value is PaymentFact {
  return Boolean(value) && typeof value === "object" && "id" in (value as Record<string, unknown>);
}

export function normalizePaymentFacts(source: unknown): PaymentFact[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((entry, index) => {
      if (!entry) {
        return null;
      }

      if (typeof entry === "string") {
        const normalized = normalizeISO(entry) ?? undefined;
        return createPaymentFact({
          id: `legacy-${index}-${normalized ?? "unknown"}`,
          paidAt: normalized ?? undefined,
        });
      }

      if (typeof entry === "object") {
        const fact = entry as PaymentFact;
        const id = typeof fact.id === "string" && fact.id.length
          ? fact.id
          : `legacy-${index}-${normalizeISO(fact.paidAt ?? fact.recordedAt) ?? "unknown"}`;
        const normalizedPaidAt = normalizeISO(fact.paidAt);
        const normalizedRecordedAt = normalizeISO(fact.recordedAt);
        const amount = parseAmountValue(fact.amount);
        const plan = fact.subscriptionPlan;
        const periodLabel = fact.periodLabel
          ?? formatPaymentPeriod(plan, normalizedPaidAt ?? normalizedRecordedAt);
        const remainingLessons = parseLessonsValue(fact.remainingLessons);
        const frozenLessons = parseLessonsValue(fact.frozenLessons);

        return {
          id,
          ...(fact.area ? { area: fact.area } : {}),
          ...(fact.group ? { group: fact.group } : {}),
          ...(normalizedPaidAt ? { paidAt: normalizedPaidAt } : {}),
          ...(normalizedRecordedAt ? { recordedAt: normalizedRecordedAt } : {}),
          ...(amount != null ? { amount } : {}),
          ...(plan ? { subscriptionPlan: plan } : {}),
          ...(periodLabel ? { periodLabel } : {}),
          ...(remainingLessons != null ? { remainingLessons } : {}),
          ...(frozenLessons != null ? { frozenLessons } : {}),
        };
      }

      return null;
    })
    .filter((fact): fact is PaymentFact => Boolean(fact));
}

export function getPaymentFactComparableDate(fact: PaymentFact | null | undefined): string | null {
  if (!fact) {
    return null;
  }
  return fact.paidAt ?? fact.recordedAt ?? null;
}

export function getPaymentFactPlanLabel(plan: SubscriptionPlan | undefined | null): string | undefined {
  return plan ? getSubscriptionPlanMeta(plan)?.label : undefined;
}

export type PlacementLike = { area?: Area; group?: Group; frozenLessons?: number | null } | null | undefined;

const MAX_FROZEN_LOOKAHEAD_DAYS = 366 * 2;

const isoWeekday = (date: Date): number => {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
};

const buildSessionsPerWeekday = (
  schedule: ScheduleSlot[] | undefined,
  area: Area,
  group: Group,
): Map<number, number> | null => {
  if (!schedule?.length) {
    return null;
  }

  const relevant = schedule.filter(slot => slot.area === area && slot.group === group);
  if (!relevant.length) {
    return null;
  }

  const sessionsPerWeekday = new Map<number, number>();
  for (const slot of relevant) {
    sessionsPerWeekday.set(slot.weekday, (sessionsPerWeekday.get(slot.weekday) ?? 0) + 1);
  }

  return sessionsPerWeekday;
};

const findNthSessionDate = (
  sessionsPerWeekday: Map<number, number>,
  start: Date,
  occurrence: number,
): Date | null => {
  if (occurrence < 1) {
    return null;
  }

  let count = 0;
  const cursor = new Date(start.getTime());

  for (let i = 0; i < MAX_FROZEN_LOOKAHEAD_DAYS; i += 1) {
    const weekday = isoWeekday(cursor);
    const sessions = sessionsPerWeekday.get(weekday) ?? 0;
    if (sessions > 0) {
      for (let index = 0; index < sessions; index += 1) {
        count += 1;
        if (count === occurrence) {
          return new Date(cursor.getTime());
        }
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return null;
};

const adjustDueDateByFrozenLessons = (
  baseDueDate: Date,
  options: {
    schedule?: ScheduleSlot[];
    area?: Area;
    group?: Group;
    frozenLessons?: number | null;
  },
): Date | null => {
  const { area, group, schedule, frozenLessons } = options;
  if (!area || !group || !schedule?.length) {
    return null;
  }

  const rawFrozen = typeof frozenLessons === "number" ? Math.floor(frozenLessons) : 0;
  const effectiveFrozen = rawFrozen > 0 ? rawFrozen : 0;
  if (effectiveFrozen === 0) {
    return null;
  }

  const sessionsPerWeekday = buildSessionsPerWeekday(schedule, area, group);
  if (!sessionsPerWeekday) {
    return null;
  }

  const start = new Date(baseDueDate.getTime());
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + 1);

  const occurrencesToFind = effectiveFrozen;
  const target = findNthSessionDate(sessionsPerWeekday, start, occurrencesToFind);
  if (!target) {
    return null;
  }

  target.setUTCHours(0, 0, 0, 0);
  return target;
};

export function matchesPaymentFactPlacement(
  placement: PlacementLike,
  fact: PaymentFact,
): boolean {
  if (!placement) {
    return true;
  }

  const matchesArea = !placement.area || !fact.area || fact.area === placement.area;
  const matchesGroup = !placement.group || !fact.group || fact.group === placement.group;

  return matchesArea && matchesGroup;
}

const toUTCDate = (value?: string | null): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

const addMonths = (date: Date, count: number) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetMonthIndex = month + count;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDay);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
};

const addDays = (date: Date, count: number) => {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  result.setUTCDate(result.getUTCDate() + count);
  return result;
};

const getComparableTimestamp = (fact: PaymentFact): number | null => {
  const comparable = getPaymentFactComparableDate(fact);
  if (!comparable) {
    return null;
  }
  const timestamp = new Date(comparable).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return timestamp;
};

export function getLatestPaymentFact(
  facts: PaymentFact[],
  placement?: PlacementLike,
): PaymentFact | undefined {
  let latest: PaymentFact | undefined;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const fact of facts) {
    if (placement && !matchesPaymentFactPlacement(placement, fact)) {
      continue;
    }

    const timestamp = getComparableTimestamp(fact);
    if (timestamp == null) {
      continue;
    }

    if (timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
      latest = fact;
    }
  }

  return latest;
}

export function getPaymentFactDueDate(
  fact: PaymentFact,
  options: { plan?: SubscriptionPlan | null; placement?: PlacementLike; schedule?: ScheduleSlot[] } = {},
): string | undefined {
  const plan = fact.subscriptionPlan ?? options.plan ?? undefined;
  if (!plan) {
    return undefined;
  }

  const comparable = getPaymentFactComparableDate(fact);
  if (!comparable) {
    return undefined;
  }

  const base = toUTCDate(comparable);
  if (!base) {
    return undefined;
  }

  let next: Date | null = base;

  if (plan === "half-month") {
    next = addDays(base, 14);
  } else if (plan === "monthly" || plan === "weekly" || plan === "discount") {
    next = addMonths(base, 1);
  }

  if (!next) {
    return undefined;
  }

  const frozenLessons =
    typeof fact.frozenLessons === "number"
      ? fact.frozenLessons
      : options.placement && typeof options.placement.frozenLessons === "number"
      ? options.placement.frozenLessons
      : null;

  const area = fact.area ?? options.placement?.area;
  const group = fact.group ?? options.placement?.group;
  const adjusted = adjustDueDateByFrozenLessons(next, {
    schedule: options.schedule,
    area: area ?? undefined,
    group: group ?? undefined,
    frozenLessons,
  });

  return (adjusted ?? next).toISOString();
}

export function getLatestFactDueDate(
  facts: PaymentFact[],
  placement?: PlacementLike,
  planHint?: SubscriptionPlan | null,
  schedule?: ScheduleSlot[],
): string | undefined {
  const latestFact = getLatestPaymentFact(facts, placement);
  if (!latestFact) {
    return undefined;
  }
  return getPaymentFactDueDate(latestFact, { plan: planHint, placement, schedule });
}

export function getLatestFactPaidAt(
  facts: PaymentFact[],
  placement?: PlacementLike,
): string | undefined {
  const latest = getLatestPaymentFact(facts, placement);
  if (!latest || !latest.paidAt) {
    return undefined;
  }
  return latest.paidAt;
}
