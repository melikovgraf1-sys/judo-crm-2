import type { Client, PaymentStatus, TaskItem } from "../types";

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

export function derivePaymentStatus(client: Client, tasks: TaskItem[]): PaymentStatus {
  const relatedTasks = tasks.filter(
    task =>
      task.topic === "оплата" &&
      task.assigneeType === "client" &&
      task.assigneeId === client.id,
  );

  if (!relatedTasks.length) {
    return "ожидание";
  }

  if (relatedTasks.some(task => task.status !== "done")) {
    return "задолженность";
  }

  return "действует";
}

export function applyPaymentStatusRules(clients: Client[], tasks: TaskItem[]): Client[] {
  return clients.map(client => {
    const nextStatus = derivePaymentStatus(client, tasks);
    if (client.payStatus === nextStatus) {
      return client;
    }
    return { ...client, payStatus: nextStatus };
  });
}
