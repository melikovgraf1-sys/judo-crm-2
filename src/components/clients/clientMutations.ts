import { getDefaultPayAmount, shouldAllowCustomPayAmount } from "../../state/payments";
import { parseDateInput } from "../../state/utils";
import { requiresManualRemainingLessons } from "../../state/lessons";
import type { Client, ClientFormValues, Group } from "../../types";

export function resolvePayAmount(rawValue: string, group: Group, previous?: number): number | undefined {
  const defaultAmount = getDefaultPayAmount(group);
  if (!shouldAllowCustomPayAmount(group) && defaultAmount != null) {
    return defaultAmount;
  }

  const parsed = Number.parseFloat(rawValue);
  if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
    return parsed;
  }

  if (defaultAmount != null) {
    return defaultAmount;
  }

  return previous;
}

export function transformClientFormValues(
  data: ClientFormValues,
  editing?: Client | null,
): Omit<Client, "id"> {
  const { payAmount: payAmountRaw, remainingLessons: remainingLessonsRaw, ...rest } = data;
  const { lastName, parentName, phone, whatsApp, telegram, instagram, ...base } = rest;
  const resolvedPayAmount = resolvePayAmount(payAmountRaw, rest.group, editing?.payAmount);
  let resolvedRemaining: number | undefined;
  if (requiresManualRemainingLessons(rest.group)) {
    const parsedRemaining = Number.parseInt(remainingLessonsRaw, 10);
    if (!Number.isNaN(parsedRemaining)) {
      resolvedRemaining = parsedRemaining;
    }
  }

  return {
    ...base,
    ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
    ...(parentName.trim() ? { parentName: parentName.trim() } : {}),
    ...(phone.trim() ? { phone: phone.trim() } : {}),
    ...(whatsApp.trim() ? { whatsApp: whatsApp.trim() } : {}),
    ...(telegram.trim() ? { telegram: telegram.trim() } : {}),
    ...(instagram.trim() ? { instagram: instagram.trim() } : {}),
    ...(resolvedPayAmount != null ? { payAmount: resolvedPayAmount } : {}),
    ...(resolvedRemaining != null ? { remainingLessons: resolvedRemaining } : {}),
    birthDate: parseDateInput(data.birthDate),
    startDate: parseDateInput(data.startDate),
    payDate: parseDateInput(data.payDate),
  };
}
