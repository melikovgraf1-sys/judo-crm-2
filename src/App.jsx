// @flow
import React, { useEffect, useMemo, useRef, useState } from "react";

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
type Role = "Администратор" | "Менеджер" | "Тренер";

type Area = "Махмутлар" | "Центр" | "Джикджилли";

type Group =
  | "4–6"
  | "6–9"
  | "7–14"
  | "9–14"
  | "взрослые"
  | "индивидуальные"
  | "доп. группа";

type Gender = "м" | "ж";

type ContactChannel = "Telegram" | "WhatsApp" | "Instagram";

type PaymentMethod = "наличные" | "перевод";

type PaymentStatus = "ожидание" | "действует" | "задолженность";

type LeadStage = "Очередь" | "Задержка" | "Пробное" | "Ожидание оплаты" | "Оплаченный абонемент" | "Отмена";

type Currency = "EUR" | "TRY" | "RUB";

interface Client {
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

interface AttendanceEntry {
  id: string;
  clientId: string;
  date: string; // ISO
  came: boolean;
  sourceArea?: Area; // для отработок
}

interface ScheduleSlot {
  id: string;
  area: Area;
  group: Group;
  coachId: string;
  weekday: number; // 1..7
  time: string; // HH:MM
  location: string;
}

interface Lead {
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

interface TaskItem {
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

interface StaffMember {
  id: string;
  role: Role;
  name: string;
  areas: Area[];
  groups: Group[];
}

interface Settings {
  areas: Area[];
  groups: Group[];
  limits: Record<string, number>; // key: `${area}|${group}` => лимит мест
  rentByAreaEUR: Partial<Record<Area, number>>; // аренда в евро для простоты
  currencyRates: { EUR: number; TRY: number; RUB: number }; // к базовой валюте EUR (1.0)
  coachPayFormula: string; // просто строка, которая описывает формулу (демо)
}

interface DB {
  clients: Client[];
  attendance: AttendanceEntry[];
  schedule: ScheduleSlot[];
  leads: Lead[];
  tasks: TaskItem[];
  staff: StaffMember[];
  settings: Settings;
  changelog: { id: string; who: string; what: string; when: string }[];
}

interface UIState {
  role: Role;
  activeTab: TabKey;
  breadcrumbs: string[];
  currency: Currency;
  search: string;
}

type TabKey =
  | "dashboard"
  | "clients"
  | "attendance"
  | "schedule"
  | "leads"
  | "tasks"
  | "settings";

// Утилиты
const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const todayISO = () => new Date().toISOString();
const fmtDate = (iso: string) => new Intl.DateTimeFormat("ru-RU").format(new Date(iso));
const fmtMoney = (v: number, c: Currency) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: c }).format(v);
const calcAge = (iso: string) => {
  const d = new Date(iso);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
};
const parseDateInput = (value: string) => {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : d.toISOString();
};

const calcAgeYears = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
};

const calcExperience = (iso: string) => {
  const start = new Date(iso);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
  if (months < 12) return `${months} мес.`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} г.${rest ? ` ${rest} мес.` : ""}`;
};

// Seed-данные
function makeSeedDB(): DB {
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

function loadDB(): DB {
  const raw = localStorage.getItem(LS_KEYS.db);
  if (raw) {
    try { return (JSON.parse(raw): DB); } catch {}
  }
  const db = makeSeedDB();
  localStorage.setItem(LS_KEYS.db, JSON.stringify(db));
  return db;
}

function saveDB(db: DB) { localStorage.setItem(LS_KEYS.db, JSON.stringify(db)); }

function loadUI(): UIState {
  const raw = localStorage.getItem(LS_KEYS.ui);
  if (raw) {
    try { return (JSON.parse(raw): UIState); } catch {}
  }
  const ui: UIState = {
    role: "Администратор",
    activeTab: "dashboard",
    breadcrumbs: ["Дашборд"],
    currency: "EUR",
    search: "",
  };
  localStorage.setItem(LS_KEYS.ui, JSON.stringify(ui));
  return ui;
}

function saveUI(ui: UIState) { localStorage.setItem(LS_KEYS.ui, JSON.stringify(ui)); }

// Тосты
type Toast = { id: string; text: string; type?: "success" | "error" | "info" };
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (text: string, type: Toast["type"] = "info") => {
    const t = { id: uid(), text, type };
    setToasts(prev => [...prev, t]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500);
  };
  return { toasts, push };
}

// Ролевая проверка
function can(role: Role, feature: "all" | "manage_clients" | "attendance" | "schedule" | "leads" | "tasks" | "settings") {
  if (role === "Администратор") return true;
  if (role === "Менеджер") {
    return ["manage_clients", "leads", "tasks", "attendance", "schedule"].includes(feature);
  }
  if (role === "Тренер") {
    return ["attendance", "schedule"].includes(feature);
  }
  return false;
}

// Хлебные крошки
function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <nav className="text-sm text-slate-500 mb-2" aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center">
            <span className={i === items.length - 1 ? "text-slate-900" : "hover:underline"}>{it}</span>
            {i < items.length - 1 && <span className="mx-2">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Верхняя панель
function Topbar({ ui, setUI, roleList, onQuickAdd }: { ui: UIState; setUI: (u: UIState) => void; roleList: Role[]; onQuickAdd: () => void }) {
  return (
    <div className="w-full flex flex-wrap items-center justify-between gap-2 p-3 bg-white/70 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="font-semibold text-slate-800 text-lg">Judo CRM</div>
        <div className="hidden sm:block text-xs text-slate-500">спокойные синие/голубые — KPI зелёные</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          placeholder="Поиск…"
          className="px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring focus:ring-sky-200"
          value={ui.search}
          onChange={e => { const u = { ...ui, search: e.target.value }; setUI(u); saveUI(u); }}
        />
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm"
          value={ui.currency}
          onChange={e => { const u = { ...ui, currency: e.target.value }; setUI(u); saveUI(u); }}
        >
          <option value="EUR">€</option>
          <option value="TRY">TRY</option>
          <option value="RUB">RUB</option>
        </select>
        <button onClick={onQuickAdd} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700">+ Быстро добавить</button>
        <select
          className="px-2 py-2 rounded-md border border-slate-300 text-sm"
          value={ui.role}
          onChange={e => { const u = { ...ui, role: e.target.value }; setUI(u); saveUI(u); }}
          title="Войти как"
        >
          {roleList.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
    </div>
  );
}

// Навигация вкладок
const TABS: { key: TabKey; title: string; need?: (role: Role) => boolean }[] = [
  { key: "dashboard", title: "Дашборд" },
  { key: "clients", title: "Клиенты", need: r => can(r, "manage_clients") },
  { key: "attendance", title: "Посещаемость", need: r => can(r, "attendance") },
  { key: "schedule", title: "Расписание", need: r => can(r, "schedule") },
  { key: "leads", title: "Лиды", need: r => can(r, "leads") },
  { key: "tasks", title: "Задачи", need: r => can(r, "tasks") },
  { key: "settings", title: "Настройки", need: r => can(r, "settings") },
];

function Tabs({ ui, setUI, role }: { ui: UIState; setUI: (u: UIState) => void; role: Role }) {
  const visible = TABS.filter(t => !t.need || t.need(role));
  return (
    <div className="w-full overflow-x-auto border-b border-slate-200 bg-gradient-to-r from-sky-50 to-blue-50">
      <div className="flex gap-1 p-2">
        {visible.map(t => (
          <button
            key={t.key}
            onClick={() => { const u = { ...ui, activeTab: t.key, breadcrumbs: [t.title] }; setUI(u); saveUI(u); }}
            className={`px-3 py-2 rounded-md text-sm ${ui.activeTab === t.key ? "bg-white text-sky-700 border border-sky-200" : "text-slate-700 hover:bg-white/80"}`}
          >
            {t.title}
          </button>
        ))}
      </div>
    </div>
  );
}

// Баннер-инструкция (оффлайн — добавим позже PWA)
function OfflineTip() {
  return (
    <div className="m-3 p-3 rounded-xl bg-blue-50 border border-blue-200 text-slate-700">
      <div className="font-medium mb-1">Как сохранить и работать офлайн</div>
      <ul className="list-disc pl-5 text-sm space-y-1">
        <li>В браузере откройте эту страницу, оставьте её открытой один раз (кешируется автоматически).</li>
        <li>Добавить на главный экран: в мобильном браузере «Поделиться» → «На экран домой».</li>
        <li>Отметки посещаемости и данные сохраняются локально. Позже можно синхронизировать (функция будет добавлена).</li>
      </ul>
    </div>
  );
}

// Карточка-метрика
function MetricCard({ title, value, accent }: { title: string; value: string; accent?: "green" | "sky" | "slate" }) {
  const cls = accent === "green" ? "bg-emerald-50 border-emerald-200" : accent === "sky" ? "bg-sky-50 border-sky-200" : "bg-slate-50 border-slate-200";
  return (
    <div className={`p-4 rounded-2xl border ${cls} min-w-[180px]`}>
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-xl font-semibold text-slate-800 mt-1">{value}</div>
    </div>
  );
}

// Фильтр-чип
function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-3 py-1 rounded-full border text-xs ${active ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}>{children}</button>
  );
}

// Таблица-обёртка
function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        {children}
      </table>
    </div>
  );
}

// Вкладка: Дашборд (минимум для каркаса)
function Dashboard({ db, ui }: { db: DB; ui: UIState }) {
  const currency: Currency = ui.currency;
  const totalClients = db.clients.length;
  const activeClients = db.clients.filter(c => c.payStatus === "действует").length;
  const leadsCount = db.leads.length;

  // Грубая выручка по активным: считаем 55€ на ученика (дзюдо) как пример
  const revenueEUR = activeClients * 55;
  const rate = (cur: Currency) => (cur === "EUR" ? 1 : cur === "TRY" ? db.settings.currencyRates.TRY : db.settings.currencyRates.RUB);
  const revenue = revenueEUR * rate(currency);

  // Заполняемость: активные / суммарный лимит
  const totalLimit = Object.values(db.settings.limits).reduce((a, b) => a + b, 0);
  const fillPct = totalLimit ? Math.round((activeClients / totalLimit) * 100) : 0;

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Дашборд"]} />
      <OfflineTip />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title="Ученики всего" value={String(totalClients)} accent="sky" />
        <MetricCard title="Активные (действует)" value={String(activeClients)} accent="green" />
        <MetricCard title="Выручка (прибл.)" value={fmtMoney(revenue, currency)} accent="sky" />
        <MetricCard title="Заполняемость" value={`${fillPct}%`} accent={fillPct >= 80 ? "green" : "slate"} />
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl border border-slate-200 bg-white">
          <div className="font-semibold mb-2">Лиды по этапам</div>
          <div className="flex flex-wrap gap-2">
            {["Очередь", "Задержка", "Пробное", "Ожидание оплаты", "Оплаченный абонемент", "Отмена"].map(s => (
              <div key={s} className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div className="text-slate-500">{s}</div>
                <div className="text-lg font-semibold text-slate-800">{db.leads.filter(l => l.stage === s).length}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 rounded-2xl border border-slate-200 bg-white">
          <div className="font-semibold mb-2">Предстоящие задачи</div>
          <ul className="space-y-2">
            {db.tasks
              .slice()
              .sort((a, b) => +new Date(a.due) - +new Date(b.due))
              .slice(0, 6)
              .map(t => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{t.title}</span>
                  <span className="text-slate-500">{fmtDate(t.due)}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// Вкладка: Клиенты (минимальный CRUD + фильтр)
function ClientsTab({ db, setDB, ui }: { db: DB; setDB: (db: DB) => void; ui: UIState }) {
  const [area, setArea] = useState<Area | "all">("all");
  const [group, setGroup] = useState<Group | "all">("all");
  const [pay, setPay] = useState<PaymentStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const blankForm = () => ({
    firstName: "",
    lastName: "",
    phone: "",
    gender: "м",
    area: db.settings.areas[0],
    group: db.settings.groups[0],
    channel: "Telegram",
    startDate: new Date().toISOString(),
    payMethod: "перевод",
    payStatus: "ожидание",
    birthDate: new Date("2017-01-01").toISOString(),
    payDate: new Date().toISOString(),
    payAmount: 0,
    parentName: "",
  });
  const [form, setForm] = useState<Partial<Client>>(blankForm());
  const [editing, setEditing] = useState<Client | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);

  const list = useMemo(() => {
    return db.clients.filter(c =>
      (area === "all" || c.area === area) &&
      (group === "all" || c.group === group) &&
      (pay === "all" || c.payStatus === pay) &&
      (!ui.search || `${c.firstName} ${c.lastName ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(ui.search.toLowerCase()))
    );
  }, [db.clients, area, group, pay, ui.search]);

  const openAddModal = () => {
    setEditing(null);
    setForm(blankForm());
    setModalOpen(true);
  };

  const startEdit = (c: Client) => {
    setEditing(c);
    setForm(c);
    setSelected(null);
    setModalOpen(true);
  };

  const saveClient = () => {
    if (editing) {
      const updated: Client = { ...editing, ...form };
      const next = {
        ...db,
        clients: db.clients.map(cl => (cl.id === editing.id ? updated : cl)),
        changelog: [...db.changelog, { id: uid(), who: "UI", what: `Обновлён клиент ${updated.firstName}`, when: todayISO() }],
      };
      setDB(next); saveDB(next);
    } else {
      const c: Client = {
        id: uid(),
        firstName: String(form.firstName || ""),
        lastName: form.lastName || "",
        phone: form.phone || "",
        channel: form.channel,
        birthDate: form.birthDate || new Date("2017-01-01").toISOString(),
        parentName: form.parentName || "",
        gender: form.gender || "м",
        area: form.area || db.settings.areas[0],
        group: form.group || db.settings.groups[0],
        coachId: db.staff.find(s => s.role === "Тренер")?.id,
        startDate: form.startDate || todayISO(),
        payMethod: form.payMethod || "перевод",
        payStatus: form.payStatus || "ожидание",
        payDate: form.payDate || todayISO(),
        payAmount: form.payAmount || 0,
      };
      const next = {
        ...db,
        clients: [c, ...db.clients],
        changelog: [...db.changelog, { id: uid(), who: "UI", what: `Создан клиент ${c.firstName}`, when: todayISO() }],
      };
      setDB(next); saveDB(next);
    }
    setModalOpen(false);
    setEditing(null);
  };

  const removeClient = (id: string) => {
    if (!confirm("Удалить клиента?")) return;
    const next = { ...db, clients: db.clients.filter(c => c.id !== id), changelog: [...db.changelog, { id: uid(), who: "UI", what: `Удалён клиент ${id}`, when: todayISO() }] };
    setDB(next); saveDB(next);
  };

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Клиенты"]} />
      <div className="flex flex-wrap gap-2 items-center">
        <Chip active={area === "all"} onClick={() => setArea("all")}>Все районы</Chip>
        {db.settings.areas.map(a => <Chip key={a} active={area === a} onClick={() => setArea(a)}>{a}</Chip>)}
        <div className="flex-1" />
        <button onClick={openAddModal} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700">+ Добавить клиента</button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select className="px-2 py-2 rounded-md border border-slate-300 text-sm" value={group} onChange={e => setGroup(e.target.value)}>
          <option value="all">Все группы</option>
          {db.settings.groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className="px-2 py-2 rounded-md border border-slate-300 text-sm" value={pay} onChange={e => setPay(e.target.value)}>
          <option value="all">Все статусы оплаты</option>
          <option value="ожидание">ожидание</option>
          <option value="действует">действует</option>
          <option value="задолженность">задолженность</option>
        </select>
        <div className="text-xs text-slate-500">Найдено: {list.length}</div>
      </div>

      <TableWrap>
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left p-2">Имя</th>
            <th className="text-left p-2">Пол</th>
            <th className="text-left p-2">Район</th>
            <th className="text-left p-2">Группа</th>
            <th className="text-left p-2">Телефон</th>
            <th className="text-left p-2">Статус оплаты</th>
            <th className="text-right p-2">Действия</th>
          </tr>
        </thead>
        <tbody>
          {list.map(c => (
            <tr key={c.id} className="border-t border-slate-100">
              <td
                className="p-2 whitespace-nowrap text-sky-700 hover:underline cursor-pointer"
                onClick={() => setSelected(c)}
              >
                {c.firstName} {c.lastName}
              </td>
              <td className="p-2">{c.gender}</td>
              <td className="p-2">{c.area}</td>
              <td className="p-2">{c.group}</td>
              <td className="p-2">{c.phone || "—"}</td>
              <td className="p-2">
                <span className={`px-2 py-1 rounded-full text-xs ${c.payStatus === "действует" ? "bg-emerald-100 text-emerald-700" : c.payStatus === "задолженность" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{c.payStatus}</span>
              </td>
              <td className="p-2 text-right">
                <button onClick={() => removeClient(c.id)} className="px-2 py-1 text-xs rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50">Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      {selected && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 space-y-3">
            <div className="font-semibold text-slate-800">
              {selected.firstName} {selected.lastName}
            </div>
            <div className="grid gap-1 text-sm">
              <div><span className="text-slate-500">Телефон:</span> {selected.phone || "—"}</div>
              <div><span className="text-slate-500">Канал:</span> {selected.channel}</div>
              <div><span className="text-slate-500">Родитель:</span> {selected.parentName || "—"}</div>
              <div><span className="text-slate-500">Дата рождения:</span> {selected.birthDate?.slice(0,10)}</div>
              <div><span className="text-slate-500">Возраст:</span> {selected.birthDate ? `${calcAgeYears(selected.birthDate)} лет` : "—"}</div>
              <div><span className="text-slate-500">Район:</span> {selected.area}</div>
              <div><span className="text-slate-500">Группа:</span> {selected.group}</div>
              <div><span className="text-slate-500">Опыт:</span> {calcExperience(selected.startDate)}</div>
              <div><span className="text-slate-500">Статус оплаты:</span> {selected.payStatus}</div>
              <div><span className="text-slate-500">Дата оплаты:</span> {selected.payDate?.slice(0,10) || "—"}</div>
              <div><span className="text-slate-500">Сумма оплаты:</span> {selected.payAmount != null ? fmtMoney(selected.payAmount, ui.currency) : "—"}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => startEdit(selected)} className="px-3 py-2 rounded-md border border-slate-300">Редактировать</button>
              <button onClick={() => { removeClient(selected.id); setSelected(null); }} className="px-3 py-2 rounded-md border border-rose-200 text-rose-600">Удалить</button>
              <button onClick={() => setSelected(null)} className="px-3 py-2 rounded-md border border-slate-300">Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-4 space-y-3">
            <div className="font-semibold text-slate-800">{editing ? "Редактирование клиента" : "Новый клиент"}</div>
            <div className="grid sm:grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Имя</label>
                <input className="px-3 py-2 rounded-md border border-slate-300" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Фамилия</label>
                <input className="px-3 py-2 rounded-md border border-slate-300" value={form.lastName || ""} onChange={e => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Телефон</label>
                <input className="px-3 py-2 rounded-md border border-slate-300" value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Канал</label>
                <select className="px-3 py-2 rounded-md border border-slate-300" value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
                  <option>Telegram</option><option>WhatsApp</option><option>Instagram</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Пол</label>
                <select className="px-3 py-2 rounded-md border border-slate-300" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                  <option value="м">м</option><option value="ж">ж</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Район</label>
                <select className="px-3 py-2 rounded-md border border-slate-300" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })}>
                  {db.settings.areas.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Группа</label>
                <select className="px-3 py-2 rounded-md border border-slate-300" value={form.group} onChange={e => setForm({ ...form, group: e.target.value })}>
                  {db.settings.groups.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Дата рождения</label>
                <input type="date" className="px-3 py-2 rounded-md border border-slate-300" value={form.birthDate?.slice(0,10) || ""} onChange={e => setForm({ ...form, birthDate: parseDateInput(e.target.value) })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Дата начала</label>
                <input type="date" className="px-3 py-2 rounded-md border border-slate-300" value={form.startDate?.slice(0,10) || ""} onChange={e => setForm({ ...form, startDate: parseDateInput(e.target.value) })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Способ оплаты</label>
                <select className="px-3 py-2 rounded-md border border-slate-300" value={form.payMethod} onChange={e => setForm({ ...form, payMethod: e.target.value })}>
                  <option>перевод</option><option>наличные</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Статус оплаты</label>
                <select className="px-3 py-2 rounded-md border border-slate-300" value={form.payStatus} onChange={e => setForm({ ...form, payStatus: e.target.value })}>
                  <option>ожидание</option><option>действует</option><option>задолженность</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setModalOpen(false); setEditing(null); }} className="px-3 py-2 rounded-md border border-slate-300">Отмена</button>
              <button onClick={saveClient} className="px-3 py-2 rounded-md bg-sky-600 text-white">Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Вкладка: Посещаемость (минимум: отметка пришёл/не пришёл за сегодня)
function AttendanceTab({ db, setDB }: { db: DB; setDB: (db: DB) => void }) {
  const [area, setArea] = useState<Area | "all">("all");
  const [group, setGroup] = useState<Group | "all">("all");
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const list = useMemo(() => {
    return db.clients.filter(c => (area === "all" || c.area === area) && (group === "all" || c.group === group));
  }, [db.clients, area, group]);

  const getMark = (clientId: string) => db.attendance.find(a => a.clientId === clientId && a.date.slice(0,10) === todayStr);

  const toggle = (clientId: string) => {
    const mark = getMark(clientId);
    if (mark) {
      // переключить
      const updated = { ...mark, came: !mark.came };
      const next = { ...db, attendance: db.attendance.map(a => a.id === mark.id ? updated : a) };
      setDB(next); saveDB(next);
    } else {
      const entry: AttendanceEntry = { id: uid(), clientId, date: new Date().toISOString(), came: true };
      const next = { ...db, attendance: [entry, ...db.attendance] };
      setDB(next); saveDB(next);
    }
  };

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Посещаемость"]} />
      <div className="flex flex-wrap items-center gap-2">
        <select className="px-2 py-2 rounded-md border border-slate-300 text-sm" value={area} onChange={e => setArea(e.target.value)}>
          <option value="all">Все районы</option>
          {db.settings.areas.map(a => <option key={a}>{a}</option>)}
        </select>
        <select className="px-2 py-2 rounded-md border border-slate-300 text-sm" value={group} onChange={e => setGroup(e.target.value)}>
          <option value="all">Все группы</option>
          {db.settings.groups.map(g => <option key={g}>{g}</option>)}
        </select>
        <div className="text-xs text-slate-500">Сегодня: {fmtDate(today.toISOString())}</div>
      </div>

      <TableWrap>
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left p-2">Ученик</th>
            <th className="text-left p-2">Район</th>
            <th className="text-left p-2">Группа</th>
            <th className="text-left p-2">Отметка</th>
          </tr>
        </thead>
        <tbody>
          {list.map(c => {
            const m = getMark(c.id);
            return (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="p-2">{c.firstName} {c.lastName}</td>
                <td className="p-2">{c.area}</td>
                <td className="p-2">{c.group}</td>
                <td className="p-2">
                  <button onClick={() => toggle(c.id)} className={`px-3 py-1 rounded-md text-xs border ${m?.came ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
                    {m?.came ? "пришёл" : "не отмечен"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    </div>
  );
}

// Вкладка: Расписание (чтение демо)
function ScheduleTab({ db }: { db: DB }) {
  const byArea = useMemo(() => {
    const m: Record<string, ScheduleSlot[]> = {};
    for (const s of db.schedule) {
      m[s.area] ??= []; m[s.area].push(s);
    }
    return m;
  }, [db.schedule]);

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Расписание"]} />
      <div className="grid lg:grid-cols-3 gap-3">
        {Object.entries(byArea).map(([area, list]) => (
          <div key={area} className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
            <div className="font-semibold">{area}</div>
            <ul className="space-y-1 text-sm">
              {list
                .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time))
                .map(s => (
                  <li key={s.id} className="truncate">
                    {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][s.weekday - 1]} {s.time} · {s.group}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// Вкладка: Лиды (простая воронка без drag&drop на каркасе)
function LeadsTab({ db, setDB }: { db: DB; setDB: (db: DB) => void }) {
  const stages: LeadStage[] = ["Очередь", "Задержка", "Пробное", "Ожидание оплаты", "Оплаченный абонемент", "Отмена"];
  const [open, setOpen] = useState<Lead | null>(null);
  const move = (id: string, dir: 1 | -1) => {
    const l = db.leads.find(x => x.id === id); if (!l) return;
    const idx = stages.indexOf(l.stage);
    const nextStage = stages[Math.min(stages.length - 1, Math.max(0, idx + dir))];
    const next = { ...db, leads: db.leads.map(x => x.id === id ? { ...x, stage: nextStage, updatedAt: todayISO() } : x) };
    setDB(next); saveDB(next);
  };
  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Лиды"]} />
      <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stages.map(s => (
          <div key={s} className="p-3 rounded-2xl border border-slate-200 bg-white">
            <div className="text-xs text-slate-500 mb-2">{s}</div>
            <div className="space-y-2">
              {db.leads.filter(l => l.stage === s).map(l => (
                <div key={l.id} className="p-2 rounded-xl border border-slate-200 bg-slate-50">
                  <button onClick={() => setOpen(l)} className="text-sm font-medium text-left hover:underline w-full">{l.name}</button>
                  <div className="text-xs text-slate-500">{l.source}{l.contact ? " · " + l.contact : ""}</div>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => move(l.id, -1)} className="px-2 py-1 text-xs rounded-md border border-slate-300">◀</button>
                    <button onClick={() => move(l.id, +1)} className="px-2 py-1 text-xs rounded-md border border-slate-300">▶</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {open && (
        <LeadModal
          lead={open}
          onClose={() => setOpen(null)}
          staff={db.staff}
          db={db}
          setDB={setDB}
        />
      )}
    </div>
  );
}

function LeadModal(
  {
    lead,
    onClose,
    staff,
    db,
    setDB,
  }: {
    lead: Lead;
    onClose: () => void;
    staff: StaffMember[];
    db: DB;
    setDB: (db: DB) => void;
  },
) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Partial<Lead>>(lead);
  useEffect(() => setForm(lead), [lead]);

  const save = () => {
    const nextLead: Lead = { ...lead, ...form, updatedAt: todayISO() };
    const next = {
      ...db,
      leads: db.leads.map(l => (l.id === lead.id ? nextLead : l)),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Обновлён лид ${nextLead.name}`, when: todayISO() }],
    };
    setDB(next); saveDB(next); setEdit(false); onClose();
  };

  const remove = () => {
    if (!confirm("Удалить лид?")) return;
    const next = {
      ...db,
      leads: db.leads.filter(l => l.id !== lead.id),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Удалён лид ${lead.name}`, when: todayISO() }],
    };
    setDB(next); saveDB(next); onClose();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 space-y-3">
        {edit ? (
          <>
            <div className="font-semibold text-lg">Редактирование лида</div>
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Имя лида</span>
                <input
                  className="px-3 py-2 rounded-md border border-slate-300"
                  value={form.name || ""}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Имя родителя</span>
                <input
                  className="px-3 py-2 rounded-md border border-slate-300"
                  value={form.parentName || ""}
                  onChange={e => setForm({ ...form, parentName: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Имя</span>
                <input
                  className="px-3 py-2 rounded-md border border-slate-300"
                  value={form.firstName || ""}
                  onChange={e => setForm({ ...form, firstName: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Фамилия</span>
                <input
                  className="px-3 py-2 rounded-md border border-slate-300"
                  value={form.lastName || ""}
                  onChange={e => setForm({ ...form, lastName: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Дата рождения</span>
                <input
                  type="date"
                  className="px-3 py-2 rounded-md border border-slate-300"
                  value={form.birthDate ? form.birthDate.slice(0,10) : ""}
                  onChange={e => setForm({ ...form, birthDate: parseDateInput(e.target.value) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Старт</span>
                <input
                  type="date"
                  className="px-3 py-2 rounded-md border border-slate-300"
                  value={form.startDate ? form.startDate.slice(0,10) : ""}
                  onChange={e => setForm({ ...form, startDate: parseDateInput(e.target.value) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Район</span>
                <select
                  className="px-3 py-2 rounded-md border border-slate-300"
                  value={form.area || ""}
                  onChange={e => setForm({ ...form, area: (e.target.value: any) })}
                >
                  <option value="">—</option>
                  {db.settings.areas.map(a => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Группа</span>
                <select
                  className="px-3 py-2 rounded-md border border-slate-300"
                  value={form.group || ""}
                  onChange={e => setForm({ ...form, group: (e.target.value: any) })}
                >
                  <option value="">—</option>
                  {db.settings.groups.map(g => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Контакт</span>
                <input
                  className="px-3 py-2 rounded-md border border-slate-300"
                  value={form.contact || ""}
                  onChange={e => setForm({ ...form, contact: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Источник</span>
                <select
                  className="px-3 py-2 rounded-md border border-slate-300"
                  value={form.source}
                  onChange={e => setForm({ ...form, source: (e.target.value: any) })}
                >
                  <option>Telegram</option>
                  <option>WhatsApp</option>
                  <option>Instagram</option>
                </select>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-slate-500">Заметки</span>
                <textarea
                  className="px-3 py-2 rounded-md border border-slate-300"
                  value={form.notes || ""}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-slate-500">Ответственный</span>
                <select
                  className="px-3 py-2 rounded-md border border-slate-300"
                  value={form.managerId || ""}
                  onChange={e => setForm({ ...form, managerId: e.target.value })}
                >
                  <option value="">—</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEdit(false)} className="px-3 py-2 rounded-md border border-slate-300">Отмена</button>
              <button onClick={save} className="px-3 py-2 rounded-md bg-sky-600 text-white">Сохранить</button>
            </div>
          </>
        ) : (
          <>
            <div className="font-semibold text-lg">{lead.name}</div>
            <div className="text-sm space-y-1">
              {lead.parentName && (
                <div>
                  <span className="text-slate-500">Имя родителя:</span> {lead.parentName}
                </div>
              )}
              {lead.firstName && (
                <div>
                  <span className="text-slate-500">Имя:</span> {lead.firstName}
                </div>
              )}
              {lead.lastName && (
                <div>
                  <span className="text-slate-500">Фамилия:</span> {lead.lastName}
                </div>
              )}
              {lead.birthDate && (
                <div>
                  <span className="text-slate-500">Дата рождения:</span> {fmtDate(lead.birthDate)}
                </div>
              )}
              {lead.birthDate && (
                <div>
                  <span className="text-slate-500">Возраст:</span> {calcAge(lead.birthDate)}
                </div>
              )}
              {lead.startDate && (
                <div>
                  <span className="text-slate-500">Старт:</span> {fmtDate(lead.startDate)}
                </div>
              )}
              {lead.area && (
                <div>
                  <span className="text-slate-500">Район:</span> {lead.area}
                </div>
              )}
              {lead.group && (
                <div>
                  <span className="text-slate-500">Группа:</span> {lead.group}
                </div>
              )}
              <div>
                <span className="text-slate-500">Источник:</span> {lead.source}
              </div>
              {lead.contact && (
                <div>
                  <span className="text-slate-500">Контакт:</span> {lead.contact}
                </div>
              )}
              {lead.notes && (
                <div>
                  <span className="text-slate-500">Заметки:</span> {lead.notes}
                </div>
              )}
              <div>
                <span className="text-slate-500">Ответственный:</span> {staff.find(s => s.id===lead.managerId)?.name || "—"}
              </div>
              <div>
                <span className="text-slate-500">Этап:</span> {lead.stage}
              </div>
              <div>
                <span className="text-slate-500">Создан:</span> {fmtDate(lead.createdAt)}
              </div>
              <div>
                <span className="text-slate-500">Обновлён:</span> {fmtDate(lead.updatedAt)}
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <button
                onClick={remove}
                className="px-3 py-2 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
              >
                Удалить
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setEdit(true)}
                  className="px-3 py-2 rounded-md border border-slate-300"
                >
                  Редактировать
                </button>
                <button
                  onClick={onClose}
                  className="px-3 py-2 rounded-md border border-slate-300"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Вкладка: Задачи (минимум: список, отметка done)
function TasksTab({ db, setDB }: { db: DB; setDB: (db: DB) => void }) {
  const [edit, setEdit] = useState<TaskItem | null>(null);
  const toggle = (id: string) => {
    const next = { ...db, tasks: db.tasks.map(t => t.id === id ? { ...t, status: t.status === "open" ? "done" : "open" } : t) };
    setDB(next); saveDB(next);
  };
  const save = () => {
    if (!edit) return;
    const next = { ...db, tasks: db.tasks.map(t => t.id === edit.id ? edit : t) };
    setDB(next); saveDB(next); setEdit(null);
  };
  const remove = (id: string) => {
    if (!confirm("Удалить задачу?")) return;
    const next = { ...db, tasks: db.tasks.filter(t => t.id !== id) };
    setDB(next); saveDB(next); setEdit(null);
  };
  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Задачи"]} />
      <div className="rounded-2xl border border-slate-200 bg-white divide-y">
        {db.tasks
          .slice()
          .sort((a,b)=> +new Date(a.due) - +new Date(b.due))
          .map(t => (
          <div key={t.id} className="p-3 flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={t.status === "done"} onChange={() => toggle(t.id)} />
              <div>
                <button onClick={() => setEdit({ ...t })} className="font-medium text-left hover:underline">{t.title}</button>
                <div className="text-xs text-slate-500">
                  К сроку: {fmtDate(t.due)}
                  {t.topic ? ` · ${t.topic}` : ""}
                  {t.area ? ` · ${t.area}` : ""}
                  {t.group ? ` · ${t.group}` : ""}
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              {t.assigneeType === "client"
                ? (() => { const c = db.clients.find(c => c.id === t.assigneeId); return c ? `${c.firstName} ${c.lastName ?? ""}`.trim() : "—"; })()
                : db.staff.find(s => s.id === t.assigneeId)?.name || "—"}
            </div>
          </div>
        ))}
      </div>

      {edit && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 space-y-3">
            <div className="font-semibold">Редактировать задачу</div>
            <div className="space-y-2">
              <input className="w-full px-3 py-2 rounded-md border border-slate-300" value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} />
              <input type="date" className="w-full px-3 py-2 rounded-md border border-slate-300" value={edit.due.slice(0,10)} onChange={e => setEdit({ ...edit, due: parseDateInput(e.target.value) })} />
              <select className="w-full px-3 py-2 rounded-md border border-slate-300" value={edit.assigneeId ? `${edit.assigneeType}:${edit.assigneeId}` : ""} onChange={e => {
                const val = e.target.value;
                if (!val) setEdit({ ...edit, assigneeType: undefined, assigneeId: undefined });
                else {
                  const [type, id] = val.split(":");
                  setEdit({
                    ...edit,
                    assigneeType: type === "client" ? "client" : "staff",
                    assigneeId: id,
                  });
                }
              }}>
                <option value="">Ответственный</option>
                <optgroup label="Администраторы">
                  {db.staff.filter(s => s.role === "Администратор").map(s => (
                    <option key={s.id} value={`staff:${s.id}`}>{s.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Клиенты">
                  {db.clients.map(c => (
                    <option key={c.id} value={`client:${c.id}`}>{c.firstName} {c.lastName || ""}</option>
                  ))}
                </optgroup>
              </select>
              <select className="w-full px-3 py-2 rounded-md border border-slate-300" value={edit.topic || ""} onChange={e => setEdit({ ...edit, topic: e.target.value })}>
                <option value="">Тема</option>
                <option value="оплата">Оплата</option>
                <option value="аренда">Аренда</option>
                <option value="день рождения">День рождения</option>
                <option value="другое">Другое</option>
              </select>
              <select className="w-full px-3 py-2 rounded-md border border-slate-300" value={edit.area || ""} onChange={e => setEdit({ ...edit, area: e.target.value })}>
                <option value="">Район</option>
                {db.settings.areas.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <select className="w-full px-3 py-2 rounded-md border border-slate-300" value={edit.group || ""} onChange={e => setEdit({ ...edit, group: e.target.value })}>
                <option value="">Группа</option>
                {db.settings.groups.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-between">
              <button onClick={() => remove(edit.id)} className="px-3 py-2 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50">Удалить</button>
              <div className="flex gap-2">
                <button onClick={() => setEdit(null)} className="px-3 py-2 rounded-md border border-slate-300">Отмена</button>
                <button onClick={save} className="px-3 py-2 rounded-md bg-sky-600 text-white hover:bg-sky-700">Сохранить</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Вкладка: Настройки (минимум: курсы валют, лимиты)
function SettingsTab({ db, setDB }: { db: DB; setDB: (db: DB) => void }) {
  const [rates, setRates] = useState({
    eurTry: db.settings.currencyRates.TRY,
    eurRub: db.settings.currencyRates.RUB,
    tryRub: db.settings.currencyRates.RUB / db.settings.currencyRates.TRY,
  });

  useEffect(() => {
    async function fetchRates() {
      try {
        const fetchRate = async (pair: string) => {
          const res = await fetch(`https://cors.isomorphic-git.org/https://www.google.com/finance/quote/${pair}?hl=en`);
          const html = await res.text();
          const m = html.match(/class="YMlKec fxKbKc">([0-9.,]+)/);
          return m ? Number(m[1].replace(',', '')) : undefined;
        };
        const [eurTry, eurRub, tryRub] = await Promise.all([
          fetchRate('EUR-TRY'),
          fetchRate('EUR-RUB'),
          fetchRate('TRY-RUB'),
        ]);
        const nextRates = {
          eurTry: eurTry ?? rates.eurTry,
          eurRub: eurRub ?? rates.eurRub,
          tryRub: tryRub ?? rates.tryRub,
        };
        setRates(nextRates);
        const nextDB = {
          ...db,
          settings: {
            ...db.settings,
            currencyRates: { EUR: 1, TRY: nextRates.eurTry, RUB: nextRates.eurRub },
          },
        };
        setDB(nextDB);
        saveDB(nextDB);
      } catch (e) {
        console.error(e);
      }
    }
    fetchRates();
  }, []);

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Настройки"]} />
      <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
        <div className="font-semibold">Курсы валют</div>
        <div className="grid sm:grid-cols-3 gap-2">
          <label className="text-sm">EUR → TRY
            <input
              type="number"
              readOnly
              className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 bg-slate-100"
              value={rates.eurTry ? rates.eurTry.toFixed(2) : ""}
            />
          </label>
          <label className="text-sm">EUR → RUB
            <input
              type="number"
              readOnly
              className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 bg-slate-100"
              value={rates.eurRub ? rates.eurRub.toFixed(2) : ""}
            />
          </label>
          <label className="text-sm">TRY → RUB
            <input
              type="number"
              readOnly
              className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 bg-slate-100"
              value={rates.tryRub ? rates.tryRub.toFixed(2) : ""}
            />
          </label>
        </div>
      </div>

      <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
        <div className="font-semibold">Лимиты мест</div>
        <div className="grid md:grid-cols-3 gap-4">
          {["Центр", "Джикджилли", "Махмутлар"].map(area => (
            <div key={area} className="space-y-2">
              <div className="font-medium">{area}</div>
              {db.settings.groups.map(group => {
                const key = `${area}|${group}`;
                return (
                  <div key={key} className="text-sm flex items-center justify-between gap-2 border border-slate-200 rounded-xl p-2">
                    <div className="truncate">{group}</div>
                    <input
                      type="number"
                      min={0}
                      className="w-24 px-2 py-1 rounded-md border border-slate-300"
                      value={db.settings.limits[key]}
                      onChange={e => {
                        const next = { ...db, settings: { ...db.settings, limits: { ...db.settings.limits, [key]: Number(e.target.value) } } };
                        setDB(next); saveDB(next);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Контейнер тостов
function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-3 rounded-xl shadow border text-sm ${t.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : t.type === "error" ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-slate-50 border-slate-200 text-slate-800"}`}>{t.text}</div>
      ))}
    </div>
  );
}

// Быстрое добавление (демо)
function QuickAddModal({ open, onClose, onAddClient, onAddLead, onAddTask }: { open: boolean; onClose: () => void; onAddClient: () => void; onAddLead: () => void; onAddTask: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 space-y-3">
        <div className="font-semibold">Быстро добавить</div>
        <div className="grid gap-2">
          <button onClick={onAddClient} className="px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700">+ Клиента</button>
          <button onClick={onAddLead} className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">+ Лида</button>
          <button onClick={onAddTask} className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">+ Задачу</button>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300">Закрыть</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {

  const [db, setDB] = useState<DB>(() => loadDB());
  const [ui, setUI] = useState<UIState>(() => loadUI());
  const roles: Role[] = ["Администратор", "Менеджер", "Тренер"];
  const { toasts, push } = useToasts();
  const [quickOpen, setQuickOpen] = useState(false);

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

  const canSee = (tab: TabKey) => {
    const r = ui.role;
    if (tab === "dashboard") return true;
    if (tab === "clients") return can(r, "manage_clients");
    if (tab === "attendance") return can(r, "attendance");
    if (tab === "schedule") return can(r, "schedule");
    if (tab === "leads") return can(r, "leads");
    if (tab === "tasks") return can(r, "tasks");
    if (tab === "settings") return can(r, "settings");
    return false;
  };

  const activeTab = canSee(ui.activeTab) ? ui.activeTab : "dashboard";

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-sky-50 text-slate-900">
      <Topbar ui={ui} setUI={setUI} roleList={roles} onQuickAdd={onQuickAdd} />
      <Tabs ui={ui} setUI={setUI} role={ui.role} />

      <main className="max-w-7xl mx-auto p-3 space-y-3">
        {activeTab === "dashboard" && <Dashboard db={db} ui={ui} />}
        {activeTab === "clients" && can(ui.role, "manage_clients") && <ClientsTab db={db} setDB={setDB} ui={ui} />}
        {activeTab === "attendance" && can(ui.role, "attendance") && <AttendanceTab db={db} setDB={setDB} />}
        {activeTab === "schedule" && can(ui.role, "schedule") && <ScheduleTab db={db} />}
        {activeTab === "leads" && can(ui.role, "leads") && <LeadsTab db={db} setDB={setDB} />}
        {activeTab === "tasks" && can(ui.role, "tasks") && <TasksTab db={db} setDB={setDB} />}
        {activeTab === "settings" && can(ui.role, "settings") && <SettingsTab db={db} setDB={setDB} />}
      </main>

      <QuickAddModal open={quickOpen} onClose={() => setQuickOpen(false)} onAddClient={addQuickClient} onAddLead={addQuickLead} onAddTask={addQuickTask} />
      <Toasts toasts={toasts} />

      <footer className="text-xs text-slate-500 text-center py-6">Каркас CRM · Следующие шаги: SW/Manifest/PWA, офлайн-синхронизация, push, CSV/печать</footer>
    </div>
  );
}
