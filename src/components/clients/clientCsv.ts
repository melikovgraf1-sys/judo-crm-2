import { parseCsv, stringifyCsv } from "../../utils/csv";
import { downloadTextFile } from "../../utils/download";
import { transformClientFormValues } from "./clientMutations";
import { todayISO, uid } from "../../state/utils";
import { normalizePaymentFacts } from "../../state/paymentFacts";
import { findClientDuplicates, type DuplicateMatchDetail } from "../../state/clients";
import type {
  Area,
  Client,
  ClientFormValues,
  ClientStatus,
  ContactChannel,
  DB,
  Gender,
  Group,
  PaymentFact,
  PaymentMethod,
  PaymentStatus,
  SubscriptionPlan,
  TaskItem,
} from "../../types";
import { DEFAULT_SUBSCRIPTION_PLAN, SUBSCRIPTION_PLANS } from "../../state/payments";

export const CLIENT_CSV_HEADERS = [
  "firstName",
  "lastName",
  "parentName",
  "phone",
  "whatsApp",
  "telegram",
  "instagram",
  "comment",
  "channel",
  "birthDate",
  "gender",
  "area",
  "group",
  "startDate",
  "payMethod",
  "payStatus",
  "status",
  "subscriptionPlan",
  "payDate",
  "payAmount",
  "payActual",
  "remainingLessons",
  "frozenLessons",
  "statusUpdatedAt",
  "payHistory",
] as const;

type ClientCsvColumn = (typeof CLIENT_CSV_HEADERS)[number];

type HeaderAliasMap = Record<string, ClientCsvColumn>;

const HEADER_ALIASES: HeaderAliasMap = {
  firstname: "firstName",
  "имя": "firstName",
  "first_name": "firstName",
  lastname: "lastName",
  "фамилия": "lastName",
  "last_name": "lastName",
  parentname: "parentName",
  "родитель": "parentName",
  "parent_name": "parentName",
  phone: "phone",
  "телефон": "phone",
  whatsapp: "whatsApp",
  "whats_app": "whatsApp",
  "ватсап": "whatsApp",
  telegram: "telegram",
  "телеграм": "telegram",
  instagram: "instagram",
  "инстаграм": "instagram",
  comment: "comment",
  "комментарий": "comment",
  "коментарий": "comment",
  channel: "channel",
  "канал": "channel",
  "канал_связи": "channel",
  birthdate: "birthDate",
  "дата_рождения": "birthDate",
  gender: "gender",
  "пол": "gender",
  area: "area",
  "район": "area",
  group: "group",
  "группа": "group",
  startdate: "startDate",
  "дата_старта": "startDate",
  paymethod: "payMethod",
  "метод_оплаты": "payMethod",
  paystatus: "payStatus",
  "статус_оплаты": "payStatus",
  status: "status",
  "статус": "status",
  subscriptionplan: "subscriptionPlan",
  "форма_абонемента": "subscriptionPlan",
  "тип_абонемента": "subscriptionPlan",
  paydate: "payDate",
  "дата_оплаты": "payDate",
  payamount: "payAmount",
  "сумма": "payAmount",
  payactual: "payActual",
  "факт": "payActual",
  "факт_оплаты": "payActual",
  remaininglessons: "remainingLessons",
  "оставшиеся_занятия": "remainingLessons",
  frozenlessons: "frozenLessons",
  "заморозка": "frozenLessons",
  statusupdatedat: "statusUpdatedAt",
  "status_updated_at": "statusUpdatedAt",
  "обновление_статуса": "statusUpdatedAt",
  payhistory: "payHistory",
  "paymentfacts": "payHistory",
  "payfacts": "payHistory",
  "история_оплат": "payHistory",
  "историяоплат": "payHistory",
  "факты_оплат": "payHistory",
  "фактыоплат": "payHistory",
};

const REQUIRED_COLUMNS: ClientCsvColumn[] = [
  "firstName",
  "channel",
  "birthDate",
  "gender",
  "area",
  "group",
  "startDate",
  "payMethod",
  "payStatus",
  "status",
];

const CONTACT_CHANNEL_ALIASES: Record<string, ContactChannel> = {
  telegram: "Telegram",
  телеграм: "Telegram",
  tg: "Telegram",
  whatsap: "WhatsApp",
  whatsapp: "WhatsApp",
  ватсап: "WhatsApp",
  wa: "WhatsApp",
  instagram: "Instagram",
  инстаграм: "Instagram",
  insta: "Instagram",
};

const PAYMENT_METHOD_ALIASES: Record<string, PaymentMethod> = {
  "наличные": "наличные",
  "наличка": "наличные",
  cash: "наличные",
  "перевод": "перевод",
  transfer: "перевод",
  "безнал": "перевод",
  "перевод на карту": "перевод",
  "доллар": "доллар",
  dollar: "доллар",
  usd: "доллар",
  "евро": "евро",
  euro: "евро",
  eur: "евро",
  "€": "евро",
};

const PAYMENT_STATUS_ALIASES: Record<string, PaymentStatus> = {
  "ожидание": "ожидание",
  "ожидание оплаты": "ожидание",
  pending: "ожидание",
  "действует": "действует",
  active: "действует",
  "оплачено": "действует",
  "задолженность": "задолженность",
  overdue: "задолженность",
  debt: "задолженность",
};


const CLIENT_STATUS_ALIASES: Record<string, ClientStatus> = {
  "действующий": "действующий",
  "активный": "действующий",
  active: "действующий",
  "отмена": "отмена",
  "отменен": "отмена",
  cancelled: "отмена",
  "новый": "новый",
  new: "новый",
  "вернувшийся": "вернувшийся",
  returned: "вернувшийся",
  "продлившийся": "продлившийся",
  renewed: "продлившийся",
};

const GENDER_ALIASES: Record<string, Gender> = {
  м: "м",
  "m": "м",
  male: "м",
  муж: "м",
  "ж": "ж",
  "f": "ж",
  female: "ж",
  жен: "ж",
};

type ClientCsvImportResult = {
  clients: Omit<Client, "id">[];
  errors: string[];
  processed: number;
  skipped: number;
};

export type DuplicateSummaryEntry = {
  type: "existing" | "imported";
  client: Client;
  matches: DuplicateMatchDetail[];
};

export type AppendImportedClientsSummary = {
  added: number;
  skipped: number;
  merged: number;
  duplicates: DuplicateSummaryEntry[];
};

export type ReplaceImportedClientsSummary = {
  replaced: number;
  previous: number;
  removedAttendance: number;
  removedPerformance: number;
  removedClientTasks: number;
  removedClientTasksArchive: number;
};

const COMMENT_PREFIX = "#";

const sanitizeKey = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, "");

const SUBSCRIPTION_PLAN_ALIASES: Record<string, SubscriptionPlan> = SUBSCRIPTION_PLANS.reduce(
  (acc, option) => {
    acc[sanitizeKey(option.value)] = option.value;
    acc[sanitizeKey(option.label)] = option.value;
    return acc;
  },
  {
    "месячный": "monthly",
    "месячныйабонемент": "monthly",
    "развнеделю": "weekly",
    "развнеделюабонемент": "weekly",
    "halfmonth": "half-month",
    "полмесяца": "half-month",
    "полмесяцаабонемент": "half-month",
    "разовый": "single",
    "разовоезанятие": "single",
  } as Record<string, SubscriptionPlan>,
);

function normalizeEnumValue<T extends string>(value: string, map: Record<string, T>): T | null {
  if (!value) {
    return null;
  }
  const normalized = sanitizeKey(value);
  if (normalized in map) {
    return map[normalized];
  }
  return null;
}

function normalizeDate(value: string, allowEmpty = false): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return allowEmpty ? "" : null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const replaced = trimmed.replace(/[./]/g, "-");
  const parts = replaced.split("-").map(part => part.trim());
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const candidate = `${parts[0].padStart(4, "0")}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      if (!Number.isNaN(new Date(candidate).getTime())) {
        return candidate;
      }
    }
    if (parts[2].length === 4) {
      const candidate = `${parts[2].padStart(4, "0")}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      if (!Number.isNaN(new Date(candidate).getTime())) {
        return candidate;
      }
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function normalizeNumberString(value: string): string {
  return value.trim().replace(/\s+/g, "").replace(",", ".");
}

function normalizeIntString(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function rowToRecord(headerMap: Map<ClientCsvColumn, number>, row: string[]): Record<ClientCsvColumn, string> {
  return CLIENT_CSV_HEADERS.reduce<Record<ClientCsvColumn, string>>((acc, column) => {
    const index = headerMap.get(column);
    acc[column] = index != null && index < row.length ? row[index].trim() : "";
    return acc;
  }, {} as Record<ClientCsvColumn, string>);
}

function clientToRow(client: Client): (string | number | null | undefined)[] {
  const normalizedPayHistory = normalizePaymentFacts(client.payHistory);
  const serializedPayHistory = normalizedPayHistory.length ? JSON.stringify(normalizedPayHistory) : "";

  return [
    client.firstName,
    client.lastName ?? "",
    client.parentName ?? "",
    client.phone ?? "",
    client.whatsApp ?? "",
    client.telegram ?? "",
    client.instagram ?? "",
    client.comment ?? "",
    client.channel,
    client.birthDate ? client.birthDate.slice(0, 10) : "",
    client.gender,
    client.area,
    client.group,
    client.startDate ? client.startDate.slice(0, 10) : "",
    client.payMethod,
    client.payStatus,
    client.status ?? "",
    client.subscriptionPlan ?? DEFAULT_SUBSCRIPTION_PLAN,
    client.payDate ? client.payDate.slice(0, 10) : "",
    client.payAmount != null ? client.payAmount : "",
    client.payActual != null ? client.payActual : "",
    client.remainingLessons != null ? client.remainingLessons : "",
    client.frozenLessons != null ? client.frozenLessons : "",
    client.statusUpdatedAt ? client.statusUpdatedAt.slice(0, 10) : "",
    serializedPayHistory,
  ];
}

export function exportClientsToCsv(clients: Client[], filename?: string) {
  const content = stringifyCsv([
    [...CLIENT_CSV_HEADERS],
    ...clients.map(clientToRow),
  ]);
  const targetName = filename ?? `clients-${todayISO().slice(0, 10)}.csv`;
  downloadTextFile(targetName, content, "text/csv;charset=utf-8");
}

export function buildClientCsvTemplate(): string {
  const commentRow = [
    `${COMMENT_PREFIX} пример: заполните данные ниже, затем удалите эту строку`,
    "Иванов",
    "Мария Иванова",
    "+7 999 123-45-67",
    "",
    "",
    "",
    "Нужные примечания",
    "Telegram",
    "2015-05-12",
    "м",
    "Центр",
    "Младшая группа",
    "2024-09-01",
    "перевод",
    "ожидание",
    "новый",
    "monthly",
    "2024-09-10",
    "12000",
    "",
    "",
    "",
    "2024-10-10",
    '[{"area":"Центр","group":"Младшая группа","paidAt":"2024-09-10","recordedAt":"2024-09-10","amount":12000,"subscriptionPlan":"monthly","periodLabel":"сентябрь 2024 г."}]',
  ];

  return stringifyCsv([[...CLIENT_CSV_HEADERS], commentRow]);
}

export function downloadClientCsvTemplate(filename = "clients-template.csv") {
  const content = buildClientCsvTemplate();
  downloadTextFile(filename, content, "text/csv;charset=utf-8");
}

export function parseClientsCsv(text: string, db: DB): ClientCsvImportResult {
  const rows = parseCsv(text);
  if (!rows.length) {
    return { clients: [], errors: ["Файл CSV пустой"], processed: 0, skipped: 0 };
  }

  const headerRow = rows[0];
  const headerMap = new Map<ClientCsvColumn, number>();

  headerRow.forEach((rawTitle, index) => {
    const key = sanitizeKey(rawTitle);
    const column = HEADER_ALIASES[key] ?? (CLIENT_CSV_HEADERS as readonly string[]).find(
      header => sanitizeKey(header) === key,
    );
    if (column) {
      if (!headerMap.has(column)) {
        headerMap.set(column as ClientCsvColumn, index);
      }
    }
  });

  const missing = REQUIRED_COLUMNS.filter(column => !headerMap.has(column));
  if (missing.length) {
    return {
      clients: [],
      errors: [
        `Отсутствуют обязательные колонки: ${missing
          .map(column => `"${column}"`)
          .join(", ")}. Используйте шаблон из настроек.`,
      ],
      processed: 0,
      skipped: 0,
    };
  }

  const errors: string[] = [];
  const created: Omit<Client, "id">[] = [];
  let processed = 0;

  const areas = new Set<string>(db.settings.areas);
  const groups = new Set<string>(db.settings.groups);
  const defaultCoachId = db.staff.find(member => member.role === "Тренер")?.id;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const cells = headerRow.map((_, index) => (index < row.length ? row[index] : ""));
    const trimmedCells = cells.map(cell => cell.trim());
    const firstMeaningful = trimmedCells.find(cell => cell.length > 0);

    if (!firstMeaningful) {
      continue;
    }

    if (firstMeaningful.startsWith(COMMENT_PREFIX)) {
      continue;
    }

    processed += 1;

    const record = rowToRecord(headerMap, row);
    const lineNumber = rowIndex + 1;
    let hasError = false;

    const firstName = record.firstName.trim();
    if (!firstName) {
      errors.push(`Строка ${lineNumber}: укажите firstName`);
      hasError = true;
    }

    const channel = normalizeEnumValue(record.channel, CONTACT_CHANNEL_ALIASES);
    if (!channel) {
      errors.push(`Строка ${lineNumber}: неизвестный канал связи "${record.channel}"`);
      hasError = true;
    }

    const gender = normalizeEnumValue(record.gender, GENDER_ALIASES);
    if (!gender) {
      errors.push(`Строка ${lineNumber}: некорректный пол "${record.gender}" (используйте м/ж)`);
      hasError = true;
    }

    const area = record.area as Area;
    if (!area) {
      errors.push(`Строка ${lineNumber}: укажите area`);
      hasError = true;
    } else if (!areas.has(area)) {
      errors.push(`Строка ${lineNumber}: неизвестная площадка "${area}"`);
      hasError = true;
    }

    const group = record.group as Group;
    if (!group) {
      errors.push(`Строка ${lineNumber}: укажите group`);
      hasError = true;
    } else if (!groups.has(group)) {
      errors.push(`Строка ${lineNumber}: неизвестная группа "${group}"`);
      hasError = true;
    }

    const payMethod = normalizeEnumValue(record.payMethod, PAYMENT_METHOD_ALIASES);
    if (!payMethod) {
      errors.push(`Строка ${lineNumber}: неизвестный метод оплаты "${record.payMethod}"`);
      hasError = true;
    }

    const payStatus = normalizeEnumValue(record.payStatus, PAYMENT_STATUS_ALIASES);
    if (!payStatus) {
      errors.push(`Строка ${lineNumber}: неизвестный статус оплаты "${record.payStatus}"`);
      hasError = true;
    }

    const status = normalizeEnumValue(record.status, CLIENT_STATUS_ALIASES);
    if (!status) {
      errors.push(`Строка ${lineNumber}: неизвестный статус клиента "${record.status}"`);
      hasError = true;
    }

    let subscriptionPlan = DEFAULT_SUBSCRIPTION_PLAN;
    const rawSubscriptionPlan = record.subscriptionPlan.trim();
    if (rawSubscriptionPlan) {
      const normalizedPlan = normalizeEnumValue(rawSubscriptionPlan, SUBSCRIPTION_PLAN_ALIASES);
      if (!normalizedPlan) {
        errors.push(`Строка ${lineNumber}: неизвестная форма абонемента "${record.subscriptionPlan}"`);
        hasError = true;
      } else {
        subscriptionPlan = normalizedPlan;
      }
    }

    const birthDate = normalizeDate(record.birthDate);
    if (!birthDate) {
      errors.push(`Строка ${lineNumber}: неверный формат birthDate (ожидается ГГГГ-ММ-ДД)`);
      hasError = true;
    }

    const startDate = normalizeDate(record.startDate);
    if (!startDate) {
      errors.push(`Строка ${lineNumber}: неверный формат startDate (ожидается ГГГГ-ММ-ДД)`);
      hasError = true;
    }

    const payDate = normalizeDate(record.payDate, true);
    if (record.payDate.trim() && !payDate) {
      errors.push(`Строка ${lineNumber}: неверный формат payDate (ожидается ГГГГ-ММ-ДД)`);
      hasError = true;
    }

    const statusUpdatedAt = normalizeDate(record.statusUpdatedAt, true);
    if (record.statusUpdatedAt.trim() && !statusUpdatedAt) {
      errors.push(`Строка ${lineNumber}: неверный формат statusUpdatedAt (ожидается ГГГГ-ММ-ДД)`);
      hasError = true;
    }

    const payAmountRaw = normalizeNumberString(record.payAmount);
    if (payAmountRaw) {
      const parsedAmount = Number.parseFloat(payAmountRaw);
      if (Number.isNaN(parsedAmount) || !Number.isFinite(parsedAmount)) {
        errors.push(`Строка ${lineNumber}: неверное значение payAmount "${record.payAmount}"`);
        hasError = true;
      }
    }

    const payActualRaw = normalizeNumberString(record.payActual);
    if (payActualRaw) {
      const parsedActual = Number.parseFloat(payActualRaw);
      if (Number.isNaN(parsedActual) || !Number.isFinite(parsedActual)) {
        errors.push(`Строка ${lineNumber}: неверное значение payActual "${record.payActual}"`);
        hasError = true;
      }
    }

    const remainingRaw = normalizeIntString(record.remainingLessons);
    if (remainingRaw) {
      const parsedRemaining = Number.parseInt(remainingRaw, 10);
      if (Number.isNaN(parsedRemaining)) {
        errors.push(
          `Строка ${lineNumber}: неверное значение remainingLessons "${record.remainingLessons}"`,
        );
        hasError = true;
      }
    }

    const frozenRaw = normalizeIntString(record.frozenLessons);
    if (frozenRaw) {
      const parsedFrozen = Number.parseInt(frozenRaw, 10);
      if (Number.isNaN(parsedFrozen)) {
        errors.push(
          `Строка ${lineNumber}: неверное значение frozenLessons "${record.frozenLessons}"`,
        );
        hasError = true;
      }
    }

    const contacts = [record.phone, record.whatsApp, record.telegram, record.instagram]
      .map(contact => contact.trim())
      .filter(Boolean);
    if (contacts.length === 0) {
      errors.push(`Строка ${lineNumber}: укажите хотя бы один контакт`);
      hasError = true;
    }

    const rawPayHistory = record.payHistory.trim();
    const payHistoryProvided = rawPayHistory.length > 0;
    let importedPayHistory: PaymentFact[] | undefined;

    if (payHistoryProvided) {
      try {
        const parsed = JSON.parse(rawPayHistory) as unknown;
        if (!Array.isArray(parsed)) {
          errors.push(
            `Строка ${lineNumber}: некорректный формат payHistory (ожидается JSON массив фактов оплат)`,
          );
          hasError = true;
        } else {
          const normalized = normalizePaymentFacts(parsed);
          const meaningfulEntries = parsed.filter(entry => entry != null).length;
          if (meaningfulEntries > 0 && normalized.length < meaningfulEntries) {
            errors.push(
              `Строка ${lineNumber}: часть фактов оплат в payHistory не распознана, проверьте данные`,
            );
            hasError = true;
          } else {
            importedPayHistory = normalized;
          }
        }
      } catch (parseError) {
        errors.push(
          `Строка ${lineNumber}: некорректный JSON в payHistory (${(parseError as Error).message})`,
        );
        hasError = true;
      }
    }

    if (hasError) {
      continue;
    }

    const placement = {
      id: `placement-${uid()}`,
      area,
      group,
      payMethod: payMethod!,
      payStatus: payStatus!,
      status: status!,
      subscriptionPlan,
      payDate: payDate ?? "",
      payAmount: payAmountRaw,
      payActual: payActualRaw,
      remainingLessons: remainingRaw,
      frozenLessons: frozenRaw,
    };

    const formValues: ClientFormValues = {
      firstName,
      lastName: record.lastName,
      parentName: record.parentName,
      phone: record.phone,
      whatsApp: record.whatsApp,
      telegram: record.telegram,
      instagram: record.instagram,
      comment: record.comment,
      channel: channel!,
      birthDate: birthDate!,
      gender: gender!,
      startDate: startDate!,
      payMethod: payMethod!,
      placements: [placement],
    };

    const prepared = transformClientFormValues(formValues, null);
    const client: Omit<Client, "id"> = {
      ...prepared,
      coachId: prepared.coachId ?? defaultCoachId,
    };
    const derivedStatusUpdatedAt = statusUpdatedAt ?? client.startDate ?? client.statusUpdatedAt;
    if (derivedStatusUpdatedAt) {
      client.statusUpdatedAt = derivedStatusUpdatedAt;
    }

    if (payHistoryProvided) {
      if (importedPayHistory && importedPayHistory.length) {
        client.payHistory = importedPayHistory;
      } else {
        delete client.payHistory;
      }
    }
    created.push(client);
  }

  return {
    clients: created,
    errors,
    processed,
    skipped: processed - created.length,
  };
}

const MERGEABLE_FIELDS = [
  "lastName",
  "parentName",
  "phone",
  "whatsApp",
  "telegram",
  "instagram",
  "comment",
  "coachId",
] as const satisfies ReadonlyArray<keyof Omit<Client, "id">>;

type MergeableField = (typeof MERGEABLE_FIELDS)[number];

function mergeClientData(target: Client, source: Omit<Client, "id">) {
  for (const field of MERGEABLE_FIELDS) {
    const current = target[field];
    const incoming = source[field];
    if ((current == null || current === "") && incoming) {
      target[field] = incoming as Client[MergeableField];
    }
  }

  if (Array.isArray(source.placements) && source.placements.length) {
    const existing = Array.isArray(target.placements)
      ? target.placements.map((placement, index) => ({
          ...placement,
          id: placement.id ?? `placement-${index}`,
          payMethod: placement.payMethod ?? target.payMethod,
        }))
      : [];
    const existingKeys = new Set(existing.map(placement => `${placement.area}|${placement.group}`));
    const additional = source.placements.filter(placement => {
      const key = `${placement.area}|${placement.group}`;
      if (existingKeys.has(key)) {
        return false;
      }
      existingKeys.add(key);
      return true;
    });

    if (additional.length) {
      target.placements = [...existing, ...additional];
    } else if (!target.placements) {
      target.placements = existing;
    }

    const primary = target.placements?.[0];
    if (primary) {
      target.area = primary.area;
      target.group = primary.group;
      target.payMethod = primary.payMethod ?? target.payMethod;
      target.payStatus = primary.payStatus;
      target.status = primary.status;
      target.subscriptionPlan = primary.subscriptionPlan;
      if (primary.payDate) target.payDate = primary.payDate;
      if (primary.payAmount != null) target.payAmount = primary.payAmount;
      if (primary.payActual != null) target.payActual = primary.payActual;
      if (primary.remainingLessons != null) target.remainingLessons = primary.remainingLessons;
      if (primary.frozenLessons != null) target.frozenLessons = primary.frozenLessons;
    }
  }

  const existingFacts = normalizePaymentFacts(target.payHistory);
  const incomingFacts = normalizePaymentFacts(source.payHistory);
  if (existingFacts.length || incomingFacts.length) {
    const combined = [...existingFacts];
    const knownIds = new Set(existingFacts.map(fact => fact.id));
    for (const fact of incomingFacts) {
      if (!knownIds.has(fact.id)) {
        combined.push(fact);
        knownIds.add(fact.id);
      }
    }

    if (combined.length) {
      target.payHistory = combined;
    } else if (target.payHistory) {
      delete target.payHistory;
    }
  }
}

export function appendImportedClients(
  db: DB,
  imported: Omit<Client, "id">[],
): { next: DB; changelogMessage: string; summary: AppendImportedClientsSummary } {
  const accepted: Client[] = [];
  const summary: AppendImportedClientsSummary = {
    added: 0,
    skipped: 0,
    merged: 0,
    duplicates: [],
  };

  for (const candidate of imported) {
    const matches = findClientDuplicates({ ...db, clients: [...db.clients, ...accepted] }, candidate).filter(
      match => match.matches.some(detail => detail.field !== "area" && detail.field !== "group"),
    );

    if (!matches.length) {
      const client: Client = { ...candidate, id: uid() };
      accepted.push(client);
      continue;
    }

    const matchWithAccepted = matches.find(match => accepted.some(client => client.id === match.client.id));

    if (matchWithAccepted) {
      const target = accepted.find(client => client.id === matchWithAccepted.client.id);
      if (target) {
        mergeClientData(target, candidate);
        summary.merged += 1;
        summary.duplicates.push({ type: "imported", client: target, matches: matchWithAccepted.matches });
      }
      continue;
    }

    summary.skipped += 1;
    const primaryMatch = matches[0];
    summary.duplicates.push({ type: "existing", client: primaryMatch.client, matches: primaryMatch.matches });
  }

  summary.added = accepted.length;

  let nextChangelog = db.changelog;
  if (summary.added > 0) {
    nextChangelog = [
      ...db.changelog,
      {
        id: uid(),
        who: "UI",
        what: `Импортировано клиентов из CSV: ${summary.added}`,
        when: todayISO(),
      },
    ];
  }

  const next: DB = {
    ...db,
    clients: [...accepted, ...db.clients],
    changelog: nextChangelog,
  };

  return { next, changelogMessage: `Добавлено клиентов: ${summary.added}`, summary };
}

function filterClientTasks(tasks: TaskItem[], allowedClientIds: Set<string>): TaskItem[] {
  return tasks.filter(task => {
    if (task.assigneeType !== "client") {
      return true;
    }
    if (!task.assigneeId) {
      return false;
    }
    return allowedClientIds.has(task.assigneeId);
  });
}

export function replaceImportedClients(
  db: DB,
  imported: Omit<Client, "id">[],
): { next: DB; changelogMessage: string; summary: ReplaceImportedClientsSummary } {
  const defaultCoachId = db.staff.find(staffMember => staffMember.role === "Тренер")?.id;
  const clients: Client[] = imported.map(candidate => ({
    ...candidate,
    id: uid(),
    coachId: candidate.coachId ?? defaultCoachId,
  }));

  const allowedClientIds = new Set(clients.map(client => client.id));

  const filteredAttendance = db.attendance.filter(entry => allowedClientIds.has(entry.clientId));
  const filteredPerformance = db.performance.filter(entry => allowedClientIds.has(entry.clientId));
  const filteredTasks = filterClientTasks(db.tasks, allowedClientIds);
  const filteredTasksArchive = filterClientTasks(db.tasksArchive, allowedClientIds);

  const summary: ReplaceImportedClientsSummary = {
    replaced: clients.length,
    previous: db.clients.length,
    removedAttendance: db.attendance.length - filteredAttendance.length,
    removedPerformance: db.performance.length - filteredPerformance.length,
    removedClientTasks: db.tasks.length - filteredTasks.length,
    removedClientTasksArchive: db.tasksArchive.length - filteredTasksArchive.length,
  };

  const changelogMessage = `Заменено клиентов: ${summary.replaced}`;
  const next: DB = {
    ...db,
    clients,
    attendance: filteredAttendance,
    performance: filteredPerformance,
    tasks: filteredTasks,
    tasksArchive: filteredTasksArchive,
    changelog: [
      ...db.changelog,
      { id: uid(), who: "UI", what: `Заменён список клиентов из CSV: ${clients.length}`, when: todayISO() },
    ],
  };

  return { next, changelogMessage, summary };
}
