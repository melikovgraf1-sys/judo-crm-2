import type {
  Area,
  Client,
  ClientPlacement,
  Group,
  PaymentStatus,
  SubscriptionPlan,
  TaskItem,
} from "../types";
import type { PeriodFilter } from "./period";
import { applyClientStatusAutoTransition } from "./clientLifecycle";

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

export function shouldAllowCustomPayAmount(group: string): boolean {
  return isIndividualGroup(group) || isAdultGroup(group);
}

export function getDefaultPayAmount(group: string, area?: string | null): number | null {
  const override = resolveAreaGroupOverride(area, group);
  if (override != null) {
    return override;
  }
  if (isIndividualGroup(group)) {
    return 130;
  }
  if (isAdultGroup(group)) {
    return null;
  }
  return 55;
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

export function derivePaymentStatus(
  client: Client,
  tasks: TaskItem[],
  archivedTasks: TaskItem[] = [],
): PaymentStatus {
  const relevantTasks = tasks.concat(archivedTasks.filter(task => task.status === "done"));
  const relatedTasks = relevantTasks.filter(
    task =>
      task.topic === "оплата" &&
      task.assigneeType === "client" &&
      task.assigneeId === client.id,
  );

  if (!relatedTasks.length) {
    return client.payStatus;
  }

  if (relatedTasks.some(task => task.status !== "done")) {
    return "задолженность";
  }

  return "действует";
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
    const nextStatus = derivePaymentStatus(base, tasks, archivedTasks);
    const withPayStatus =
      base.payStatus === nextStatus ? base : { ...base, payStatus: nextStatus };
    return applyClientStatusAutoTransition(withPayStatus);
  });
}
