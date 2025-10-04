import {
  getDefaultPayAmount,
  getSubscriptionPlanAmount,
  shouldAllowCustomPayAmount,
  subscriptionPlanAllowsCustomAmount,
  subscriptionPlanRequiresManualRemainingLessons,
} from "../../state/payments";
import { parseDateInput, todayISO } from "../../state/utils";
import { requiresManualRemainingLessons } from "../../state/lessons";
import type { Client, ClientFormValues, Group, SubscriptionPlan } from "../../types";

export function resolvePayAmount(
  rawValue: string,
  group: Group,
  subscriptionPlan: SubscriptionPlan,
  previous?: number,
): number | undefined {
  const planAmount = getSubscriptionPlanAmount(subscriptionPlan);
  const defaultAmount = getDefaultPayAmount(group);
  const groupAllowsCustom = shouldAllowCustomPayAmount(group);
  const planAllowsCustom = subscriptionPlanAllowsCustomAmount(subscriptionPlan);

  if (planAmount != null && !groupAllowsCustom) {
    return planAmount;
  }

  if (!groupAllowsCustom && !planAllowsCustom && defaultAmount != null) {
    return defaultAmount;
  }

  const parsed = Number.parseFloat(rawValue);
  if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
    return parsed;
  }

  if (!groupAllowsCustom && !planAllowsCustom && defaultAmount != null) {
    return defaultAmount;
  }

  return previous;
}

export function transformClientFormValues(
  data: ClientFormValues,
  editing?: Client | null,
): Omit<Client, "id"> {
  const {
    payAmount: payAmountRaw,
    payActual: payActualRaw,
    remainingLessons: remainingLessonsRaw,
    subscriptionPlan,
    lastName,
    parentName,
    phone,
    whatsApp,
    telegram,
    instagram,
    ...base
  } = data;
  const resolvedPayAmount = resolvePayAmount(payAmountRaw, base.group, subscriptionPlan, editing?.payAmount);
  const resolvedPayActual = (() => {
    const normalized = payActualRaw.trim();
    if (!normalized.length) {
      return undefined;
    }
    const parsed = Number.parseFloat(normalized);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      return undefined;
    }
    return parsed;
  })();
  let resolvedRemaining: number | undefined;
  if (
    requiresManualRemainingLessons(base.group) ||
    subscriptionPlanRequiresManualRemainingLessons(subscriptionPlan)
  ) {
    const parsedRemaining = Number.parseInt(remainingLessonsRaw, 10);
    if (!Number.isNaN(parsedRemaining)) {
      resolvedRemaining = parsedRemaining;
    }
  }

  const statusChanged = !editing || editing.status !== base.status;
  const statusUpdatedAt = statusChanged ? todayISO() : editing?.statusUpdatedAt;

  return {
    ...base,
    subscriptionPlan,
    ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
    ...(parentName.trim() ? { parentName: parentName.trim() } : {}),
    ...(phone.trim() ? { phone: phone.trim() } : {}),
    ...(whatsApp.trim() ? { whatsApp: whatsApp.trim() } : {}),
    ...(telegram.trim() ? { telegram: telegram.trim() } : {}),
    ...(instagram.trim() ? { instagram: instagram.trim() } : {}),
    ...(resolvedPayAmount != null ? { payAmount: resolvedPayAmount } : {}),
    ...(resolvedPayActual != null ? { payActual: resolvedPayActual } : {}),
    ...(resolvedRemaining != null ? { remainingLessons: resolvedRemaining } : {}),
    ...(statusUpdatedAt ? { statusUpdatedAt } : {}),
    birthDate: parseDateInput(data.birthDate),
    startDate: parseDateInput(data.startDate),
    payDate: parseDateInput(data.payDate),
  };
}
