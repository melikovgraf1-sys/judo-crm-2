export type Role = "Администратор" | "Менеджер" | "Тренер";

export type Area = string;

export type Group = string;

export type Gender = "м" | "ж";

export type ContactChannel = "Telegram" | "WhatsApp" | "Instagram";

export type PaymentMethod = "наличные" | "перевод";

export type PaymentStatus = "ожидание" | "действует" | "задолженность";

export type ClientStatus = "действующий" | "отмена" | "новый" | "вернувшийся" | "продлившийся";

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
  status: ClientStatus;
  payDate?: string; // ISO
  payAmount?: number;
  remainingLessons?: number;
  // Автополя (рассчитываются на лету)
}

export interface ClientFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  channel: ContactChannel;
  birthDate: string;
  parentName: string;
  gender: Gender;
  area: Area;
  group: Group;
  startDate: string;
  payMethod: PaymentMethod;
  payStatus: PaymentStatus;
  status: ClientStatus;
  payDate: string;
  payAmount: string;
  remainingLessons: string;
}

export interface AttendanceEntry {
  id: string;
  clientId: string;
  date: string; // ISO
  came: boolean;
  sourceArea?: Area; // для отработок
}

export interface PerformanceEntry {
  id: string;
  clientId: string;
  date: string; // ISO
  successful: boolean;
  note?: string;
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

export interface LeadFormValues {
  name: string;
  parentName: string;
  contact: string;
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
  coachSalaryByAreaEUR: Partial<Record<Area, number>>; // выплаты тренерам в евро
  currencyRates: { EUR: number; TRY: number; RUB: number }; // к базовой валюте EUR (1.0)
  coachPayFormula: string; // просто строка, которая описывает формулу (демо)
  analyticsFavorites: string[];
}

export interface DB {
  clients: Client[];
  attendance: AttendanceEntry[];
  performance: PerformanceEntry[];
  schedule: ScheduleSlot[];
  leads: Lead[];
  tasks: TaskItem[];
  tasksArchive: TaskItem[];
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
  | "analytics"
  | "groups"
  | "clients"
  | "attendance"
  | "performance"
  | "tasks"
  | "schedule"
  | "leads"
  | "appeals"
  | "settings";

export type Toast = {
  id: string;
  text: string;
  type?: "success" | "error" | "info" | "warning";
};

