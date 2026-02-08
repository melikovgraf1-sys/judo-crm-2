import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TAB_TITLES } from "../components/Tabs";
import { useToasts } from "../components/Toasts";
import { doc, getDoc, onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { db as firestore, ensureSignedIn } from "../firebase";
import { makeSeedDB } from "./seed";
import { fmtMoney, todayISO, uid } from "./utils";
import { applyPaymentStatusRules, DEFAULT_SUBSCRIPTION_PLAN, getSubscriptionPlanMeta } from "./payments";
import { getClientPlacements } from "./clients";
import type {
  AttendanceEntry,
  Area,
  AuthState,
  AuthUser,
  Client,
  ClientPlacement,
  DB,
  Lead,
  LeadLifecycleEvent,
  PerformanceEntry,
  Role,
  ScheduleSlot,
  Settings,
  StaffMember,
  TabKey,
  TaskItem,
  Toast,
  UIState,
} from "../types";
import { DEFAULT_PAYMENT_METHOD } from "../types";


export const LS_KEYS = {
  ui: "judo_crm_ui_v1",
  db: "judo_crm_db_v1",
  auth: "judo_crm_auth_v1",
};

export const LOCAL_ONLY_EVENT = "judo-crm/local-only";

export const DB_CONFLICT_EVENT = "judo-crm/db-conflict";

const DB_CONFLICT_MESSAGE = "Данные в базе были изменены в другом месте. Обновляем локальную копию.";

export const LOCAL_ONLY_MESSAGE =
  "Данные сейчас сохраняются только в этом браузере — синхронизация с Firebase отключена, поэтому содержимое может отличаться в других окнах.";

const DEFAULT_AREAS: Area[] = ["Махмутлар", "Центр", "Джикджилли"];

const DEFAULT_GROUP_LIMIT = 20;

const GROUP_NAME_RULES: { pattern: RegExp; replacement: string }[] = [
  { pattern: /^4\s*[-–]\s*6(\s*лет)?$/i, replacement: "4–6 лет" },
  { pattern: /^6\s*[-–]\s*9(\s*лет)?$/i, replacement: "7–10 лет" },
  { pattern: /^7\s*[-–]\s*10(\s*лет)?$/i, replacement: "7–10 лет" },
  { pattern: /^9\s*[-–]\s*14(\s*лет)?$/i, replacement: "11 лет и старше" },
  { pattern: /^7\s*[-–]\s*14(\s*лет)?$/i, replacement: "11 лет и старше" },
  { pattern: /^11(\s*лет)?(\s*и\s*старше|\+)?$/i, replacement: "11 лет и старше" },
];

function normalizeGroupName(value: string | undefined | null): string | undefined | null {
  if (!value) return value;
  const trimmed = value.trim().replace(/\s+/g, " ");
  for (const { pattern, replacement } of GROUP_NAME_RULES) {
    if (pattern.test(trimmed)) {
      return replacement;
    }
  }
  return trimmed;
}

function normalizeGroupList(values: readonly string[] | undefined | null): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeGroupName(value);
    if (!normalized) continue;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function normalizeLimits(
  limits: Settings["limits"],
  areas: readonly Area[],
  groups: readonly string[],
): Settings["limits"] {
  const entries = new Map<string, number>();
  for (const [rawKey, value] of Object.entries(limits)) {
    const [area, rawGroup = ""] = rawKey.split("|");
    if (!area) continue;
    const normalizedGroup = normalizeGroupName(rawGroup);
    if (!normalizedGroup) continue;
    entries.set(`${area}|${normalizedGroup}`, value);
  }

  for (const area of areas) {
    for (const group of groups) {
      const key = `${area}|${group}`;
      if (!entries.has(key)) {
        entries.set(key, DEFAULT_GROUP_LIMIT);
      }
    }
  }

  return Object.fromEntries(entries);
}

function shallowEqualArrays<T>(a: readonly T[], b: readonly T[]) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function shallowEqualLimits(a: Settings["limits"], b: Settings["limits"]) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

const DEFAULT_SETTINGS: Settings = {
  areas: DEFAULT_AREAS,
  groups: [
    "4–6 лет",
    "7–10 лет",
    "11 лет и старше",
    "взрослые",
    "индивидуальные",
    "доп. группа",
  ],
  limits: Object.fromEntries(
    DEFAULT_AREAS.flatMap(area =>
      [
        "4–6 лет",
        "7–10 лет",
        "11 лет и старше",
        "взрослые",
        "индивидуальные",
        "доп. группа",
      ].map(group => [`${area}|${group}`, DEFAULT_GROUP_LIMIT]),
    ),
  ) as Settings["limits"],
  rentByAreaEUR: { Махмутлар: 300, Центр: 400, Джикджилли: 250 },
  coachSalaryByAreaEUR: { Махмутлар: 0, Центр: 0, Джикджилли: 0 },
  currencyRates: { EUR: 1, TRY: 35.5, RUB: 101.2 },
  coachPayFormula: "фикс 100€ + 5€ за ученика",
  analyticsFavorites: [],
};

const ROLE_LIST: Role[] = ["Администратор", "Менеджер", "Тренер"];

function makeDefaultAuthState(): AuthState {
  const defaultAdmins: AuthUser[] = [
    { id: uid(), login: "admin1", password: "admin1", name: "Администратор 1", role: "Администратор" },
    { id: uid(), login: "admin2", password: "admin2", name: "Администратор 2", role: "Администратор" },
    { id: uid(), login: "admin3", password: "admin3", name: "Администратор 3", role: "Администратор" },
  ];

  return {
    users: defaultAdmins,
    currentUserId: null,
  };
}

function ensureArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => item != null);
}

function ensureObjectArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => typeof item === "object" && item != null);
}

function normalizeSettings(value: unknown): Settings {
  if (!value || typeof value !== "object") {
    return {
      ...DEFAULT_SETTINGS,
      areas: DEFAULT_SETTINGS.areas,
    };
  }

  const raw = value as Partial<Settings>;
  const areas = ensureArray<string>(raw.areas);
  const groups = ensureArray<string>(raw.groups);
  const normalizedAreas = (areas.length ? (areas as Settings["areas"]) : DEFAULT_SETTINGS.areas).slice();

  const normalizedGroups = normalizeGroupList(
    groups.length ? (groups as Settings["groups"]) : DEFAULT_SETTINGS.groups,
  );

  const sourceLimits =
    raw.limits && typeof raw.limits === "object"
      ? (raw.limits as Settings["limits"])
      : DEFAULT_SETTINGS.limits;

  const normalizedLimits = normalizeLimits(sourceLimits, normalizedAreas, normalizedGroups);

  return {
    areas: normalizedAreas,
    groups: normalizedGroups,
    limits: normalizedLimits,
    rentByAreaEUR:
      raw.rentByAreaEUR && typeof raw.rentByAreaEUR === "object"
        ? (raw.rentByAreaEUR as Settings["rentByAreaEUR"])
        : DEFAULT_SETTINGS.rentByAreaEUR,
    coachSalaryByAreaEUR:
      raw.coachSalaryByAreaEUR && typeof raw.coachSalaryByAreaEUR === "object"
        ? (raw.coachSalaryByAreaEUR as Settings["coachSalaryByAreaEUR"])
        : DEFAULT_SETTINGS.coachSalaryByAreaEUR,
    currencyRates: raw.currencyRates
      ? { ...DEFAULT_SETTINGS.currencyRates, ...raw.currencyRates }
      : DEFAULT_SETTINGS.currencyRates,
    coachPayFormula:
      typeof raw.coachPayFormula === "string" ? raw.coachPayFormula : DEFAULT_SETTINGS.coachPayFormula,
    analyticsFavorites: ensureArray<string>(raw.analyticsFavorites),
  };
}

function normalizeDB(value: unknown): DB | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<DB>;
  const revision =
    typeof raw.revision === "number" && Number.isFinite(raw.revision) && raw.revision >= 0
      ? Math.floor(raw.revision)
      : 0;

  const normalized = normalizeGroupsInDB({
    revision,
    clients: ensureObjectArray<Client>(raw.clients),
    attendance: ensureObjectArray<AttendanceEntry>(raw.attendance),
    performance: ensureObjectArray<PerformanceEntry>(raw.performance),
    schedule: ensureObjectArray<ScheduleSlot>(raw.schedule),
    leads: ensureObjectArray<Lead>(raw.leads),
    leadsArchive: ensureObjectArray<Lead>(raw.leadsArchive),
    leadHistory: ensureObjectArray<LeadLifecycleEvent>(raw.leadHistory),
    tasks: ensureObjectArray<TaskItem>(raw.tasks),
    tasksArchive: ensureObjectArray<TaskItem>(raw.tasksArchive),
    staff: ensureObjectArray<StaffMember>(raw.staff),
    settings: normalizeSettings(raw.settings),
    changelog: ensureObjectArray<{ id: string; who: string; what: string; when: string }>(raw.changelog),
  } as DB);
  return normalized;
}

function readLocalDB(): DB | null {
  try {
    const raw = localStorage.getItem(LS_KEYS.db);
    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = normalizeDB(parsed);
      if (normalized) {
        return normalized;
      }
      localStorage.removeItem(LS_KEYS.db);
    }
  } catch (err) {
    console.warn("Failed to read DB from localStorage", err);
  }
  return null;
}

function normalizeGroupsInDB(db: DB): DB {
  const normalizeRequired = (value: string) => {
    const normalized = normalizeGroupName(value);
    return normalized ?? value;
  };

  const normalizeOptional = (value: string | undefined) => {
    if (!value) return value;
    const normalized = normalizeGroupName(value);
    return normalized ?? value;
  };

  const clients = db.clients.map(client => {
    const basePlacements = Array.isArray(client.placements) ? client.placements : [];
    const sourcePlacements = basePlacements.length
      ? [
          {
            ...basePlacements[0],
            id: basePlacements[0].id || `placement-${client.id}`,
            area: client.area,
            group: client.group,
            payMethod: basePlacements[0].payMethod ?? client.payMethod,
            payStatus: basePlacements[0].payStatus ?? client.payStatus,
            status: basePlacements[0].status ?? client.status,
            subscriptionPlan: basePlacements[0].subscriptionPlan ?? client.subscriptionPlan,
            payDate: basePlacements[0].payDate ?? client.payDate,
            payAmount: basePlacements[0].payAmount ?? client.payAmount,
            payActual: basePlacements[0].payActual ?? client.payActual,
            remainingLessons: basePlacements[0].remainingLessons ?? client.remainingLessons,
            frozenLessons: basePlacements[0].frozenLessons ?? client.frozenLessons,
          },
          ...basePlacements.slice(1),
        ]
      : [];

    const normalizedPlacements = sourcePlacements.map((placement, index) => {
      const normalizedGroup = normalizeRequired(placement.group);
      const normalizedArea = placement.area?.trim?.() ? placement.area : client.area;
      const id = placement.id || `placement-${client.id}-${index}`;
      return {
        id,
        area: normalizedArea,
        group: normalizedGroup,
        payMethod: placement.payMethod ?? client.payMethod,
        payStatus: placement.payStatus ?? client.payStatus,
        status: placement.status ?? client.status,
        subscriptionPlan: placement.subscriptionPlan ?? client.subscriptionPlan,
        ...(placement.payDate ? { payDate: placement.payDate } : {}),
        ...(placement.payAmount != null ? { payAmount: placement.payAmount } : {}),
        ...(placement.payActual != null ? { payActual: placement.payActual } : {}),
        ...(placement.remainingLessons != null ? { remainingLessons: placement.remainingLessons } : {}),
        ...(placement.frozenLessons != null ? { frozenLessons: placement.frozenLessons } : {}),
      };
    });

    if (!normalizedPlacements.length) {
      return {
        ...client,
        placements: [],
      };
    }

    const primary = normalizedPlacements[0];

    return {
      ...client,
      area: primary.area,
      group: primary.group,
      payMethod: primary.payMethod ?? client.payMethod,
      payStatus: primary.payStatus,
      status: primary.status,
      subscriptionPlan: primary.subscriptionPlan,
      ...(primary.payDate ? { payDate: primary.payDate } : {}),
      ...(primary.payAmount != null ? { payAmount: primary.payAmount } : {}),
      ...(primary.payActual != null ? { payActual: primary.payActual } : {}),
      ...(primary.remainingLessons != null ? { remainingLessons: primary.remainingLessons } : {}),
      ...(primary.frozenLessons != null ? { frozenLessons: primary.frozenLessons } : {}),
      placements: normalizedPlacements,
    };
  });

  const schedule = db.schedule.map(slot => {
    const group = normalizeRequired(slot.group);
    return group === slot.group ? slot : { ...slot, group };
  });

  const staff = db.staff.map(member => {
    const normalizedGroups = normalizeGroupList(member.groups);
    return shallowEqualArrays(normalizedGroups, member.groups)
      ? member
      : { ...member, groups: normalizedGroups };
  });

  const leads = db.leads.map(lead => {
    const group = normalizeOptional(lead.group);
    return group === lead.group ? lead : { ...lead, group };
  });

  const leadsArchive = db.leadsArchive.map(lead => {
    const group = normalizeOptional(lead.group);
    return group === lead.group ? lead : { ...lead, group };
  });

  const leadHistory = db.leadHistory.map(event => {
    const group = normalizeOptional(event.group);
    return group === event.group ? event : { ...event, group };
  });

  const tasks = db.tasks.map(task => {
    const group = normalizeOptional(task.group);
    return group === task.group ? task : { ...task, group };
  });

  const tasksArchive = db.tasksArchive.map(task => {
    const group = normalizeOptional(task.group);
    return group === task.group ? task : { ...task, group };
  });

  const normalizedSettingsGroups = normalizeGroupList(db.settings.groups);
  const normalizedSettingsLimits = normalizeLimits(
    db.settings.limits,
    db.settings.areas,
    normalizedSettingsGroups,
  );

  const settingsNeedsUpdate =
    !shallowEqualArrays(normalizedSettingsGroups, db.settings.groups) ||
    !shallowEqualLimits(normalizedSettingsLimits, db.settings.limits);

  const settings = settingsNeedsUpdate
    ? { ...db.settings, groups: normalizedSettingsGroups, limits: normalizedSettingsLimits }
    : db.settings;

  return {
    ...db,
    clients,
    schedule,
    staff,
    leads,
    leadsArchive,
    leadHistory,
    tasks,
    tasksArchive,
    settings,
  };
}

function writeLocalDB(dbData: DB) {
  try {
    localStorage.setItem(LS_KEYS.db, JSON.stringify(dbData));
  } catch (err) {
    console.warn("Failed to persist DB to localStorage", err);
  }
}

function sanitizeForFirestore<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (err) {
    console.error("Failed to sanitize data before saving to Firestore", err);
    throw err;
  }
}

class RevisionConflictError extends Error {
  constructor(message: string = "Revision conflict") {
    super(message);
    this.name = "RevisionConflictError";
  }
}

export type CommitDBResult =
  | { ok: true; db: DB }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "error" };

export async function saveDB(dbData: DB): Promise<CommitDBResult> {
  if (!firestore) {
    console.warn("Firestore not initialized. Changes cannot be synchronized.");
    writeLocalDB(dbData);
    return { ok: true, db: dbData };
  }

  let signedIn = false;
  try {
    signedIn = await ensureSignedIn();
  } catch (err) {
    console.warn("Failed to verify Firebase authentication state", err);
  }

  const ref = doc(firestore, "app", "main");
  try {
    const updated = await runTransaction(firestore, async transaction => {
      const snap = await transaction.get(ref);
      const remote = snap.exists() ? normalizeDB(snap.data()) : null;
      const remoteRevision = remote?.revision ?? 0;
      const expectedRevision = dbData.revision ?? 0;

      if (snap.exists() && remoteRevision !== expectedRevision) {
        throw new RevisionConflictError(
          `Remote revision ${remoteRevision} does not match local ${expectedRevision}`,
        );
      }

      const nextRevision = Math.max(remoteRevision, expectedRevision) + 1;
      const payload = sanitizeForFirestore({ ...dbData, revision: nextRevision });
      transaction.set(ref, payload);
      return { ...dbData, revision: nextRevision };
    });
    if (!signedIn) {
      console.warn("Saved DB without confirmed Firebase authentication. Check security rules if data is missing remotely.");
    }
    writeLocalDB(updated);
    return { ok: true, db: updated };
  } catch (err) {
    if (err instanceof RevisionConflictError) {
      console.warn("Database revision conflict detected", err);
      return { ok: false, reason: "conflict" };
    }

    console.error("Failed to save DB", err);
    writeLocalDB(dbData);
    if (typeof window !== "undefined" && "dispatchEvent" in window) {
      window.dispatchEvent(new CustomEvent(LOCAL_ONLY_EVENT));
    }
    console.warn(LOCAL_ONLY_MESSAGE);
    return { ok: false, reason: "error" };
  }
}

export async function commitDBUpdate(
  next: DB,
  setDB: Dispatch<SetStateAction<DB>>,
): Promise<CommitDBResult> {
  const result = await saveDB(next);
  if (result.ok) {
    setDB(result.db);
  } else if (result.reason === "error") {
    setDB(next);
  } else if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DB_CONFLICT_EVENT));
  }
  return result;
}

const defaultUI: UIState = {
  role: "Администратор",
  activeTab: "dashboard",
  breadcrumbs: ["Дашборд"],
  currency: "EUR",
  search: "",
  theme: "light",
  pendingClientId: null,
};

export function can(
  role: Role,
  feature:
    | "all"
    | "manage_clients"
    | "attendance"
    | "performance"
    | "schedule"
    | "leads"
    | "tasks"
    | "analytics"
    | "appeals"
    | "settings",
) {
  if (role === "Администратор") return true;
  if (role === "Менеджер") {
    return ["manage_clients", "leads", "tasks", "attendance", "performance", "schedule", "appeals", "analytics"].includes(
      feature,
    );
  }
  if (role === "Тренер") {
    return ["attendance", "performance", "schedule"].includes(feature);
  }
  return false;
}

function usePersistentState<T>(
  key: string,
  defaultValue: T,
  delay: number = 300,
): [T, Dispatch<SetStateAction<T>>] {
  const hasWindow = typeof window !== "undefined";
  const storageAvailable = hasWindow && typeof window.localStorage !== "undefined";

  const [state, setState] = useState<T>(() => {
    if (!storageAvailable) {
      return defaultValue;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        return JSON.parse(raw) as T;
      }
    } catch {}
    try {
      window.localStorage.setItem(key, JSON.stringify(defaultValue));
    } catch {}
    return defaultValue;
  });

  const timeoutRef = useRef<number | null>(null);

  const clearScheduledTimeout = useCallback(() => {
    if (!hasWindow) {
      return;
    }
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [hasWindow]);

  const flush = useCallback(() => {
    if (!storageAvailable) {
      return;
    }
    clearScheduledTimeout();
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [clearScheduledTimeout, key, state, storageAvailable]);

  useEffect(() => {
    if (!storageAvailable || !hasWindow) {
      return;
    }

    clearScheduledTimeout();

    timeoutRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch {}
    }, delay);

    return () => {
      clearScheduledTimeout();
    };
  }, [state, key, delay, storageAvailable, hasWindow, clearScheduledTimeout]);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  return [state, setState];
}

type AuthActionResult = { ok: true } | { ok: false; error: string };

type RegisterPayload = { name: string; login: string; password: string; role: Role };

export interface AppState {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  undoDBChange: () => void;
  canUndoDBChange: boolean;
  redoDBChange: () => void;
  canRedoDBChange: boolean;
  ui: UIState;
  setUI: Dispatch<SetStateAction<UIState>>;
  roles: Role[];
  currentUser: AuthUser | null;
  loginUser: (login: string, password: string) => Promise<AuthActionResult>;
  registerUser: (payload: RegisterPayload) => Promise<AuthActionResult>;
  logoutUser: () => void;
  toasts: Toast[];
  isLocalOnly: boolean;
  quickOpen: boolean;
  onQuickAdd: () => void;
  setQuickOpen: Dispatch<SetStateAction<boolean>>;
  addQuickClient: () => Promise<void>;
  addQuickLead: () => Promise<void>;
  addQuickTask: () => Promise<void>;
}

export function useAppState(): AppState {
  const [db, setDBState] = useState<DB>(() => readLocalDB() ?? makeSeedDB());
  const undoStackRef = useRef<Array<{ keys: (keyof DB)[]; changes: Partial<DB> }>>([]);
  const redoStackRef = useRef<Array<{ keys: (keyof DB)[]; changes: Partial<DB> }>>([]);
  const skipHistoryRef = useRef(false);
  const [undoCount, setUndoCount] = useState(undoStackRef.current.length);
  const [redoCount, setRedoCount] = useState(redoStackRef.current.length);
  const getChangedKeys = useCallback((prev: DB, nextValue: DB) => {
    return (Object.keys(nextValue) as (keyof DB)[]).filter(key => nextValue[key] !== prev[key]);
  }, []);
  const setDB = useCallback<Dispatch<SetStateAction<DB>>>(next => {
    setDBState(prev => {
      const nextValue = typeof next === "function" ? (next as (prevState: DB) => DB)(prev) : next;
      if (skipHistoryRef.current) {
        skipHistoryRef.current = false;
        return nextValue;
      }
      if (nextValue !== prev) {
        const keys = getChangedKeys(prev, nextValue);
        if (keys.length > 0) {
          const changes: Partial<DB> = {};
          keys.forEach(key => {
            changes[key] = prev[key];
          });
          undoStackRef.current.push({ keys, changes });
          redoStackRef.current = [];
          setUndoCount(undoStackRef.current.length);
          setRedoCount(0);
        }
      }
      return nextValue;
    });
  }, [getChangedKeys]);
  const undoDBChange = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    skipHistoryRef.current = true;
    setDBState(prev => {
      const redoChanges: Partial<DB> = {};
      previous.keys.forEach(key => {
        redoChanges[key] = prev[key];
      });
      redoStackRef.current.push({ keys: previous.keys, changes: redoChanges });
      const nextValue = { ...prev, ...previous.changes };
      writeLocalDB(nextValue);
      return nextValue;
    });
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  }, []);
  const canUndoDBChange = undoCount > 0;
  const redoDBChange = useCallback(() => {
    const nextEntry = redoStackRef.current.pop();
    if (!nextEntry) return;
    skipHistoryRef.current = true;
    setDBState(prev => {
      const undoChanges: Partial<DB> = {};
      nextEntry.keys.forEach(key => {
        undoChanges[key] = prev[key];
      });
      undoStackRef.current.push({ keys: nextEntry.keys, changes: undoChanges });
      const nextValue = { ...prev, ...nextEntry.changes };
      writeLocalDB(nextValue);
      return nextValue;
    });
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  }, []);
  const canRedoDBChange = redoCount > 0;
  const [ui, setUI] = usePersistentState<UIState>(LS_KEYS.ui, defaultUI, 300);
  const [auth, setAuth] = usePersistentState<AuthState>(LS_KEYS.auth, makeDefaultAuthState(), 300);
  const dbRef = useRef(db);
  useEffect(() => {
    dbRef.current = db;
  }, [db]);
  const uiRef = useRef(ui);
  useEffect(() => {
    uiRef.current = ui;
  }, [ui]);
  const ensurePaymentTasksForToday = useCallback(async () => {
    const currentDB = dbRef.current;
    const currentUI = uiRef.current;

    if (!currentDB) {
      return;
    }

    const timestamp = todayISO();
    const today = typeof timestamp === "string" ? timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10);

    const openPaymentAssignments = new Set<string>();
    currentDB.tasks
      .filter(
        task => task.status === "open" && task.topic === "оплата" && task.assigneeType === "client" && task.assigneeId,
      )
      .forEach(task => {
        const assigneeId = task.assigneeId as string;
        if (!assigneeId) {
          return;
        }
        if (task.placementId) {
          openPaymentAssignments.add(`${assigneeId}:${task.placementId}`);
        } else {
          openPaymentAssignments.add(`${assigneeId}:*`);
        }
      });

    const newTasks: TaskItem[] = [];
    const changelogEntries: DB["changelog"] = [];
    const updates: Partial<Record<string, Partial<Client>>> = {};

    currentDB.clients.forEach(client => {
      const placements = getClientPlacements(client);
      const primaryPlacementId = placements[0]?.id;

      placements.forEach(placement => {
        const payDate = placement.payDate ?? client.payDate;
        if (!payDate || payDate.slice(0, 10) !== today) {
          return;
        }

        if (placement.payStatus === "задолженность") {
          return;
        }

        if (openPaymentAssignments.has(`${client.id}:*`)) {
          return;
        }

        const key = `${client.id}:${placement.id ?? "primary"}`;
        if (openPaymentAssignments.has(key)) {
          return;
        }

        const payAmount = placement.payAmount ?? client.payAmount;

        const titleParts = [
          `${client.firstName}${client.lastName ? ` ${client.lastName}` : ""}`.trim(),
          client.parentName ? `родитель: ${client.parentName}` : null,
          payAmount != null
            ? `сумма: ${fmtMoney(payAmount, currentUI?.currency ?? "EUR", currentDB.settings.currencyRates)}`
            : null,
          payDate ? `дата: ${payDate.slice(0, 10)}` : null,
        ].filter(Boolean);

        newTasks.push({
          id: uid(),
          title: `Оплата клиента — ${titleParts.join(" • ") || client.firstName}`,
          due: payDate || timestamp,
          status: "open",
          topic: "оплата",
          assigneeType: "client",
          assigneeId: client.id,
          area: placement.area ?? client.area,
          group: placement.group ?? client.group,
          placementId: placement.id,
        });

        changelogEntries.push({
          id: uid(),
          who: "Система",
          what: `Создана задача по оплате ${client.firstName}`,
          when: timestamp,
        });

        const baseUpdate = updates[client.id] ?? {};
        const sourcePlacements = (baseUpdate.placements as ClientPlacement[] | undefined) ?? placements;
        const updatedPlacement = { ...placement, payStatus: "задолженность" as const };
        const nextPlacements = sourcePlacements.map(item =>
          item.id === updatedPlacement.id ? updatedPlacement : item,
        );

        updates[client.id] = {
          ...baseUpdate,
          placements: nextPlacements,
        };

        if (primaryPlacementId === updatedPlacement.id) {
          updates[client.id] = {
            ...updates[client.id],
            payStatus: "задолженность",
            area: updatedPlacement.area,
            group: updatedPlacement.group,
            subscriptionPlan: updatedPlacement.subscriptionPlan,
            ...(updatedPlacement.payAmount != null ? { payAmount: updatedPlacement.payAmount } : {}),
            ...(updatedPlacement.payDate ? { payDate: updatedPlacement.payDate } : {}),
            ...(updatedPlacement.payActual != null ? { payActual: updatedPlacement.payActual } : {}),
            ...(updatedPlacement.remainingLessons != null
              ? { remainingLessons: updatedPlacement.remainingLessons }
              : {}),
            ...(updatedPlacement.frozenLessons != null
              ? { frozenLessons: updatedPlacement.frozenLessons }
              : {}),
          };
        }
      });
    });

    if (!newTasks.length) {
      return;
    }

    const nextTasks = [...newTasks, ...currentDB.tasks];
    const nextClients = applyPaymentStatusRules(
      currentDB.clients,
      nextTasks,
      currentDB.tasksArchive,
      updates,
      currentDB.schedule,
    );
    const next: DB = {
      ...currentDB,
      tasks: nextTasks,
      clients: nextClients,
      changelog: [...currentDB.changelog, ...changelogEntries],
    };

    await commitDBUpdate(next, setDB);
  }, [setDB]);
  const roles = ROLE_LIST;
  const currentUser = auth.users.find(user => user.id === auth.currentUserId) ?? null;
  const { toasts, push } = useToasts();
  const [quickOpen, setQuickOpen] = useState(false);
  const [isLocalOnly, setIsLocalOnly] = useState<boolean>(() => !firestore);
  const location = useLocation();
  const navigate = useNavigate();
  const localOnlyToastShownRef = useRef(false);

  const loginUser = useCallback<Required<AppState>["loginUser"]>(
    async (login, password) => {
      const normalizedLogin = login.trim().toLowerCase();
      if (!normalizedLogin || !password) {
        return { ok: false, error: "Введите логин и пароль" };
      }

      const user = auth.users.find(u => u.login.toLowerCase() === normalizedLogin);
      if (!user || user.password !== password) {
        return { ok: false, error: "Неверный логин или пароль" };
      }

      setAuth(prev => {
        if (prev.currentUserId === user.id) {
          return prev;
        }
        return { ...prev, currentUserId: user.id };
      });
      setUI(prev => (prev.role === user.role ? prev : { ...prev, role: user.role }));
      push(`Добро пожаловать, ${user.name || user.login}!`, "success");
      return { ok: true };
    },
    [auth.users, setAuth, setUI, push],
  );

  const registerUser = useCallback<Required<AppState>["registerUser"]>(
    async ({ name, login, password, role }) => {
      const trimmedLogin = login.trim();
      const trimmedPassword = password.trim();
      if (!trimmedLogin || !trimmedPassword) {
        return { ok: false, error: "Укажите логин и пароль" };
      }

      const normalizedLogin = trimmedLogin.toLowerCase();
      if (auth.users.some(u => u.login.toLowerCase() === normalizedLogin)) {
        return { ok: false, error: "Пользователь с таким логином уже существует" };
      }

      const safeRole = roles.includes(role) ? role : "Менеджер";
      const newUser: AuthUser = {
        id: uid(),
        login: trimmedLogin,
        password: trimmedPassword,
        name: name.trim() || trimmedLogin,
        role: safeRole,
      };

      setAuth(prev => ({ users: [...prev.users, newUser], currentUserId: newUser.id }));
      setUI(prev => (prev.role === newUser.role ? prev : { ...prev, role: newUser.role }));
      push("Пользователь успешно зарегистрирован", "success");
      return { ok: true };
    },
    [auth.users, roles, setAuth, setUI, push],
  );

  const logoutUser = useCallback(() => {
    setAuth(prev => (prev.currentUserId == null ? prev : { ...prev, currentUserId: null }));
    setQuickOpen(false);
    push("Вы вышли из аккаунта", "info");
  }, [setAuth, setQuickOpen, push]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    let cancelled = false;
    const readCurrentTimestamp = () => {
      const value = todayISO();
      return typeof value === "string" ? value : new Date().toISOString();
    };

    let currentDay = readCurrentTimestamp().slice(0, 10);

    const run = () => {
      if (cancelled) {
        return;
      }
      void ensurePaymentTasksForToday();
    };

    run();

    const timer = window.setInterval(() => {
      if (cancelled) {
        return;
      }
      const nextDay = readCurrentTimestamp().slice(0, 10);
      if (nextDay !== currentDay) {
        currentDay = nextDay;
        run();
      }
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ensurePaymentTasksForToday]);

  useEffect(() => {
    void ensurePaymentTasksForToday();
  }, [db.clients, db.tasks, ensurePaymentTasksForToday]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => undefined;
    }
    const handler = () => setIsLocalOnly(true);
    window.addEventListener(LOCAL_ONLY_EVENT, handler);
    return () => {
      window.removeEventListener(LOCAL_ONLY_EVENT, handler);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    const handler = async () => {
      push(DB_CONFLICT_MESSAGE, "warning");

      if (firestore) {
        try {
          const ref = doc(firestore, "app", "main");
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const data = normalizeDB(snap.data());
            if (data) {
              writeLocalDB(data);
              setDB(data);
              setIsLocalOnly(false);
              return;
            }
          }
        } catch (err) {
          console.error("Failed to reload Firestore data after conflict", err);
          push("Не удалось загрузить данные из Firebase", "error");
        }
      }

      const local = readLocalDB();
      if (local) {
        setDB(local);
      }
    };

    window.addEventListener(DB_CONFLICT_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(DB_CONFLICT_EVENT, handler as EventListener);
    };
  }, [push, setDB, setIsLocalOnly]);

  useEffect(() => {
    if (isLocalOnly) {
      if (!localOnlyToastShownRef.current) {
        console.info(LOCAL_ONLY_MESSAGE);
        push(LOCAL_ONLY_MESSAGE, "warning");
        localOnlyToastShownRef.current = true;
      }
    } else {
      localOnlyToastShownRef.current = false;
    }
  }, [isLocalOnly, push]);

  useEffect(() => {
    const root = document.documentElement;
    if (ui.theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [ui.theme]);

  useEffect(() => {
    if (currentUser && ui.role !== currentUser.role) {
      setUI(prev => (prev.role === currentUser.role ? prev : { ...prev, role: currentUser.role }));
    }
  }, [currentUser, ui.role, setUI]);

  useEffect(() => {
    if (!firestore) {
      console.warn("Firestore not initialized");
      setIsLocalOnly(true);
      return () => undefined;
    }

    const ref = doc(firestore, "app", "main");
    let unsub: (() => void) | undefined;
    let cancelled = false;

    const subscribe = async () => {
      try {
        const signedIn = await ensureSignedIn();
        if (!signedIn) {
          console.warn("Firebase authentication not confirmed. Firestore access may be limited.");
        }
      } catch (err) {
        console.error("Failed to verify Firebase authentication state before subscribing", err);
        push("Не удалось авторизоваться в Firebase", "error");
      }

      if (cancelled) {
        return;
      }

      try {
        unsub = onSnapshot(
          ref,
          async snap => {
            try {
              if (snap.exists()) {
                const data = normalizeDB(snap.data());
                if (data) {
                  writeLocalDB(data);
                  setDB(data);
                  setIsLocalOnly(false);
                }
              } else {
                setIsLocalOnly(true);
                const seed = makeSeedDB();
                writeLocalDB(seed);
                setDB(seed);
                const signedIn = await ensureSignedIn();
                if (!signedIn) {
                  push("Не удалось авторизоваться в Firebase", "error");
                  throw new Error("Firebase authentication required before seeding data");
                }
                await setDoc(ref, seed);
              }
            } catch (err) {
              console.error("Error processing snapshot", err);
              push("Ошибка обновления данных", "error");
            }
          },
          err => {
            console.error("Firestore snapshot error", err);
            push("Нет доступа к базе данных", "error");
            setIsLocalOnly(true);
          },
        );
      } catch (err) {
        console.error("Failed to subscribe to snapshot", err);
        push("Не удалось подписаться на обновления", "error");
      }
    };

    subscribe();

    return () => {
      cancelled = true;
      if (unsub) {
        unsub();
      }
    };
  }, [push, setDB]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEYS.ui) {
        try {
          const raw = localStorage.getItem(LS_KEYS.ui);
          if (raw != null) setUI(JSON.parse(raw) as UIState);
        } catch {}
      }
      if (e.key === LS_KEYS.db) {
        try {
          const raw = localStorage.getItem(LS_KEYS.db);
          if (raw != null) {
            const parsed = JSON.parse(raw);
            const normalized = normalizeDB(parsed);
            if (normalized) {
              setDB(normalized);
            }
          }
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setUI, setDB]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickOpen((v: boolean) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let key = location.pathname.replace(/^\/+/, "");
    if (key === "") key = "dashboard";
    if (!TAB_TITLES[key as TabKey]) key = "dashboard";
    const tabKey = key as TabKey;
    const breadcrumb = TAB_TITLES[tabKey];
    setUI(prev => {
      if (prev.activeTab === tabKey) {
        return prev;
      }
      return { ...prev, activeTab: tabKey, breadcrumbs: [breadcrumb] };
    });
  }, [location.pathname, setUI]);

  const onQuickAdd = () => setQuickOpen(true);
  const addQuickClient = async () => {
    const defaultPlanMeta = getSubscriptionPlanMeta(DEFAULT_SUBSCRIPTION_PLAN);
    const primaryPlacement = {
      id: `placement-${uid()}`,
      area: db.settings.areas[0],
      group: db.settings.groups[0],
      payMethod: "перевод" as const,
      payStatus: "ожидание" as const,
      status: "новый" as const,
      subscriptionPlan: DEFAULT_SUBSCRIPTION_PLAN,
      payDate: todayISO(),
      ...(defaultPlanMeta?.amount != null ? { payAmount: defaultPlanMeta.amount } : {}),
    };
    const c: Client = {
      id: uid(),
      firstName: "Новый",
      lastName: "Клиент",
      parentName: "",
      phone: "",
      whatsApp: "",
      telegram: "",
      instagram: "",
      channel: "Telegram",
      birthDate: new Date("2017-01-01").toISOString(),
      gender: "м",
      area: primaryPlacement.area,
      group: primaryPlacement.group,
      startDate: todayISO(),
      payMethod: primaryPlacement.payMethod,
      payStatus: primaryPlacement.payStatus,
      status: primaryPlacement.status,
      subscriptionPlan: primaryPlacement.subscriptionPlan,
      ...(primaryPlacement.payAmount != null ? { payAmount: primaryPlacement.payAmount } : {}),
      payDate: primaryPlacement.payDate,
      placements: [primaryPlacement],
    } as Client;
    const next = { ...db, clients: [c, ...db.clients] };
    const result = await commitDBUpdate(next, setDB);
    if (result.ok) {
      setQuickOpen(false);
      setUI(prev => ({ ...prev, pendingClientId: c.id }));
      navigate("/clients");
      push("Клиент создан", "success");
    } else if (result.reason === "conflict") {
      push(DB_CONFLICT_MESSAGE, "warning");
    } else {
      push("Не удалось сохранить клиента", "error");
    }
  };
  const addQuickLead = async () => {
    const l: Lead = {
      id: uid(),
      name: "Новый лид",
      parentName: "",
      firstName: "Новый",
      lastName: "Лид",
      birthDate: new Date("2017-01-01").toISOString(),
      startDate: todayISO(),
      area: db.settings.areas[0],
      group: db.settings.groups[0],
      source: "Instagram",
      stage: "Очередь",
      subscriptionPlan: DEFAULT_SUBSCRIPTION_PLAN,
      phone: "",
      whatsApp: "",
      telegram: "",
      instagram: "",
      createdAt: todayISO(),
      updatedAt: todayISO(),
    } as Lead;
    const next = { ...db, leads: [l, ...db.leads] };
    const result = await commitDBUpdate(next, setDB);
    if (result.ok) {
      setQuickOpen(false);
      push("Лид создан", "success");
    } else if (result.reason === "conflict") {
      push(DB_CONFLICT_MESSAGE, "warning");
    } else {
      push("Не удалось сохранить лида", "error");
    }
  };
  const addQuickTask = async () => {
    const admin = db.staff.find((s: StaffMember) => s.role === "Администратор");
    const t: TaskItem = {
      id: uid(),
      title: "Новая задача",
      due: todayISO(),
      status: "open",
      assigneeType: admin ? "staff" : undefined,
      assigneeId: admin?.id,
      topic: "другое",
      area: db.settings.areas[0],
      group: db.settings.groups[0],
    } as TaskItem;
    const next = { ...db, tasks: [t, ...db.tasks], tasksArchive: db.tasksArchive };
    const result = await commitDBUpdate(next, setDB);
    if (result.ok) {
      setQuickOpen(false);
      push("Задача создана", "success");
    } else if (result.reason === "conflict") {
      push(DB_CONFLICT_MESSAGE, "warning");
    } else {
      push("Не удалось сохранить задачу", "error");
    }
  };

  return {
    db,
    setDB,
    undoDBChange,
    canUndoDBChange,
    redoDBChange,
    canRedoDBChange,
    ui,
    setUI,
    roles,
    currentUser,
    loginUser,
    registerUser,
    logoutUser,
    toasts,
    isLocalOnly,
    quickOpen,
    onQuickAdd,
    setQuickOpen,
    addQuickClient,
    addQuickLead,
    addQuickTask,
  };
}
