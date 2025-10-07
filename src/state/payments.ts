import type { Client, PaymentStatus, SubscriptionPlan, TaskItem } from "../types";
import { applyClientStatusAutoTransition } from "./clientLifecycle";

export const SUBSCRIPTION_PLANS: { value: SubscriptionPlan; label: string; amount: number | null }[] = [
  { value: "monthly", label: "Месячный абонемент", amount: 55 },
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

export function getDefaultPayAmount(group: string): number | null {
  if (isIndividualGroup(group)) {
    return 125;
  }
  if (isAdultGroup(group)) {
    return null;
  }
  return 55;
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
