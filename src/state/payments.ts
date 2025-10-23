import type {
  Area,
  Client,
  ClientPlacement,
  Group,
  PaymentFact,
  PaymentStatus,
  SubscriptionPlan,
  TaskItem,
} from "../types";
import type { PeriodFilter } from "./period";
import { applyClientStatusAutoTransition } from "./clientLifecycle";
import { getClientPlacements } from "./clients";
import {
  getLatestFactDueDate,
  getLatestPaymentFact,
  getPaymentFactComparableDate,
  getPaymentFactDueDate,
  normalizePaymentFacts,
} from "./paymentFacts";
import { todayISO } from "./utils";

export const SUBSCRIPTION_PLANS: { value: SubscriptionPlan; label: string; amount: number | null }[] = [
  { value: "monthly", label: "Месячный абонемент", amount: 55 },
  { value: "weekly", label: "Раз в неделю", amount: 27.5 },
  { value: "half-month", label: "Полмесяца абонемент", amount: 27.5 },
  { value: "discount", label: "Скидка", amount: null },
  { value: "single", label: "Разовое занятие", amount: null },
];

export const DEFAULT_SUBSCRIPTION_PLAN: SubscriptionPlan = "monthly";

export function getSubscriptionPlanMeta(plan: SubscriptionPlan | undefined | null) {
  return SUBSCRIPTION_PLANS.find(option => option.value === plan);
}

export function getSubscriptionPlanAmount(plan: SubscriptionPlan | undefined | null): number | null {
  return getSubscriptionPlanMeta(plan)?.amount ?? null;
}

export function subscriptionPlanAllowsCustomAmount(plan: SubscriptionPlan | undefined | null): boolean {
  return getSubscriptionPlanAmount(plan) == null;
}

export function subscriptionPlanRequiresManualRemainingLessons(
  plan: SubscriptionPlan | undefined | null,
): boolean {
  return plan === "single";
}

const INDIVIDUAL_GROUP_NAMES = ["индивидуальное", "индивидуальные", "индивидуальная", "индивидуал"];
const ADULT_GROUP_NAMES = ["взрослое", "взрослые", "взрослая"];
const FOCUS_GROUP_KEYWORDS = ["фокус", "focus"];

const normalize = (value: string | undefined | null) => value?.trim().toLowerCase() ?? "";

const AREA_GROUP_PRICE_OVERRIDES: Record<string, number> = {
  "джикджилли|фокус": 25,
};

const getOverrideKey = (area?: string | null, group?: string | null): string | null => {
  const normalizedArea = normalize(area);
  const normalizedGroup = normalize(group);
  if (!normalizedArea || !normalizedGroup) {
    return null;
  }
  return `${normalizedArea}|${normalizedGroup}`;
};

const resolveAreaGroupOverride = (area?: string | null, group?: string | null): number | null => {
  const key = getOverrideKey(area, group);
  if (!key) {
    return null;
  }
  const override = AREA_GROUP_PRICE_OVERRIDES[key];
  return override == null ? null : override;
};

export const getAreaGroupOverride = (
  area?: string | null,
  group?: string | null,
): number | null => {
  return resolveAreaGroupOverride(area, group);
};

export function isIndividualGroup(group: string): boolean {
  const normalized = normalize(group);
  return INDIVIDUAL_GROUP_NAMES.some(name => normalized === name);
}

export function isAdultGroup(group: string): boolean {
  const normalized = normalize(group);
  return ADULT_GROUP_NAMES.some(name => normalized === name);
}

export function isFocusGroup(group: string): boolean {
  const normalized = normalize(group);
  return FOCUS_GROUP_KEYWORDS.some(keyword => normalized.includes(keyword));
}

export function shouldAllowCustomPayAmount(group: string): boolean {
  return isIndividualGroup(group) || isAdultGroup(group);
}

type GroupPaymentMatrix = {
  allowedPlans: SubscriptionPlan[];
  defaultPlan: SubscriptionPlan;
  expectedAmounts: Partial<Record<SubscriptionPlan, number>>;
};

type GroupCategory = "individual" | "adult" | "focus" | "children";

const GROUP_PAYMENT_MATRICES: Record<GroupCategory, GroupPaymentMatrix> = {
  individual: {
    allowedPlans: ["monthly", "single"],
    defaultPlan: "monthly",
    expectedAmounts: {
      monthly: 130,
      single: 35,
    },
  },
  adult: {
    allowedPlans: ["monthly", "discount", "single"],
    defaultPlan: "monthly",
    expectedAmounts: {
      monthly: 55,
      discount: 55,
      single: 13,
    },
  },
  focus: {
    allowedPlans: ["weekly", "single"],
    defaultPlan: "weekly",
    expectedAmounts: {
      weekly: 35,
      single: 13,
    },
  },
  children: {
    allowedPlans: ["monthly", "weekly", "half-month", "discount", "single"],
    defaultPlan: "monthly",
    expectedAmounts: {
      monthly: 55,
      weekly: 27.5,
      "half-month": 27.5,
      discount: 55,
      single: 13,
    },
  },
};

const getGroupCategory = (group?: string | null): GroupCategory => {
  if (!group) {
    return "children";
  }
  if (isIndividualGroup(group)) {
    return "individual";
  }
  if (isAdultGroup(group)) {
    return "adult";
  }
  if (isFocusGroup(group)) {
    return "focus";
  }
  return "children";
};

const getGroupPaymentMatrix = (group?: string | null): GroupPaymentMatrix => {
  return GROUP_PAYMENT_MATRICES[getGroupCategory(group)];
};

export function getAllowedSubscriptionPlansForGroup(group?: string | null): SubscriptionPlan[] {
  return getGroupPaymentMatrix(group).allowedPlans;
}

export function getDefaultSubscriptionPlanForGroup(group?: string | null): SubscriptionPlan {
  const matrix = getGroupPaymentMatrix(group);
  return matrix.defaultPlan ?? DEFAULT_SUBSCRIPTION_PLAN;
}

export function getGroupDefaultExpectedAmount(
  area?: string | null,
  group?: string | null,
): number | null {
  const override = resolveAreaGroupOverride(area, group);
  if (override != null) {
    return override;
  }
  const matrix = getGroupPaymentMatrix(group);
  const amount = matrix.expectedAmounts[matrix.defaultPlan];
  return amount ?? null;
}

export function getSubscriptionPlanAmountForGroup(
  area: string | undefined | null,
  group: string | undefined | null,
  plan: SubscriptionPlan | undefined | null,
): number | null {
  const override = resolveAreaGroupOverride(area, group);
  if (override != null) {
    return override;
  }
  if (!plan) {
    return getGroupDefaultExpectedAmount(area, group);
  }
  const matrix = getGroupPaymentMatrix(group);
  const amount = matrix.expectedAmounts[plan];
  if (amount != null) {
    return amount;
  }
  const metaAmount = getSubscriptionPlanMeta(plan)?.amount;
  if (metaAmount != null) {
    return metaAmount;
  }
  return getGroupDefaultExpectedAmount(area, group);
}

export function getDefaultPayAmount(group: string, area?: string | null): number | null {
  return getGroupDefaultExpectedAmount(area, group);
}

type PricingOverrides = {
  area?: Area | null;
  group?: Group | null;
};

export function getPlacementPricing(
  client: Client,
  placement?: ClientPlacement | null,
  overrides: PricingOverrides = {},
): { amount: number | null; plan: SubscriptionPlan } {
  const resolvedArea = placement?.area ?? overrides.area ?? client.area;
  const resolvedGroup = placement?.group ?? overrides.group ?? client.group;
  const plan = placement?.subscriptionPlan ?? client.subscriptionPlan ?? DEFAULT_SUBSCRIPTION_PLAN;

  const overrideAmount = getAreaGroupOverride(resolvedArea, resolvedGroup);
  if (overrideAmount != null) {
    return { amount: overrideAmount, plan };
  }

  const resolvedPayAmount = placement?.payAmount ?? client.payAmount ?? null;
  if (resolvedPayAmount != null) {
    return { amount: resolvedPayAmount, plan };
  }

  return { amount: getDefaultPayAmount(resolvedGroup, resolvedArea), plan };
}

const getDaysInMonth = (year: number, month: number): number => {
  const date = new Date(Date.UTC(year, month, 0));
  return date.getUTCDate();
};

export function getSubscriptionPlanCadenceMultiplier(
  plan: SubscriptionPlan | undefined | null,
  period?: PeriodFilter,
): number {
  if (!period || period.month == null) {
    return 1;
  }

  if (plan === "half-month") {
    const daysInMonth = getDaysInMonth(period.year, period.month);
    return Math.max(1, Math.floor(daysInMonth / 14));
  }

  return 1;
}

export const PAYMENT_SHORTFALL_TOLERANCE = 0.5;

const CANCELED_STATUSES = new Set(["отмена", "отменен", "отменён", "cancelled"]);

const ensureNumber = (value: number | null | undefined): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return 0;
};

const parseISODate = (value?: string | null): Date | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getNextPayDate = (client: Client, placements: ClientPlacement[]): Date | null => {
  const candidateDates = placements
    .map(placement => parseISODate(placement.payDate))
    .filter((date): date is Date => date != null);

  if (candidateDates.length) {
    return candidateDates.reduce((earliest, current) =>
      current.getTime() < earliest.getTime() ? current : earliest,
    );
  }

  const clientPayDate = parseISODate(client.payDate);
  if (clientPayDate) {
    return clientPayDate;
  }

  const history = normalizePaymentFacts(client.payHistory);
  if (!history.length) {
    return null;
  }

  const factCandidateDates = placements
    .map(placement => {
      const planHint = placement.subscriptionPlan ?? client.subscriptionPlan ?? null;
      const dueISO = getLatestFactDueDate(history, placement, planHint);
      return parseISODate(dueISO);
    })
    .filter((date): date is Date => date != null);

  if (factCandidateDates.length) {
    return factCandidateDates.reduce((earliest, current) =>
      current.getTime() < earliest.getTime() ? current : earliest,
    );
  }

  const fallbackDueISO = getLatestFactDueDate(
    history,
    { area: client.area, group: client.group },
    client.subscriptionPlan ?? null,
  );
  return parseISODate(fallbackDueISO);
};

const isCanceledStatus = (status?: Client["status"] | string | null): boolean => {
  if (!status) {
    return false;
  }
  const normalized = status.toString().toLowerCase();
  return CANCELED_STATUSES.has(normalized);
};

const parseYearPart = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseMonthPart = (value?: string | null): number | null => {
  if (!value || value.length < 7) {
    return null;
  }
  const parsed = Number.parseInt(value.slice(5, 7), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed < 1 || parsed > 12) {
    return null;
  }
  return parsed;
};

const getCurrentPeriod = (): PeriodFilter => {
  const iso = todayISO();
  const year = parseYearPart(iso) ?? new Date().getUTCFullYear();
  const month = parseMonthPart(iso);
  return { year, month };
};

const factMatchesPeriod = (fact: PaymentFact, period: PeriodFilter): boolean => {
  const comparable = getPaymentFactComparableDate(fact);
  if (!comparable) {
    return false;
  }
  const year = parseYearPart(comparable);
  if (year == null || year !== period.year) {
    return false;
  }
  if (period.month == null) {
    return true;
  }
  const month = parseMonthPart(comparable);
  return month != null && month === period.month;
};

const isAfterPeriod = (iso: string | null | undefined, period: PeriodFilter): boolean => {
  if (!iso) {
    return false;
  }
  const year = parseYearPart(iso);
  if (year == null) {
    return false;
  }
  if (year > period.year) {
    return true;
  }
  if (year < period.year) {
    return false;
  }
  if (period.month == null) {
    return false;
  }
  const month = parseMonthPart(iso);
  if (month == null) {
    return false;
  }
  return month > period.month;
};

export function getClientPaymentTotalsForPeriod(
  client: Client,
  period: PeriodFilter = getCurrentPeriod(),
): { expected: number; actual: number } {
  const placements = getClientPlacements(client);
  const activePlacements = placements.filter(placement => !isCanceledStatus(placement.status));

  const expected = activePlacements.reduce((sum, placement) => {
    const { amount, plan } = getPlacementPricing(client, placement);
    const baseAmount = ensureNumber(amount);
    if (baseAmount <= 0) {
      return sum;
    }
    const cadenceMultiplier = getSubscriptionPlanCadenceMultiplier(plan, period);
    return sum + baseAmount * cadenceMultiplier;
  }, 0);

  const history = normalizePaymentFacts(client.payHistory);
  const matchingFacts = history.filter(fact => factMatchesPeriod(fact, period));
  if (matchingFacts.length > 0) {
    const actualFromFacts = matchingFacts.reduce(
      (sum, fact) => sum + ensureNumber(fact.amount ?? 0),
      0,
    );
    return { expected, actual: actualFromFacts };
  }

  const placementActualTotal = activePlacements.reduce(
    (sum, placement) => sum + ensureNumber(placement.payActual),
    0,
  );

  if (placementActualTotal > 0) {
    return { expected, actual: placementActualTotal };
  }

  return { expected, actual: ensureNumber(client.payActual) };
}

export type DerivedPaymentStatuses = {
  client: PaymentStatus;
  placements: Record<string, PaymentStatus>;
};

const paymentFactMatchesPlacement = (
  fact: PaymentFact,
  placement: ClientPlacement,
): boolean => {
  if (fact.area && fact.area !== placement.area) {
    return false;
  }
  if (fact.group && fact.group !== placement.group) {
    return false;
  }
  return true;
};

export function derivePaymentStatus(
  client: Client,
  tasks: TaskItem[],
  archivedTasks: TaskItem[] = [],
): DerivedPaymentStatuses {
  const placements = getClientPlacements(client);
  const period = getCurrentPeriod();
  const history = normalizePaymentFacts(client.payHistory);
  const relevantTasks = tasks
    .concat(archivedTasks.filter(task => task.status === "done"))
    .filter(
      task =>
        task.topic === "оплата" &&
        task.assigneeType === "client" &&
        task.assigneeId === client.id,
    );

  const placementStatuses: Record<string, PaymentStatus> = {};

  placements.forEach((placement, index) => {
    const placementId = placement.id ?? `${client.id}-${index}`;
    const placementTasks = relevantTasks.filter(task => {
      if (task.placementId) {
        return task.placementId === placementId;
      }
      return true;
    });

    const hasOpenTask = placementTasks.some(task => task.status !== "done");

    let status: PaymentStatus;
    if (hasOpenTask) {
      status = "задолженность";
    } else {
      const hasRecentFact = history.some(
        fact => factMatchesPeriod(fact, period) && paymentFactMatchesPlacement(fact, placement),
      );

      if (hasRecentFact) {
        status = "действует";
      } else {
        const latestFact = getLatestPaymentFact(history, placement);
        const planHint = placement.subscriptionPlan ?? client.subscriptionPlan ?? null;
        const comparable = getPaymentFactComparableDate(latestFact);
        const dueISO = latestFact ? getPaymentFactDueDate(latestFact, { plan: planHint }) : null;
        const hasDeferredFact = Boolean(
          latestFact && (isAfterPeriod(comparable, period) || isAfterPeriod(dueISO, period)),
        );

        status = hasDeferredFact ? "перенос" : "ожидание";
      }
    }

    placementStatuses[placementId] = status;
  });

  const derivedStatuses = Object.values(placementStatuses);
  let clientStatus: PaymentStatus;

  if (derivedStatuses.includes("задолженность")) {
    clientStatus = "задолженность";
  } else if (derivedStatuses.includes("действует")) {
    clientStatus = "действует";
  } else if (derivedStatuses.includes("перенос")) {
    clientStatus = "перенос";
  } else if (derivedStatuses.length > 0) {
    clientStatus = "ожидание";
  } else {
    clientStatus = client.payStatus;
  }

  return { client: clientStatus, placements: placementStatuses };
}

export function applyPaymentStatusRules(
  clients: Client[],
  tasks: TaskItem[],
  archivedTasks: TaskItem[] = [],
  updates: Partial<Record<string, Partial<Client>>> = {},
): Client[] {
  return clients.map(client => {
    const patch = updates[client.id];
    const base = patch ? { ...client, ...patch } : client;
    const { client: nextStatus, placements: placementStatuses } = derivePaymentStatus(
      base,
      tasks,
      archivedTasks,
    );
    const shouldUpdateStatus = base.payStatus !== nextStatus;
    let updatedPlacements = base.placements;

    if (Array.isArray(base.placements) && base.placements.length > 0) {
      let mutated = false;
      updatedPlacements = base.placements.map((placement, index) => {
        const placementId = placement.id ?? `${base.id}-${index}`;
        const derivedStatus = placementStatuses[placementId];
        if (!derivedStatus || placement.payStatus === derivedStatus) {
          return placement;
        }
        mutated = true;
        return { ...placement, payStatus: derivedStatus };
      });
      if (!mutated) {
        updatedPlacements = base.placements;
      }
    }

    const withPayStatus = shouldUpdateStatus || updatedPlacements !== base.placements
      ? {
          ...base,
          ...(shouldUpdateStatus ? { payStatus: nextStatus } : {}),
          ...(updatedPlacements !== base.placements ? { placements: updatedPlacements } : {}),
        }
      : base;

    return applyClientStatusAutoTransition(withPayStatus);
  });
}
