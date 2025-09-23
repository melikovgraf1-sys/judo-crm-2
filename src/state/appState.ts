import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useLocation } from "react-router-dom";
import { TAB_TITLES } from "../components/Tabs";
import { useToasts } from "../components/Toasts";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db as firestore, ensureSignedIn } from "../firebase";
import { makeSeedDB } from "./seed";
import { todayISO, uid } from "./utils";
import type {
  AttendanceEntry,
  Client,
  DB,
  Lead,
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
};

export const LOCAL_ONLY_MESSAGE =
  "Данные сейчас сохраняются только в этом браузере — синхронизация с Firebase отключена, поэтому содержимое может отличаться в других окнах.";

const DEFAULT_SETTINGS: Settings = {
  areas: ["Махмутлар", "Центр", "Джикджилли"],
  groups: ["4–6", "6–9", "7–14", "9–14", "взрослые", "индивидуальные", "доп. группа"],
  limits: Object.fromEntries(
    ["Махмутлар", "Центр", "Джикджилли"].flatMap(area =>
      ["4–6", "6–9", "7–14", "9–14", "взрослые", "индивидуальные", "доп. группа"].map(group => [`${area}|${group}`, 20]),
    ),
  ) as Settings["limits"],
  rentByAreaEUR: { Махмутлар: 300, Центр: 400, Джикджилли: 250 },
  coachSalaryByAreaEUR: { Махмутлар: 0, Центр: 0, Джикджилли: 0 },
  currencyRates: { EUR: 1, TRY: 48.78, RUB: 103.25 },
  coachPayFormula: "фикс 100€ + 5€ за ученика",
  analyticsFavorites: [],
};

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
    return DEFAULT_SETTINGS;
  }

  const raw = value as Partial<Settings>;
  const areas = ensureArray<string>(raw.areas);
  const groups = ensureArray<string>(raw.groups);

  return {
    areas: areas.length ? (areas as Settings["areas"]) : DEFAULT_SETTINGS.areas,
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

  return {
    clients: ensureObjectArray<Client>(raw.clients),
    attendance: ensureObjectArray<AttendanceEntry>(raw.attendance),
    performance: ensureObjectArray<PerformanceEntry>(raw.performance),
    schedule: ensureObjectArray<ScheduleSlot>(raw.schedule),
    leads: ensureObjectArray<Lead>(raw.leads),
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

export async function saveDB(dbData: DB): Promise<boolean> {
  if (!firestore) {
    console.warn("Firestore not initialized. Changes cannot be synchronized.");
    writeLocalDB(dbData);
    return true;
  }

  let signedIn = false;
  try {
    signedIn = await ensureSignedIn();
  } catch (err) {
    console.warn("Failed to verify Firebase authentication state", err);
  }

  const ref = doc(firestore, "app", "main");
  try {
    await setDoc(ref, dbData);
    if (!signedIn) {
      console.warn("Saved DB without confirmed Firebase authentication. Check security rules if data is missing remotely.");
    }
    writeLocalDB(dbData);
    return true;
  } catch (err) {
    console.error("Failed to save DB", err);
    return false;
  }
}

export async function commitDBUpdate(
  next: DB,
  setDB: Dispatch<SetStateAction<DB>>,
): Promise<boolean> {
  const persisted = await saveDB(next);
  if (persisted) {
    setDB(next);
  }
  return persisted;
}

const defaultUI: UIState = {
  role: "Администратор",
  activeTab: "dashboard",
  breadcrumbs: ["Дашборд"],
  currency: "EUR",
  search: "",
  theme: "light",
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

export interface AppState {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  ui: UIState;
  setUI: Dispatch<SetStateAction<UIState>>;
  roles: Role[];
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
  const roles: Role[] = ["Администратор", "Менеджер", "Тренер"];
  const { toasts, push } = useToasts();
  const [quickOpen, setQuickOpen] = useState(false);
  const [isLocalOnly, setIsLocalOnly] = useState<boolean>(() => !firestore);
  const location = useLocation();
  const localOnlyToastShownRef = useRef(false);

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
    } as Client;
    const next = { ...db, clients: [c, ...db.clients] };
    if (await commitDBUpdate(next, setDB)) {
      setQuickOpen(false);
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

