export type Role = "Администратор" | "Менеджер" | "Тренер";

export type Area = string;

export type Group = string;

export type Gender = "м" | "ж";

export type ContactChannel = "Telegram" | "WhatsApp" | "Instagram";

export type PaymentMethod = "наличные" | "перевод";

export type PaymentStatus = "ожидание" | "действует" | "задолженность";

export type SubscriptionPlan = "monthly" | "weekly" | "half-month" | "discount" | "single";

export type ClientStatus = "действующий" | "отмена" | "новый" | "вернувшийся" | "продлившийся";

export interface ClientPlacement {
  id: string;
  area: Area;
  group: Group;
  payStatus: PaymentStatus;
  status: ClientStatus;
  subscriptionPlan?: SubscriptionPlan;
  payDate?: string; // ISO
  payAmount?: number;
  payActual?: number;
  remainingLessons?: number;
  frozenLessons?: number;
}

export type LeadStage = "Очередь" | "Задержка" | "Пробное" | "Ожидание оплаты";

export type Currency = "EUR" | "TRY" | "RUB";

export interface AuthUser {
  id: string;
  login: string;
  password: string;
  name: string;
  role: Role;
}

export interface AuthState {
  users: AuthUser[];
  currentUserId: string | null;
}

export interface Client {
  id: string;
  firstName: string;
  lastName?: string;
  parentName?: string;
  phone?: string;
  whatsApp?: string;
  telegram?: string;
  instagram?: string;
  comment?: string;
  channel: ContactChannel;
  birthDate: string; // ISO
  gender: Gender;
  area: Area;
  group: Group;
  coachId?: string;
  startDate: string; // ISO
  payMethod: PaymentMethod;
  payStatus: PaymentStatus;
  status: ClientStatus;
  statusUpdatedAt?: string; // ISO
  subscriptionPlan?: SubscriptionPlan;
  payDate?: string; // ISO
  payAmount?: number;
  payActual?: number;
  remainingLessons?: number;
  frozenLessons?: number;
  placements: ClientPlacement[];
  payHistory?: string[];
  // Автополя (рассчитываются на лету)
}

export interface ClientFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  whatsApp: string;
  telegram: string;
  instagram: string;
  comment: string;
  channel: ContactChannel;
  birthDate: string;
  parentName: string;
  gender: Gender;
  startDate: string;
  payMethod: PaymentMethod;
  placements: ClientPlacementFormValues[];
}

export interface ClientPlacementFormValues {
  id: string;
  area: Area;
  group: Group;
  payStatus: PaymentStatus;
  status: ClientStatus;
  subscriptionPlan: SubscriptionPlan;
  payDate: string;
  payAmount: string;
  payActual: string;
  remainingLessons: string;
}

export type AttendanceStatus = "came" | "absent" | "frozen";

export interface AttendanceEntry {
  id: string;
  clientId: string;
  date: string; // ISO
  came: boolean;
  status?: AttendanceStatus;
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
  phone?: string;
  whatsApp?: string;
  telegram?: string;
  instagram?: string;
  source: ContactChannel;
  stage: LeadStage;
  subscriptionPlan?: SubscriptionPlan;
  notes?: string;
  managerId?: string;
  createdAt: string;
  updatedAt: string;
}

export type LeadLifecycleOutcome = "converted" | "canceled";

export interface LeadLifecycleEvent {
  id: string;
  leadId: string;
  name: string;
  source?: ContactChannel;
  area?: Area;
  group?: Group;
  createdAt: string;
  resolvedAt: string;
  outcome: LeadLifecycleOutcome;
}

export interface LeadFormValues {
  name: string;
  firstName: string;
  lastName: string;
  parentName: string;
  phone: string;
  whatsApp: string;
  telegram: string;
  instagram: string;
  source: ContactChannel;
  area: Area;
  group: Group;
  stage: LeadStage;
  subscriptionPlan: SubscriptionPlan;
  birthDate: string;
  startDate: string;
  notes: string;
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
  placementId?: string;
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
  revision: number;
  clients: Client[];
  attendance: AttendanceEntry[];
  performance: PerformanceEntry[];
  schedule: ScheduleSlot[];
  leads: Lead[];
  leadsArchive: Lead[];
  leadHistory: LeadLifecycleEvent[];
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
  pendingClientId: string | null;
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

