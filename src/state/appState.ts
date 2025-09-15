import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { TAB_TITLES } from "../components/Tabs";
import { useToasts } from "../components/Toasts";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import type {
  DB,
  UIState,
  Client,
  Lead,
  TaskItem,
  Area,
  Group,
  Gender,
  PaymentStatus,
  Role,
  Currency,
  AttendanceEntry,
  ScheduleSlot,
  Settings,
  StaffMember,
  TabKey,
} from "../types";

const fs = db;

export const LS_KEYS = {
  ui: "judo_crm_ui_v1",
};

export const rnd = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const todayISO = () => new Date().toISOString();
export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU").format(new Date(iso));
export const fmtMoney = (v: number, c: Currency) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: c }).format(v);
const calcAge = (iso: string) => {
  const d = new Date(iso);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
};
export const parseDateInput = (value: string) => {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : d.toISOString();
};
export const calcAgeYears = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
};
export const calcExperience = (iso: string) => {
  const start = new Date(iso);
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    now.getMonth() - start.getMonth();
  if (months < 12) return `${months} мес.`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} г.${rest ? ` ${rest} мес.` : ""}`;
};

export function makeSeedDB(): DB {
  const areas: Area[] = ["Махмутлар", "Центр", "Джикджилли"];
  const groups: Group[] = [
    "4–6",
    "6–9",
    "7–14",
    "9–14",
    "взрослые",
    "индивидуальные",
    "доп. группа",
  ];
  const staff: StaffMember[] = [
    { id: uid(), role: "Администратор", name: "Админ", areas, groups },
    { id: uid(), role: "Менеджер", name: "Марина", areas, groups },
    { id: uid(), role: "Менеджер", name: "Илья", areas, groups },
    {
      id: uid(),
      role: "Тренер",
      name: "Алексей",
      areas: ["Центр", "Джикджилли"],
      groups: ["4–6", "6–9", "9–14", "взрослые"],
    },
    {
      id: uid(),
      role: "Тренер",
      name: "Сергей",
      areas: ["Махмутлар"],
      groups: ["4–6", "6–9", "7–14", "9–14"],
    },
  ];
  const coachIds = staff.filter(s => s.role === "Тренер").map(s => s.id);

  const firstNames = [
    "Иван",
    "Анна",
    "Михаил",
    "Елена",
    "Павел",
    "Дарья",
    "Никита",
    "София",
    "Матвей",
    "Алиса",
    "Кирилл",
    "Артём",
    "Полина",
    "Виктор",
    "Ольга",
    "Денис",
    "Роман",
    "Ксения",
    "Леонид",
    "Мария",
    "Егор",
    "Ева",
    "Владислав",
    "Ирина",
    "Глеб",
    "Вероника",
    "Савелий",
    "Лиза",
    "Тимур",
    "Арина",
  ];
  const lastNames = [
    "Иванов",
    "Петров",
    "Сидоров",
    "Кузнецов",
    "Смирнов",
    "Попов",
    "Ершов",
    "Фролов",
    "Соколов",
    "Орлов",
  ];

  const nClients = rnd(18, 30);
  const clients: Client[] = Array.from({ length: nClients }).map(() => {
    const fn = firstNames[rnd(0, firstNames.length - 1)];
    const ln = lastNames[rnd(0, lastNames.length - 1)];
    const gender: Gender = Math.random() < 0.5 ? "м" : "ж";
    const area = areas[rnd(0, areas.length - 1)];
    const group = groups[rnd(0, groups.length - 1)];
    const start = new Date();
    start.setMonth(start.getMonth() - rnd(0, 6));
    return {
      id: uid(),
      firstName: fn,
      lastName: ln,
      channel: "Telegram",
      birthDate: new Date(
        Date.now() - rnd(7, 14) * 365 * 86400000,
      ).toISOString(),
      gender,
      area,
      group,
      startDate: start.toISOString(),
      payMethod: "перевод",
      payStatus: "действует",
      payDate: start.toISOString(),
      payAmount: rnd(50, 100),
    } as Client;
  });

  const schedule: ScheduleSlot[] = [];
  const coachAlexey = staff.find(s => s.name === "Алексей")?.id || "";
  const coachSergey = staff.find(s => s.name === "Сергей")?.id || "";
  schedule.push(
    { id: uid(), area: "Центр", group: "6–9", coachId: coachAlexey, weekday: 2, time: "17:30", location: "" },
    { id: uid(), area: "Центр", group: "4–6", coachId: coachAlexey, weekday: 2, time: "18:30", location: "" },
    { id: uid(), area: "Центр", group: "9–14", coachId: coachAlexey, weekday: 2, time: "19:30", location: "" },
  );

  const leads: Lead[] = [];
  const attendance: AttendanceEntry[] = [];
  for (const c of clients) {
    const entries = rnd(3, 8);
    for (let i = 0; i < entries; i++) {
      const d = new Date();
      d.setDate(d.getDate() - rnd(1, 25));
      attendance.push({ id: uid(), clientId: c.id, date: d.toISOString(), came: Math.random() < 0.8 });
    }
  }

  const tasks: TaskItem[] = [
    {
      id: uid(),
      title: "Оплата аренды — Центр",
      due: new Date(Date.now() + 5 * 86400000).toISOString(),
      assigneeType: "staff",
      assigneeId: staff.find(s => s.role === "Администратор")?.id,
      status: "open",
      topic: "аренда",
      area: "Центр",
    },
    {
      id: uid(),
      title: "Поздравить с ДР — Иван",
      due: new Date(Date.now() + 2 * 86400000).toISOString(),
      assigneeType: "staff",
      assigneeId: staff.find(s => s.role === "Администратор")?.id,
      status: "open",
      topic: "день рождения",
    },
  ];

  const settings: Settings = {
    areas,
    groups,
    limits: Object.fromEntries(areas.flatMap(a => groups.map(g => [`${a}|${g}`, 20]))),
    rentByAreaEUR: { Махмутлар: 300, Центр: 400, Джикджилли: 250 },
    currencyRates: { EUR: 1, TRY: 36, RUB: 100 },
    coachPayFormula: "фикс 100€ + 5€ за ученика",
  };

  return {
    clients,
    attendance,
    schedule,
    leads,
    tasks,
    staff,
    settings,
    changelog: [
      { id: uid(), who: "Система", what: "Инициализация БД (seed)", when: todayISO() },
    ],
  };
}

export async function saveDB(data: DB) {
  if (!fs) {
    console.warn("Firestore not initialized");
    return;
  }
  const ref = doc(fs, "app", "main");
  try {
    await setDoc(ref, data);
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
    if (!fs) {
      console.warn("Firestore not initialized");
      push("Нет подключения к базе данных", "warning");
      return;
    }
    const ref = doc(fs, "app", "main");
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

