import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TAB_TITLES } from "../components/Tabs";
import { useToasts } from "../components/Toasts";
import { doc, getDoc, onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { db as firestore, ensureSignedIn } from "../firebase";
import { makeSeedDB } from "./seed";
import { todayISO, uid } from "./utils";
import { DEFAULT_SUBSCRIPTION_PLAN, getSubscriptionPlanMeta } from "./payments";
import { ensureReserveAreaIncluded } from "./areas";
import type {
  AttendanceEntry,
  Area,
  AuthState,
  AuthUser,
  Client,
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

const DEFAULT_SETTINGS: Settings = {
  areas: DEFAULT_AREAS,
  groups: [
    "4–6",
    "7–10 лет",
    "7–14",
    "11 лет и старше",
    "взрослые",
    "индивидуальные",
    "доп. группа",
  ],
  limits: Object.fromEntries(
    DEFAULT_AREAS.flatMap(area =>
      [
        "4–6",
        "7–10 лет",
        "7–14",
        "11 лет и старше",
        "взрослые",
        "индивидуальные",
        "доп. группа",
      ].map(group => [`${area}|${group}`, 20]),
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
      areas: ensureReserveAreaIncluded(DEFAULT_SETTINGS.areas) as Settings["areas"],
    };
  }

  const raw = value as Partial<Settings>;
  const areas = ensureArray<string>(raw.areas);
  const groups = ensureArray<string>(raw.groups);
  const normalizedAreas = ensureReserveAreaIncluded(
    areas.length ? (areas as Settings["areas"]) : DEFAULT_SETTINGS.areas,
  ) as Settings["areas"];

  return {
    areas: normalizedAreas,
    groups: groups.length ? (groups as Settings["groups"]) : DEFAULT_SETTINGS.groups,
    limits: raw.limits && typeof raw.limits === "object" ? (raw.limits as Settings["limits"]) : DEFAULT_SETTINGS.limits,
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

  return {
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
  } as DB;
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
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        return JSON.parse(raw) as T;
      }
    } catch {}
    localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  });

  const timeoutRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {}
    }, delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [state, key, delay]);

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
  const [db, setDB] = useState<DB>(() => readLocalDB() ?? makeSeedDB());
  const [ui, setUI] = usePersistentState<UIState>(LS_KEYS.ui, defaultUI, 300);
  const [auth, setAuth] = usePersistentState<AuthState>(LS_KEYS.auth, makeDefaultAuthState(), 300);
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
      area: db.settings.areas[0],
      group: db.settings.groups[0],
      startDate: todayISO(),
      payMethod: "перевод",
      payStatus: "ожидание",
      status: "новый",
      subscriptionPlan: DEFAULT_SUBSCRIPTION_PLAN,
      ...(defaultPlanMeta?.amount != null ? { payAmount: defaultPlanMeta.amount } : {}),
      payDate: todayISO(),
    } as Client;
    const next = { ...db, clients: [c, ...db.clients] };
    if (await commitDBUpdate(next, setDB)) {
      setQuickOpen(false);
      setUI(prev => ({ ...prev, pendingClientId: c.id }));
      navigate("/clients");
      push("Клиент создан", "success");
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
    if (await commitDBUpdate(next, setDB)) {
      setQuickOpen(false);
      push("Лид создан", "success");
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
    if (await commitDBUpdate(next, setDB)) {
      setQuickOpen(false);
      push("Задача создана", "success");
    } else {
      push("Не удалось сохранить задачу", "error");
    }
  };

  return {
    db,
    setDB,
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

