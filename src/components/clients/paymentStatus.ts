import type { Client, ClientPlacement, PaymentFact, PaymentStatus } from "../../types";
import { matchesPaymentFactPlacement } from "../../state/paymentFacts";

export const getClientPlacementsWithFallback = (client: Client): ClientPlacement[] => {
  if (Array.isArray(client.placements) && client.placements.length > 0) {
    return client.placements;
  }

  return [
    {
      id: client.id,
      area: client.area,
      group: client.group,
      payMethod: client.payMethod,
      payStatus: client.payStatus,
      status: client.status,
      subscriptionPlan: client.subscriptionPlan,
      payDate: client.payDate,
      payAmount: client.payAmount,
      payActual: client.payActual,
      remainingLessons: client.remainingLessons,
    },
  ];
};

export const getClientPlacementPayStatuses = (client: Client): PaymentStatus[] => {
  const placements = getClientPlacementsWithFallback(client);
  const unique = new Set<PaymentStatus>();

  placements.forEach(place => {
    if (place.payStatus) {
      unique.add(place.payStatus);
    }
  });

  if (unique.size > 0) {
    return Array.from(unique);
  }

  return [client.payStatus];
};

export const getClientPlacementDisplayStatus = (client: Client): PaymentStatus => {
  const statuses = getClientPlacementPayStatuses(client);

  if (statuses.includes("задолженность")) {
    return "задолженность";
  }

  if (statuses.includes("ожидание")) {
    return "ожидание";
  }

  if (statuses.includes("действует")) {
    return "действует";
  }

  return client.payStatus;
};

export const clientHasWaitingPaymentStatus = (client: Client): boolean => {
  return getClientPlacementDisplayStatus(client) === "ожидание";
};

type PlacementLike = Pick<ClientPlacement, "area" | "group"> | null | undefined;

export const matchesPlacement = (placement: PlacementLike, fact: PaymentFact): boolean => {
  if (!placement) {
    return matchesPaymentFactPlacement(null, fact);
  }

  return matchesPaymentFactPlacement(
    {
      area: placement.area,
      group: placement.group,
    },
    fact,
  );
};
