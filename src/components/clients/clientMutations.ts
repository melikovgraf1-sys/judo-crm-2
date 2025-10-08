import {
  getDefaultPayAmount,
  getSubscriptionPlanAmount,
  shouldAllowCustomPayAmount,
  subscriptionPlanAllowsCustomAmount,
  subscriptionPlanRequiresManualRemainingLessons,
} from "../../state/payments";
import { parseDateInput, todayISO, uid } from "../../state/utils";
import { requiresManualRemainingLessons } from "../../state/lessons";
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
  const resolvedPayAmount = resolvePayAmount(
    placement.payAmount,
    placement.group,
    placement.subscriptionPlan,
    previous?.payAmount,
  );

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

  return {
    id: ensurePlacementId(placement, previous),
    area: placement.area,
    group: placement.group,
    payStatus: placement.payStatus,
    status: placement.status,
    subscriptionPlan: placement.subscriptionPlan,
    ...(resolvedPayAmount != null ? { payAmount: resolvedPayAmount } : {}),
    ...(resolvedPayActual != null ? { payActual: resolvedPayActual } : {}),
    ...(resolvedRemaining != null ? { remainingLessons: resolvedRemaining } : {}),
    ...(placement.payDate ? { payDate: parseDateInput(placement.payDate) } : {}),
  };
};

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
    placements,
    lastName,
    parentName,
    phone,
    whatsApp,
    telegram,
    instagram,
    comment,
    ...base
  } = data;

  if (!placements.length) {
    throw new Error("Укажите хотя бы одно тренировочное место");
  }

  if (placements.length > MAX_PLACEMENTS) {
    throw new Error(`Допускается не более ${MAX_PLACEMENTS} тренировочных мест`);
  }

  const previousPlacements = editing?.placements ?? [];

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

  return {
    ...base,
    area: primary.area,
    group: primary.group,
    payStatus: primary.payStatus,
    status: primary.status,
    subscriptionPlan: primary.subscriptionPlan,
    ...(primary.payDate ? { payDate: primary.payDate } : {}),
    ...(primary.payAmount != null ? { payAmount: primary.payAmount } : {}),
    ...(primary.payActual != null ? { payActual: primary.payActual } : {}),
    ...(primary.remainingLessons != null ? { remainingLessons: primary.remainingLessons } : {}),
    placements: normalizedPlacements,
    ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
    ...(parentName.trim() ? { parentName: parentName.trim() } : {}),
    ...(phone.trim() ? { phone: phone.trim() } : {}),
    ...(whatsApp.trim() ? { whatsApp: whatsApp.trim() } : {}),
    ...(telegram.trim() ? { telegram: telegram.trim() } : {}),
    ...(instagram.trim() ? { instagram: instagram.trim() } : {}),
    ...(normalizedComment ? { comment: normalizedComment } : {}),
    ...(statusUpdatedAt ? { statusUpdatedAt } : {}),
    birthDate: parseDateInput(data.birthDate),
    startDate: parseDateInput(data.startDate),
  };
}
