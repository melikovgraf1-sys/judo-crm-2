import type { Client, ClientStatus } from "../types";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function parseISODate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function getStatusAnchor(client: Client): Date | null {
  const candidates: Array<string | undefined> = [];
  if (client.statusUpdatedAt) {
    candidates.push(client.statusUpdatedAt);
  }
  if (!client.statusUpdatedAt && client.startDate) {
    candidates.push(client.startDate);
  }
  for (const candidate of candidates) {
    const parsed = parseISODate(candidate);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

const PROMOTION_RULES: Array<{ statuses: ClientStatus[]; next: ClientStatus }> = [
  { statuses: ["новый"], next: "продлившийся" },
  { statuses: ["продлившийся", "вернувшийся"], next: "действующий" },
];

export function applyClientStatusAutoTransition(client: Client): Client {
  if (client.payStatus !== "действует") {
    return client;
  }

  const rule = PROMOTION_RULES.find(entry => entry.statuses.includes(client.status));
  if (!rule) {
    return client;
  }

  const payDate = parseISODate(client.payDate);
  if (!payDate) {
    return client;
  }

  const statusSince = getStatusAnchor(client);
  if (!statusSince) {
    return client;
  }

  if (payDate.getTime() <= statusSince.getTime()) {
    return client;
  }

  const daysBetween = Math.floor((payDate.getTime() - statusSince.getTime()) / DAY_IN_MS);
  if (daysBetween <= 30) {
    return client;
  }

  if (client.status === rule.next) {
    return client;
  }

  return {
    ...client,
    status: rule.next,
    statusUpdatedAt: payDate.toISOString(),
  };
}

export function applyClientStatusAutoTransitions(clients: Client[]): Client[] {
  return clients.map(applyClientStatusAutoTransition);
}
