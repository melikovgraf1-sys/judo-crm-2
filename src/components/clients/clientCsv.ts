import { parseCsv, stringifyCsv } from "../../utils/csv";
import { downloadTextFile } from "../../utils/download";
import { transformClientFormValues } from "./clientMutations";
import { todayISO, uid } from "../../state/utils";
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
  PaymentMethod,
  PaymentStatus,
  SubscriptionPlan,
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
  "remainingLessons",
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
  remaininglessons: "remainingLessons",
  "оставшиеся_занятия": "remainingLessons",
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
  return [
    client.firstName,
    client.lastName ?? "",
    client.parentName ?? "",
    client.phone ?? "",
    client.whatsApp ?? "",
    client.telegram ?? "",
    client.instagram ?? "",
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
    client.remainingLessons != null ? client.remainingLessons : "",
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

    const payAmountRaw = normalizeNumberString(record.payAmount);
    if (payAmountRaw) {
      const parsedAmount = Number.parseFloat(payAmountRaw);
      if (Number.isNaN(parsedAmount) || !Number.isFinite(parsedAmount)) {
        errors.push(`Строка ${lineNumber}: неверное значение payAmount "${record.payAmount}"`);
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

    const contacts = [record.phone, record.whatsApp, record.telegram, record.instagram]
      .map(contact => contact.trim())
      .filter(Boolean);
    if (contacts.length === 0) {
      errors.push(`Строка ${lineNumber}: укажите хотя бы один контакт`);
      hasError = true;
    }

    if (hasError) {
      continue;
    }

    const formValues: ClientFormValues = {
      firstName,
      lastName: record.lastName,
      parentName: record.parentName,
      phone: record.phone,
      whatsApp: record.whatsApp,
      telegram: record.telegram,
      instagram: record.instagram,
      channel: channel!,
      birthDate: birthDate!,
      gender: gender!,
      area,
      group,
      startDate: startDate!,
      payMethod: payMethod!,
      payStatus: payStatus!,
      status: status!,
      subscriptionPlan,
      payDate: payDate ?? "",
      payAmount: payAmountRaw,
      remainingLessons: remainingRaw,
    };

    const prepared = transformClientFormValues(formValues, null);
    const client: Omit<Client, "id"> = {
      ...prepared,
      coachId: prepared.coachId ?? defaultCoachId,
    };
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
    const matches = findClientDuplicates({ ...db, clients: [...db.clients, ...accepted] }, candidate);

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
