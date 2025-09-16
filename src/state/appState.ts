import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { TAB_TITLES } from "../components/Tabs";
import { useToasts } from "../components/Toasts";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db as firestore } from "../firebase";
import { makeSeedDB } from "./seed";
import { todayISO, uid } from "./utils";
import type {
  DB,
  UIState,
  Client,
  Lead,
  TaskItem,
  Role,
  StaffMember,
  TabKey,
} from "../types";


export const LS_KEYS = {
  ui: "judo_crm_ui_v1",
};

export async function saveDB(dbData: DB) {

  if (!firestore) {
    console.warn("Firestore not initialized");
    return;
  }
  const ref = doc(firestore, "app", "main");
  try {
    await setDoc(ref, dbData);

  } catch (err) {
    console.error("Failed to save DB", err);
    throw err;
  }
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
    | "schedule"
    | "leads"
    | "tasks"
    | "appeals"
    | "settings",
) {
  if (role === "Администратор") return true;
  if (role === "Менеджер") {
    return ["manage_clients", "leads", "tasks", "attendance", "schedule", "appeals"].includes(
      feature,
    );
  }
  if (role === "Тренер") {
    return ["attendance", "schedule"].includes(feature);
  }
  return false;
}

function usePersistentState<T>(
  key: string,
  defaultValue: T,
  delay: number = 300,
): [T, (v: T) => void] {
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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        try {
          localStorage.setItem(key, JSON.stringify(state));
        } catch {}
      }
    };
  }, []);

  return [state, setState];
}

export function useAppState() {
  const [db, setDB] = useState<DB>(makeSeedDB());
  const [ui, setUI] = usePersistentState<UIState>(LS_KEYS.ui, defaultUI, 300);
  const roles: Role[] = ["Администратор", "Менеджер", "Тренер"];
  const { toasts, push } = useToasts();
  const [quickOpen, setQuickOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    if (ui.theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [ui.theme]);

  useEffect(() => {
    if (!firestore) {
      console.warn("Firestore not initialized");
      push("Нет подключения к базе данных", "error");
      return;
    }
    const ref = doc(firestore, "app", "main");
    let unsub = () => {};
    try {
      unsub = onSnapshot(ref, async snap => {
        try {
          if (snap.exists()) {
            setDB(snap.data() as DB);
          } else {
            const seed = makeSeedDB();
            setDB(seed);
            await setDoc(ref, seed);
          }
        } catch (err) {
          console.error("Error processing snapshot", err);
          push("Ошибка обновления данных", "error");
        }
      });
    } catch (err) {
      console.error("Failed to subscribe to snapshot", err);
      push("Не удалось подписаться на обновления", "error");
    }
    return () => unsub();
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEYS.ui) {
        try {
          const raw = localStorage.getItem(LS_KEYS.ui);
          if (raw != null) setUI(JSON.parse(raw) as UIState);
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
    if (ui.activeTab !== key) {
      const next = { ...ui, activeTab: key as TabKey, breadcrumbs: [TAB_TITLES[key as TabKey]] };
      setUI(next);
    }
  }, [location.pathname]);

  const onQuickAdd = () => setQuickOpen(true);
  const addQuickClient = async () => {
    const c: Client = {
      id: uid(),
      firstName: "Новый",
      lastName: "Клиент",
      channel: "Telegram",
      birthDate: new Date("2017-01-01").toISOString(),
      gender: "м",
      area: db.settings.areas[0],
      group: db.settings.groups[0],
      startDate: todayISO(),
      payMethod: "перевод",
      payStatus: "ожидание",
    } as Client;
    const next = { ...db, clients: [c, ...db.clients] };
    setDB(next);
    await saveDB(next);
    setQuickOpen(false);
    push("Клиент создан", "success");
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
      createdAt: todayISO(),
      updatedAt: todayISO(),
    } as Lead;
    const next = { ...db, leads: [l, ...db.leads] };
    setDB(next);
    await saveDB(next);
    setQuickOpen(false);
    push("Лид создан", "success");
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
    const next = { ...db, tasks: [t, ...db.tasks] };
    setDB(next);
    await saveDB(next);
    setQuickOpen(false);
    push("Задача создана", "success");
  };

  return {
    db,
    setDB,
    ui,
    setUI,
    roles,
    toasts,
    quickOpen,
    onQuickAdd,
    setQuickOpen,
    addQuickClient,
    addQuickLead,
    addQuickTask,
  };
}

