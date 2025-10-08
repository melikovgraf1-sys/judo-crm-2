import { DEFAULT_SUBSCRIPTION_PLAN } from "./payments";
import { calculateManualPayDate, requiresManualRemainingLessons } from "./lessons";
import { getClientPlacements } from "./clients";
import type { Client, ClientPlacement, ScheduleSlot, TaskItem } from "../types";

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

const findTargetPlacement = (
  placements: ClientPlacement[],
  task?: TaskItem | null,
): ClientPlacement => {
  if (!task) {
    return placements[0];
  }

  if (task.placementId) {
    const byId = placements.find(place => place.id === task.placementId);
    if (byId) {
      return byId;
    }
  }

  if (task.area && task.group) {
    const byAreaGroup = placements.find(place => place.area === task.area && place.group === task.group);
    if (byAreaGroup) {
      return byAreaGroup;
    }
  }

  return placements[0];
};

type PaymentCompletionParams = {
  client: Client;
  task?: TaskItem | null;
  schedule: ScheduleSlot[];
  completedAt: string;
  manualLessonsIncrement?: number;
};

export function resolvePaymentCompletion({
  client,
  task,
  schedule,
  completedAt,
  manualLessonsIncrement = 8,
}: PaymentCompletionParams): Partial<Client> {
  const placements = getClientPlacements(client);
  const targetPlacement = findTargetPlacement(placements, task);

  const payAmount = targetPlacement?.payAmount ?? client.payAmount;
  const resolvedPayActual = payAmount ?? targetPlacement?.payActual ?? client.payActual;

  const updates: Partial<Client> = {
    payStatus: "действует",
    ...(resolvedPayActual != null ? { payActual: resolvedPayActual } : {}),
  };

  const completionDate = toUTCDate(completedAt);
  const currentPayDate = toUTCDate(targetPlacement?.payDate ?? client.payDate ?? null);
  const startDate = toUTCDate(client.startDate ?? null);
  const plan = targetPlacement?.subscriptionPlan ?? client.subscriptionPlan ?? DEFAULT_SUBSCRIPTION_PLAN;

  let historyAnchor: Date | null = null;
  let nextPayDate: Date | null = null;
  let nextRemainingLessons: number | undefined;

  if (requiresManualRemainingLessons(targetPlacement.group)) {
    const currentRemaining = targetPlacement.remainingLessons ?? client.remainingLessons ?? 0;
    nextRemainingLessons = Math.max(0, currentRemaining + manualLessonsIncrement);
    const baseDate = completionDate ?? currentPayDate ?? startDate ?? new Date();
    const manualDue = calculateManualPayDate(
      targetPlacement.area ?? client.area,
      targetPlacement.group,
      nextRemainingLessons,
      schedule,
      baseDate,
    );
    if (manualDue) {
      nextPayDate = manualDue;
    }
    historyAnchor = completionDate ?? baseDate;
  } else if (plan === "half-month") {
    const base = completionDate ?? currentPayDate ?? startDate;
    if (base) {
      const candidate = new Date(base.getTime());
      candidate.setUTCDate(candidate.getUTCDate() + 14);
      nextPayDate = candidate;
    }
  } else if (plan === "monthly" || plan === "discount") {
    const base = currentPayDate ?? startDate ?? completionDate;
    if (base) {
      nextPayDate = addMonths(base, 1);
    }

    if (completionDate && currentPayDate) {
      historyAnchor =
        completionDate.getTime() < currentPayDate.getTime() ? completionDate : currentPayDate;
    } else if (completionDate) {
      historyAnchor = completionDate;
    } else if (currentPayDate) {
      historyAnchor = currentPayDate;
    } else if (startDate) {
      historyAnchor = startDate;
    }
  } else {
    const base = completionDate ?? currentPayDate ?? startDate;
    if (base) {
      historyAnchor = base;
      nextPayDate = base;
    }
  }

  if (nextPayDate) {
    updates.payDate = nextPayDate.toISOString();
  }

  if (historyAnchor) {
    const historyValue = historyAnchor.toISOString();
    const existingHistory = Array.isArray(client.payHistory) ? client.payHistory : [];
    if (!existingHistory.includes(historyValue)) {
      updates.payHistory = [...existingHistory, historyValue];
    }
  }

  if (typeof nextRemainingLessons === "number") {
    updates.remainingLessons = nextRemainingLessons;
  }

  if (targetPlacement) {
    const nextPlacement: ClientPlacement = {
      ...targetPlacement,
      payStatus: "действует",
      ...(updates.payActual != null ? { payActual: updates.payActual } : {}),
    };

    if (nextPayDate) {
      nextPlacement.payDate = nextPayDate.toISOString();
    }
    if (typeof nextRemainingLessons === "number") {
      nextPlacement.remainingLessons = nextRemainingLessons;
    }

    const nextPlacements = placements.map(place => (place.id === nextPlacement.id ? nextPlacement : place));
    updates.placements = nextPlacements;

    const primaryPlacementId = placements[0]?.id;
    if (primaryPlacementId === nextPlacement.id) {
      updates.area = nextPlacement.area;
      updates.group = nextPlacement.group;
      updates.subscriptionPlan = nextPlacement.subscriptionPlan;
      if (nextPlacement.payAmount != null) {
        updates.payAmount = nextPlacement.payAmount;
      }
      if (nextPlacement.payActual != null) {
        updates.payActual = nextPlacement.payActual;
      }
      if (nextPlacement.payDate) {
        updates.payDate = nextPlacement.payDate;
      }
      if (typeof nextPlacement.remainingLessons === "number") {
        updates.remainingLessons = nextPlacement.remainingLessons;
      }
    }
  }

  return updates;
}
