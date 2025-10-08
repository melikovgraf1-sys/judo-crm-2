import type { Client, ClientPlacement, DB } from "../types";

export function getClientPlacements(client: Client): ClientPlacement[] {
  if (Array.isArray(client.placements) && client.placements.length) {
    return client.placements;
  }

  return [
    {
      id: client.id,
      area: client.area,
      group: client.group,
      payStatus: client.payStatus,
      status: client.status,
      subscriptionPlan: client.subscriptionPlan,
      payDate: client.payDate,
      payAmount: client.payAmount,
      payActual: client.payActual,
      remainingLessons: client.remainingLessons,
    },
  ];
}

export type DuplicateField =
  | "fullName"
  | "parentName"
  | "phone"
  | "whatsApp"
  | "telegram"
  | "instagram"
  | "area"
  | "group";

export type DuplicateMatchDetail = {
  field: DuplicateField;
  value: string;
};

export type ClientDuplicateMatch = {
  client: Client;
  matches: DuplicateMatchDetail[];
};

const CONTACT_FIELDS: Array<"phone" | "whatsApp" | "telegram" | "instagram"> = [
  "phone",
  "whatsApp",
  "telegram",
  "instagram",
];

type ComparableClient = Pick<
  Client,
  "firstName" | "lastName" | "parentName" | "phone" | "whatsApp" | "telegram" | "instagram"
> &
  Partial<Client>;

type NormalizedClient = {
  fullName: string;
  parentName: string;
  contacts: Record<(typeof CONTACT_FIELDS)[number], string>;
  area: string;
  group: string;
};

const normalizeWhitespace = (value: string): string => value.trim().replace(/\s+/g, " ").toLowerCase();

const normalizeName = (value?: string): string => {
  if (!value) return "";
  return normalizeWhitespace(value);
};

const normalizeFullName = (client: ComparableClient): string => {
  const first = normalizeName(client.firstName);
  const last = normalizeName(client.lastName);
  return `${first} ${last}`.trim();
};

const normalizeParentName = (client: ComparableClient): string => normalizeName(client.parentName);

const normalizePhone = (value?: string): string => {
  if (!value) return "";
  const digits = value.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("8")) {
    return `7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `7${digits}`;
  }
  return digits;
};

const normalizeHandle = (value?: string): string => {
  if (!value) return "";
  let normalized = value.trim().toLowerCase();
  normalized = normalized.replace(/^https?:\/\/(www\.)?t\.me\//, "");
  normalized = normalized.replace(/^https?:\/\/(www\.)?telegram\.me\//, "");
  normalized = normalized.replace(/^https?:\/\/(www\.)?instagram\.com\//, "");
  normalized = normalized.replace(/^@+/, "");
  normalized = normalized.replace(/\s+/g, "");
  normalized = normalized.replace(/\/+$/, "");
  return normalized;
};

const normalizeContacts = (client: ComparableClient): Record<(typeof CONTACT_FIELDS)[number], string> => ({
  phone: normalizePhone(client.phone),
  whatsApp: normalizePhone(client.whatsApp),
  telegram: normalizeHandle(client.telegram),
  instagram: normalizeHandle(client.instagram),
});

const getNormalizedClient = (client: ComparableClient): NormalizedClient => ({
  fullName: normalizeFullName(client),
  parentName: normalizeParentName(client),
  contacts: normalizeContacts(client),
  area: normalizeWhitespace(client.area ?? ""),
  group: normalizeWhitespace(client.group ?? ""),
});

const formatClientName = (client: ComparableClient): string => {
  const lastName = client.lastName?.trim();
  return [client.firstName.trim(), lastName].filter(Boolean).join(" ");
};

const duplicateFieldValue = (client: ComparableClient, field: DuplicateField): string => {
  switch (field) {
    case "fullName":
      return formatClientName(client);
    case "parentName":
      return client.parentName?.trim() ?? "";
    case "phone":
    case "whatsApp":
    case "telegram":
    case "instagram":
      return client[field]?.trim() ?? "";
    case "area":
      return client.area?.trim() ?? "";
    case "group":
      return client.group?.trim() ?? "";
    default:
      return "";
  }
};

export function findClientDuplicates(
  db: DB,
  candidate: ComparableClient,
  options: { excludeId?: string | null } = {},
): ClientDuplicateMatch[] {
  const matches: ClientDuplicateMatch[] = [];
  const normalizedCandidate = getNormalizedClient(candidate);
  const seen = new Set<string>();

  for (const client of db.clients) {
    if (options.excludeId && client.id === options.excludeId) {
      continue;
    }

    const normalizedExisting = getNormalizedClient(client);
    const details: DuplicateMatchDetail[] = [];

    if (
      normalizedCandidate.fullName &&
      normalizedCandidate.fullName === normalizedExisting.fullName
    ) {
      details.push({ field: "fullName", value: formatClientName(client) });
    }

    if (
      normalizedCandidate.parentName &&
      normalizedCandidate.parentName === normalizedExisting.parentName
    ) {
      details.push({ field: "parentName", value: duplicateFieldValue(client, "parentName") });
    }

    if (normalizedCandidate.area && normalizedCandidate.area === normalizedExisting.area) {
      details.push({ field: "area", value: duplicateFieldValue(client, "area") });
    }

    if (normalizedCandidate.group && normalizedCandidate.group === normalizedExisting.group) {
      details.push({ field: "group", value: duplicateFieldValue(client, "group") });
    }

    for (const candidateField of CONTACT_FIELDS) {
      const candidateValue = normalizedCandidate.contacts[candidateField];
      if (!candidateValue) continue;

      for (const existingField of CONTACT_FIELDS) {
        const existingValue = normalizedExisting.contacts[existingField];
        if (!existingValue) continue;
        if (candidateValue !== existingValue) continue;

        const key = `${client.id}:${existingField}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        const value =
          duplicateFieldValue(client, existingField) || duplicateFieldValue(candidate, candidateField);
        details.push({ field: existingField, value });
      }
    }

    if (details.length) {
      matches.push({ client, matches: details });
    }
  }

  return matches;
}
