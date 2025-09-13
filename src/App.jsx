// @flow
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Topbar from "./components/Topbar";
import Tabs, { TAB_TITLES } from "./components/Tabs";
import Dashboard from "./components/Dashboard";
import ClientsTab from "./components/ClientsTab";
import AttendanceTab from "./components/AttendanceTab";
import ScheduleTab from "./components/ScheduleTab";
import LeadsTab from "./components/LeadsTab";
import TasksTab from "./components/TasksTab";
import SettingsTab from "./components/SettingsTab";
import QuickAddModal from "./components/QuickAddModal";
import Toasts, { useToasts } from "./components/Toasts";
import usePersistentState from "./hooks/usePersistentState";
import ErrorBoundary from "./components/ErrorBoundary";

// === ЛЁГКИЙ КАРКАС CRM (SPA в одном файле) ===
// Эта версия: вкладки, роли, seed-данные в LocalStorage, минимальные таблицы, поиск/фильтры,
// тосты, хлебные крошки, переключатель валют. Tailwind подключается локально.
// Далее можно по шагам добавить: Service Worker, Manifest, офлайн-синхронизацию, push-уведомления, экспорт CSV и т.д.

// Ключи LocalStorage
const LS_KEYS = {
  db: "judo_crm_db_v1",
  ui: "judo_crm_ui_v1",
};

// Типы
export type Role = "Администратор" | "Менеджер" | "Тренер";

// Районы и группы теперь динамические строки, чтобы админ мог добавлять свои варианты
export type Area = string;

export type Group = string;

export type Gender = "м" | "ж";

export type ContactChannel = "Telegram" | "WhatsApp" | "Instagram";

export type PaymentMethod = "наличные" | "перевод";

export type PaymentStatus = "ожидание" | "действует" | "задолженность";

export type LeadStage = "Очередь" | "Задержка" | "Пробное" | "Ожидание оплаты" | "Оплаченный абонемент" | "Отмена";

export type Currency = "EUR" | "TRY" | "RUB";

export interface Client {
  id: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  channel: ContactChannel;
  birthDate: string; // ISO
  parentName?: string;
  gender: Gender;
  area: Area;
  group: Group;
  coachId?: string;
  startDate: string; // ISO
  payMethod: PaymentMethod;
  payStatus: PaymentStatus;
  payDate?: string; // ISO
  payAmount?: number;
  // Автополя (рассчитываются на лету)
}

export interface AttendanceEntry {
  id: string;
  clientId: string;
  date: string; // ISO
  came: boolean;
  sourceArea?: Area; // для отработок
}

export interface ScheduleSlot {
  id: string;
  area: Area;
  group: Group;
  coachId: string;
  weekday: number; // 1..7
  time: string; // HH:MM
  location: string;
}

export interface Lead {
  id: string;
  name: string;
  parentName?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string; // ISO
  startDate?: string; // ISO
  area?: Area;
  group?: Group;
  contact?: string;
  source: ContactChannel;
  stage: LeadStage;
  notes?: string;
  managerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  due: string; // ISO
  assigneeType?: "client" | "staff";
  assigneeId?: string;
  status: "open" | "done";
  topic?: "оплата" | "аренда" | "день рождения" | "другое";
  area?: Area;
  group?: Group;
}

export interface StaffMember {
  id: string;
  role: Role;
  name: string;
  areas: Area[];
  groups: Group[];
}

export interface Settings {
  areas: Area[];
  groups: Group[];
  limits: Record<string, number>; // key: `${area}|${group}` => лимит мест
  rentByAreaEUR: Partial<Record<Area, number>>; // аренда в евро для простоты
  currencyRates: { EUR: number; TRY: number; RUB: number }; // к базовой валюте EUR (1.0)
  coachPayFormula: string; // просто строка, которая описывает формулу (демо)
}

export interface DB {
  clients: Client[];
  attendance: AttendanceEntry[];
  schedule: ScheduleSlot[];
  leads: Lead[];
  tasks: TaskItem[];
  staff: StaffMember[];
  settings: Settings;
  changelog: { id: string; who: string; what: string; when: string }[];
}

export interface UIState {
  role: Role;
  activeTab: TabKey;
  breadcrumbs: string[];
  currency: Currency;
  search: string;
  theme: "light" | "dark";
}

export type TabKey =
  | "dashboard"
  | "clients"
  | "attendance"
  | "schedule"
  | "leads"
  | "tasks"
  | "settings";

// Утилиты
export const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const todayISO = () => new Date().toISOString();
export const fmtDate = (iso: string) => new Intl.DateTimeFormat("ru-RU").format(new Date(iso));
export const fmtMoney = (v: number, c: Currency) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: c }).format(v);
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
  const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
  if (months < 12) return `${months} мес.`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} г.${rest ? ` ${rest} мес.` : ""}`;
};

// Seed-данные
export function makeSeedDB(): DB {
  const areas: Area[] = ["Махмутлар", "Центр", "Джикджилли"];
  const groups: Group[] = ["4–6", "6–9", "7–14", "9–14", "взрослые", "индивидуальные", "доп. группа"];
  const staff: StaffMember[] = [
    { id: uid(), role: "Администратор", name: "Админ", areas, groups },
    { id: uid(), role: "Менеджер", name: "Марина", areas, groups },
    { id: uid(), role: "Менеджер", name: "Илья", areas, groups },
    { id: uid(), role: "Тренер", name: "Алексей", areas: ["Центр", "Джикджилли"], groups: ["4–6", "6–9", "9–14", "взрослые"] },
    { id: uid(), role: "Тренер", name: "Сергей", areas: ["Махмутлар"], groups: ["4–6", "6–9", "7–14", "9–14"] },
  ];
  const coachIds = staff.filter(s => s.role === "Тренер").map(s => s.id);

  const firstNames = ["Иван", "Анна", "Михаил", "Елена", "Павел", "Дарья", "Никита", "София", "Матвей", "Алиса", "Кирилл", "Артём", "Полина", "Виктор", "Ольга", "Денис", "Роман", "Ксения", "Леонид", "Мария", "Егор", "Ева", "Владислав", "Ирина", "Глеб", "Вероника", "Савелий", "Лиза", "Тимур", "Арина"];
  const lastNames = ["Иванов", "Петров", "Сидоров", "Кузнецов", "Смирнов", "Попов", "Ершов", "Фролов", "Соколов", "Орлов"];

  const nClients = rnd(18, 30);
  const clients: Client[] = Array.from({ length: nClients }).map(() => {
    const fn = firstNames[rnd(0, firstNames.length - 1)];
    const ln = lastNames[rnd(0, lastNames.length - 1)];
    const gender: Gender = Math.random() < 0.5 ? "м" : "ж";
    const area = areas[rnd(0, areas.length - 1)];
    const group = groups[rnd(0, groups.length - 1)];
    const coachId = coachIds[rnd(0, coachIds.length - 1)];
    const ageYears = rnd(5, 14);
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - ageYears);
    const start = new Date();
    start.setMonth(start.getMonth() - rnd(0, 8));
    const payStatus = ["ожидание", "действует", "задолженность"][rnd(0, 2)];
    const channel = ["Telegram", "WhatsApp", "Instagram"][rnd(0, 2)];
    const payMethod = Math.random() < 0.6 ? "перевод" : "наличные";
    const payDate = new Date();
    payDate.setDate(payDate.getDate() - rnd(0, 30));
    const payAmount = rnd(20, 60) * 10; // базовая валюта EUR
    return {
      id: uid(),
      firstName: fn,
      lastName: ln,
      phone: "+90" + rnd(500000000, 599999999),
      channel,
      birthDate: birthDate.toISOString(),
      parentName: Math.random() < 0.5 ? "Родитель " + ln : undefined,
      gender,
      area,
      group,
      coachId,
      startDate: start.toISOString(),
      payMethod,
      payStatus,
      payDate: payDate.toISOString(),
      payAmount,
    };
  });

  const coachAlexey = staff.find(s => s.name === "Алексей")?.id || "";
  const coachSergey = staff.find(s => s.name === "Сергей")?.id || "";

  const schedule: ScheduleSlot[] = [
    // Центр — вторник и четверг
    { id: uid(), area: "Центр", group: "6–9", coachId: coachAlexey, weekday: 2, time: "17:30", location: "" },
    { id: uid(), area: "Центр", group: "4–6", coachId: coachAlexey, weekday: 2, time: "18:30", location: "" },
    { id: uid(), area: "Центр", group: "9–14", coachId: coachAlexey, weekday: 2, time: "19:30", location: "" },
    { id: uid(), area: "Центр", group: "6–9", coachId: coachAlexey, weekday: 4, time: "17:30", location: "" },
    { id: uid(), area: "Центр", group: "4–6", coachId: coachAlexey, weekday: 4, time: "18:30", location: "" },
    { id: uid(), area: "Центр", group: "9–14", coachId: coachAlexey, weekday: 4, time: "19:30", location: "" },

    // Джикджилли — понедельник и пятница
    { id: uid(), area: "Джикджилли", group: "взрослые", coachId: coachAlexey, weekday: 1, time: "09:30", location: "" },
    { id: uid(), area: "Джикджилли", group: "доп. группа", coachId: coachAlexey, weekday: 1, time: "16:00", location: "" },
    { id: uid(), area: "Джикджилли", group: "6–9", coachId: coachAlexey, weekday: 1, time: "17:00", location: "" },
    { id: uid(), area: "Джикджилли", group: "4–6", coachId: coachAlexey, weekday: 1, time: "18:00", location: "" },
    { id: uid(), area: "Джикджилли", group: "9–14", coachId: coachAlexey, weekday: 1, time: "19:00", location: "" },
    { id: uid(), area: "Джикджилли", group: "доп. группа", coachId: coachAlexey, weekday: 1, time: "20:00", location: "" },
    { id: uid(), area: "Джикджилли", group: "взрослые", coachId: coachAlexey, weekday: 5, time: "09:30", location: "" },
    { id: uid(), area: "Джикджилли", group: "доп. группа", coachId: coachAlexey, weekday: 5, time: "16:00", location: "" },
    { id: uid(), area: "Джикджилли", group: "6–9", coachId: coachAlexey, weekday: 5, time: "17:00", location: "" },
    { id: uid(), area: "Джикджилли", group: "4–6", coachId: coachAlexey, weekday: 5, time: "18:00", location: "" },
    { id: uid(), area: "Джикджилли", group: "9–14", coachId: coachAlexey, weekday: 5, time: "19:00", location: "" },
    { id: uid(), area: "Джикджилли", group: "доп. группа", coachId: coachAlexey, weekday: 5, time: "20:00", location: "" },

    // Махмутлар — среда и суббота
    { id: uid(), area: "Махмутлар", group: "7–14", coachId: coachSergey, weekday: 3, time: "17:00", location: "" },
    { id: uid(), area: "Махмутлар", group: "4–6", coachId: coachSergey, weekday: 3, time: "18:00", location: "" },
    { id: uid(), area: "Махмутлар", group: "4–6", coachId: coachSergey, weekday: 6, time: "11:00", location: "" },
    { id: uid(), area: "Махмутлар", group: "7–14", coachId: coachSergey, weekday: 6, time: "12:00", location: "" },
  ];

  const leadsSources: ContactChannel[] = ["Instagram", "WhatsApp", "Telegram"];
  const leadStages: LeadStage[] = ["Очередь", "Задержка", "Пробное", "Ожидание оплаты", "Оплаченный абонемент", "Отмена"];
  const leads: Lead[] = Array.from({ length: rnd(8, 12) }).map(() => {
    const fn = firstNames[rnd(0, firstNames.length - 1)];
    const ln = lastNames[rnd(0, lastNames.length - 1)];
    const name = fn + " (лид)";
    const stage = leadStages[rnd(0, leadStages.length - 1)];
    const now = new Date();
    const created = new Date(now.getTime() - rnd(1, 20) * 86400000);
    const birth = new Date();
    birth.setFullYear(birth.getFullYear() - rnd(5, 14));
    const start = new Date();
    start.setDate(start.getDate() + rnd(1, 30));
    return {
      id: uid(),
      name,
      parentName: Math.random() < 0.5 ? "Родитель " + ln : undefined,
      firstName: fn,
      lastName: ln,
      birthDate: birth.toISOString(),
      startDate: start.toISOString(),
      area: areas[rnd(0, areas.length - 1)],
      group: groups[rnd(0, groups.length - 1)],
      source: leadsSources[rnd(0, leadsSources.length - 1)],
      contact: Math.random() < 0.7 ? "+90" + rnd(500000000, 599999999) : undefined,
      stage,
      notes: Math.random() < 0.5 ? "Интерес к пробному занятию" : undefined,
      managerId: staff.find(s => s.role === "Менеджер")?.id,
      createdAt: created.toISOString(),
      updatedAt: now.toISOString(),
    };
  });

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
    { id: uid(), title: "Оплата аренды — Центр", due: new Date(Date.now() + 5 * 86400000).toISOString(), assigneeType: "staff", assigneeId: staff.find(s => s.role === "Администратор")?.id, status: "open", topic: "аренда", area: "Центр" },
    { id: uid(), title: "Поздравить с ДР — Иван", due: new Date(Date.now() + 2 * 86400000).toISOString(), assigneeType: "staff", assigneeId: staff.find(s => s.role === "Администратор")?.id, status: "open", topic: "день рождения" },
  ];

  const settings: Settings = {
    areas,
    groups,
    limits: Object.fromEntries(
      areas.flatMap(a => groups.map(g => [`${a}|${g}`, 20]))
    ),
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

export function loadDB(): DB {
  const raw = localStorage.getItem(LS_KEYS.db);
  if (raw) {
    try { return (JSON.parse(raw): DB); } catch {}
  }
  const db = makeSeedDB();
  localStorage.setItem(LS_KEYS.db, JSON.stringify(db));
  return db;
}

export function saveDB(db: DB) { localStorage.setItem(LS_KEYS.db, JSON.stringify(db)); }

const defaultUI: UIState = {
  role: "Администратор",
  activeTab: "dashboard",
  breadcrumbs: ["Дашборд"],
  currency: "EUR",
  search: "",
  theme: "light",
};

// Ролевая проверка
export function can(role: Role, feature: "all" | "manage_clients" | "attendance" | "schedule" | "leads" | "tasks" | "settings") {
  if (role === "Администратор") return true;
  if (role === "Менеджер") {
    return ["manage_clients", "leads", "tasks", "attendance", "schedule"].includes(feature);
  }
  if (role === "Тренер") {
    return ["attendance", "schedule"].includes(feature);
  }
  return false;
}

export default function App() {

  const [db, setDB] = useState<DB>(() => loadDB());
  const [ui, setUI] = usePersistentState<UIState>(LS_KEYS.ui, defaultUI, 300);
  const roles: Role[] = ["Администратор", "Менеджер", "Тренер"];
  const { toasts, push } = useToasts();
  const [quickOpen, setQuickOpen] = useState(false);

  // Apply theme to root element
  useEffect(() => {
    const root = document.documentElement;
    if (ui.theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [ui.theme]);

  const onQuickAdd = () => setQuickOpen(true);
  const addQuickClient = () => {
    const c: Client = {
      id: uid(), firstName: "Новый", lastName: "Клиент", channel: "Telegram", birthDate: new Date("2017-01-01").toISOString(), gender: "м",
      area: db.settings.areas[0], group: db.settings.groups[0], startDate: todayISO(), payMethod: "перевод", payStatus: "ожидание"
    };
    const next = { ...db, clients: [c, ...db.clients] };
    setDB(next); saveDB(next); setQuickOpen(false); push("Клиент создан", "success");
  };
  const addQuickLead = () => {
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
    };
    const next = { ...db, leads: [l, ...db.leads] };
    setDB(next); saveDB(next); setQuickOpen(false); push("Лид создан", "success");
  };
  const addQuickTask = () => {
    const admin = db.staff.find(s => s.role === "Администратор");
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
    };
    const next = { ...db, tasks: [t, ...db.tasks] };
    setDB(next); saveDB(next); setQuickOpen(false); push("Задача создана", "success");
  };

  // Синхронизация между вкладками
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEYS.db) {
        setDB(loadDB());
      }
      if (e.key === LS_KEYS.ui) {
        try {
          const raw = localStorage.getItem(LS_KEYS.ui);
          if (raw != null) setUI((JSON.parse(raw): UIState));
        } catch (err) {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Командная палитра (Ctrl/Cmd+K)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setQuickOpen(v => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const location = useLocation();
  useEffect(() => {
    let key = location.pathname.replace(/^\/+/, "");
    if (key === "") key = "dashboard";
    if (!TAB_TITLES[key]) key = "dashboard";
    if (ui.activeTab !== key) {
      const next = { ...ui, activeTab: key, breadcrumbs: [TAB_TITLES[key]] };
      setUI(next);
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-sky-50 text-slate-900 dark:from-slate-900 dark:to-slate-950 dark:text-slate-100">
      <Topbar ui={ui} setUI={setUI} roleList={roles} onQuickAdd={onQuickAdd} />
      <Tabs role={ui.role} />

      <main className="max-w-7xl mx-auto p-3 space-y-3">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard db={db} ui={ui} />} />
            <Route
              path="/clients"
              element={
                can(ui.role, "manage_clients") ? (
                  <ClientsTab db={db} setDB={setDB} ui={ui} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/attendance"
              element={
                can(ui.role, "attendance") ? (
                  <AttendanceTab db={db} setDB={setDB} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/schedule"
              element={
                can(ui.role, "schedule") ? (
                  <ScheduleTab db={db} setDB={setDB} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/leads"
              element={
                can(ui.role, "leads") ? (
                  <LeadsTab db={db} setDB={setDB} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/tasks"
              element={
                can(ui.role, "tasks") ? (
                  <TasksTab db={db} setDB={setDB} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/settings"
              element={
                can(ui.role, "settings") ? (
                  <SettingsTab db={db} setDB={setDB} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>

      <QuickAddModal open={quickOpen} onClose={() => setQuickOpen(false)} onAddClient={addQuickClient} onAddLead={addQuickLead} onAddTask={addQuickTask} />
      <Toasts toasts={toasts} />

      <footer className="text-xs text-slate-500 text-center py-6">Каркас CRM · Следующие шаги: SW/Manifest/PWA, офлайн-синхронизация, push, CSV/печать</footer>
    </div>
  );
}
