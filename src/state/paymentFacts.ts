import type { Area, Group, PaymentFact, SubscriptionPlan } from "../types";
import { getSubscriptionPlanMeta } from "./payments";

const monthFormatter = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});

function normalizeISO(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

export function formatPaymentPeriod(
  plan: SubscriptionPlan | undefined,
  referenceDate?: string | null,
): string | undefined {
  if (!plan) {
    return undefined;
  }

  const normalizedReference = normalizeISO(referenceDate);

  if (plan === "single") {
    return "1 день";
  }

  if (plan === "half-month") {
    return "14 дней";
  }

  if (plan === "discount") {
    return "Произвольно";
  }

  if (normalizedReference) {
    return monthFormatter.format(new Date(normalizedReference));
  }

  return undefined;
}

export function createPaymentFact(options: {
  id?: string;
  area?: Area;
  group?: Group;
  paidAt?: string | null;
  recordedAt?: string | null;
  amount?: number | null;
  subscriptionPlan?: SubscriptionPlan | null;
}): PaymentFact {
  const { id, area, group, paidAt, recordedAt, amount, subscriptionPlan } = options;
  const normalizedPaidAt = normalizeISO(paidAt);
  const normalizedRecordedAt = normalizeISO(recordedAt);
  const effectiveDate = normalizedPaidAt ?? normalizedRecordedAt;
  const periodLabel = formatPaymentPeriod(subscriptionPlan ?? undefined, effectiveDate);

  const fact: PaymentFact = {
    id: id ?? `payment-${normalizedPaidAt ?? normalizedRecordedAt ?? "pending"}`,
    ...(area ? { area } : {}),
    ...(group ? { group } : {}),
    ...(normalizedPaidAt ? { paidAt: normalizedPaidAt } : {}),
    ...(normalizedRecordedAt ? { recordedAt: normalizedRecordedAt } : {}),
    ...(typeof amount === "number" ? { amount } : {}),
    ...(subscriptionPlan ? { subscriptionPlan } : {}),
    ...(periodLabel ? { periodLabel } : {}),
  };

  return fact;
}

export function isPaymentFact(value: unknown): value is PaymentFact {
  return Boolean(value) && typeof value === "object" && "id" in (value as Record<string, unknown>);
}

export function normalizePaymentFacts(source: unknown): PaymentFact[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((entry, index) => {
      if (!entry) {
        return null;
      }

      if (typeof entry === "string") {
        const normalized = normalizeISO(entry) ?? undefined;
        return createPaymentFact({
          id: `legacy-${index}-${normalized ?? "unknown"}`,
          paidAt: normalized ?? undefined,
        });
      }

      if (typeof entry === "object") {
        const fact = entry as PaymentFact;
        const id = typeof fact.id === "string" && fact.id.length
          ? fact.id
          : `legacy-${index}-${normalizeISO(fact.paidAt ?? fact.recordedAt) ?? "unknown"}`;
        const normalizedPaidAt = normalizeISO(fact.paidAt);
        const normalizedRecordedAt = normalizeISO(fact.recordedAt);
        const amount = typeof fact.amount === "number" ? fact.amount : undefined;
        const plan = fact.subscriptionPlan;
        const periodLabel = fact.periodLabel
          ?? formatPaymentPeriod(plan, normalizedPaidAt ?? normalizedRecordedAt);

        return {
          id,
          ...(fact.area ? { area: fact.area } : {}),
          ...(fact.group ? { group: fact.group } : {}),
          ...(normalizedPaidAt ? { paidAt: normalizedPaidAt } : {}),
          ...(normalizedRecordedAt ? { recordedAt: normalizedRecordedAt } : {}),
          ...(amount != null ? { amount } : {}),
          ...(plan ? { subscriptionPlan: plan } : {}),
          ...(periodLabel ? { periodLabel } : {}),
        };
      }

      return null;
    })
    .filter((fact): fact is PaymentFact => Boolean(fact));
}

export function getPaymentFactComparableDate(fact: PaymentFact | null | undefined): string | null {
  if (!fact) {
    return null;
  }
  return fact.paidAt ?? fact.recordedAt ?? null;
}

export function getPaymentFactPlanLabel(plan: SubscriptionPlan | undefined | null): string | undefined {
  return plan ? getSubscriptionPlanMeta(plan)?.label : undefined;
}
