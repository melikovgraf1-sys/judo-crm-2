import { rnd, uid, todayISO } from "./utils";
import type {
  Area,
  Client,
  DB,
  Gender,
  Group,
  Lead,
  ScheduleSlot,
  Settings,
  StaffMember,
  TaskItem,
  AttendanceEntry,
  PerformanceEntry,
} from "../types";

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
      payConfirmed: Math.random() < 0.7,
    } as Client;
  });

  const schedule: ScheduleSlot[] = [];
  const coachAlexey = staff.find(s => s.name === "Алексей")?.id || "";
  schedule.push(
    { id: uid(), area: "Центр", group: "6–9", coachId: coachAlexey, weekday: 2, time: "17:30", location: "" },
    { id: uid(), area: "Центр", group: "4–6", coachId: coachAlexey, weekday: 2, time: "18:30", location: "" },
    { id: uid(), area: "Центр", group: "9–14", coachId: coachAlexey, weekday: 2, time: "19:30", location: "" },
  );

  const leads: Lead[] = [];
  const attendance: AttendanceEntry[] = [];
  const performance: PerformanceEntry[] = [];
  for (const c of clients) {
    const entries = rnd(3, 8);
    for (let i = 0; i < entries; i++) {
      const d = new Date();
      d.setDate(d.getDate() - rnd(1, 25));
      attendance.push({ id: uid(), clientId: c.id, date: d.toISOString(), came: Math.random() < 0.8 });
    }
    const perfEntries = rnd(2, 5);
    for (let i = 0; i < perfEntries; i++) {
      const d = new Date();
      d.setDate(d.getDate() - rnd(1, 30));
      performance.push({ id: uid(), clientId: c.id, date: d.toISOString(), successful: Math.random() < 0.7 });
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
    performance,
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
