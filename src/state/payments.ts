import type { Client, PaymentStatus, SubscriptionPlan, TaskItem } from "../types";
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
