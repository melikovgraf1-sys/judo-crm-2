import {
  getAreaGroupOverride,
  getClientPaymentTotalsForPeriod,
  getGroupDefaultExpectedAmount,
  PAYMENT_SHORTFALL_TOLERANCE,
  getSubscriptionPlanAmount,
  getSubscriptionPlanAmountForGroup,
  shouldAllowCustomPayAmount,
  subscriptionPlanAllowsCustomAmount,
  subscriptionPlanRequiresManualRemainingLessons,
} from "../../state/payments";
import { parseDateInput, todayISO, uid } from "../../state/utils";
import { requiresManualRemainingLessons } from "../../state/lessons";
import { normalizePaymentFacts } from "../../state/paymentFacts";
import type {
  Client,
  ClientFormValues,
  ClientPlacement,
  ClientPlacementFormValues,
  Group,
  SubscriptionPlan,
} from "../../types";

const MAX_PLACEMENTS = 4;
const MAX_AREAS = 3;

const ensurePlacementId = (placement: ClientPlacementFormValues, previous?: ClientPlacement) => {
  if (placement.id) return placement.id;
  if (previous?.id) return previous.id;
  return `placement-${uid()}`;
};

const normalizePlacement = (
  placement: ClientPlacementFormValues,
  previous?: ClientPlacement,
): ClientPlacement => {
  const resolvedPayMethod = placement.payMethod ?? previous?.payMethod ?? "перевод";
  let resolvedPayAmount = resolvePayAmount(
    placement.payAmount,
    placement.group,
    placement.subscriptionPlan,
    previous?.payAmount,
    placement.area,
  );

  const isDiscountPlan = placement.subscriptionPlan === "discount";

  const resolvedPayActual = (() => {
    const normalized = placement.payActual.trim();
    if (!normalized.length) {
      return undefined;
    }
    const parsed = Number.parseFloat(normalized);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      return previous?.payActual;
    }
    return parsed;
  })();

  if (isDiscountPlan && resolvedPayActual != null) {
    resolvedPayAmount = resolvedPayActual;
  }

  let resolvedRemaining: number | undefined = previous?.remainingLessons;
  if (
    requiresManualRemainingLessons(placement.group) ||
    subscriptionPlanRequiresManualRemainingLessons(placement.subscriptionPlan)
  ) {
    const parsedRemaining = Number.parseInt(placement.remainingLessons, 10);
    if (!Number.isNaN(parsedRemaining)) {
      resolvedRemaining = parsedRemaining;
    }
  } else {
    resolvedRemaining = undefined;
  }

  const resolvedFrozenLessons = (() => {
    const normalized = placement.frozenLessons?.trim() ?? "";
    if (!normalized.length) {
      return undefined;
    }
    const parsed = Number.parseInt(normalized, 10);
    if (Number.isNaN(parsed)) {
      return previous?.frozenLessons;
    }
    return parsed;
  })();

  return {
    id: ensurePlacementId(placement, previous),
    area: placement.area,
    group: placement.group,
    payMethod: resolvedPayMethod,
    payStatus: isDiscountPlan ? "действует" : placement.payStatus,
    status: placement.status,
    subscriptionPlan: placement.subscriptionPlan,
    ...(resolvedPayAmount != null ? { payAmount: resolvedPayAmount } : {}),
    ...(resolvedPayActual != null ? { payActual: resolvedPayActual } : {}),
    ...(resolvedRemaining != null ? { remainingLessons: resolvedRemaining } : {}),
    ...(placement.payDate ? { payDate: parseDateInput(placement.payDate) } : {}),
    ...(resolvedFrozenLessons != null ? { frozenLessons: resolvedFrozenLessons } : {}),
  };
};

export function resolvePayAmount(
  rawValue: string,
  group: Group,
  subscriptionPlan: SubscriptionPlan,
  previous?: number,
  area?: string,
): number | undefined {
  const planAmount = getSubscriptionPlanAmount(subscriptionPlan);
  const groupPlanAmount = getSubscriptionPlanAmountForGroup(area, group, subscriptionPlan);
  const defaultAmount = getGroupDefaultExpectedAmount(area, group);
  const groupAllowsCustom = shouldAllowCustomPayAmount(group);
  const planAllowsCustom = subscriptionPlanAllowsCustomAmount(subscriptionPlan);
  const overrideAmount = getAreaGroupOverride(area, group);

  if (overrideAmount != null) {
    return overrideAmount;
  }

  if (planAmount != null && !groupAllowsCustom) {
    return groupPlanAmount ?? planAmount;
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
    placements,
    lastName,
    parentName,
    phone,
    whatsApp,
    telegram,
    instagram,
    comment,
    payMethod,
    ...base
  } = data;

  const previousPlacements = editing?.placements ?? [];
  const previousPayHistory = normalizePaymentFacts(editing?.payHistory);

  if (!placements.length) {
    if (!editing) {
      throw new Error("Укажите хотя бы одно тренировочное место");
    }

    const normalizedComment = comment.trim();

    const result: Partial<Omit<Client, "id">> = {
      ...base,
      ...(payMethod ? { payMethod } : {}),
      placements: [],
      ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
      ...(parentName.trim() ? { parentName: parentName.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(whatsApp.trim() ? { whatsApp: whatsApp.trim() } : {}),
      ...(telegram.trim() ? { telegram: telegram.trim() } : {}),
      ...(instagram.trim() ? { instagram: instagram.trim() } : {}),
      ...(normalizedComment ? { comment: normalizedComment } : {}),
      ...(previousPayHistory.length ? { payHistory: previousPayHistory } : {}),
      birthDate: parseDateInput(data.birthDate),
      startDate: parseDateInput(data.startDate),
    };

    return result as Omit<Client, "id">;
  }

  if (placements.length > MAX_PLACEMENTS) {
    throw new Error(`Допускается не более ${MAX_PLACEMENTS} тренировочных мест`);
  }

  const normalizedPlacements = placements.map((placement, index) =>
    normalizePlacement(
      placement,
      previousPlacements.find(prev => prev.id === placement.id) ?? previousPlacements[index],
    ),
  );

  const uniqueAreas = new Set(normalizedPlacements.map(p => p.area));
  if (uniqueAreas.size > MAX_AREAS) {
    throw new Error(`Клиент может быть привязан максимум к ${MAX_AREAS} районам`);
  }

  const primary = normalizedPlacements[0];
  const statusChanged = !editing || editing.status !== primary.status;
  const statusUpdatedAt = statusChanged ? todayISO() : editing?.statusUpdatedAt;
  const normalizedComment = comment.trim();

  const nextPayHistory = previousPayHistory;

  let result: Omit<Client, "id"> = {
    ...base,
    area: primary.area,
    group: primary.group,
    payMethod: primary.payMethod ?? payMethod,
    payStatus: primary.payStatus,
    status: primary.status,
    subscriptionPlan: primary.subscriptionPlan,
    ...(primary.payDate ? { payDate: primary.payDate } : {}),
    ...(primary.payAmount != null ? { payAmount: primary.payAmount } : {}),
    ...(primary.payActual != null ? { payActual: primary.payActual } : {}),
    ...(primary.remainingLessons != null ? { remainingLessons: primary.remainingLessons } : {}),
    ...(primary.frozenLessons != null ? { frozenLessons: primary.frozenLessons } : {}),
    placements: normalizedPlacements,
    ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
    ...(parentName.trim() ? { parentName: parentName.trim() } : {}),
    ...(phone.trim() ? { phone: phone.trim() } : {}),
    ...(whatsApp.trim() ? { whatsApp: whatsApp.trim() } : {}),
    ...(telegram.trim() ? { telegram: telegram.trim() } : {}),
    ...(instagram.trim() ? { instagram: instagram.trim() } : {}),
    ...(normalizedComment ? { comment: normalizedComment } : {}),
    ...(statusUpdatedAt ? { statusUpdatedAt } : {}),
    ...(nextPayHistory.length ? { payHistory: nextPayHistory } : {}),
    birthDate: parseDateInput(data.birthDate),
    startDate: parseDateInput(data.startDate),
  };

  return result;
}
