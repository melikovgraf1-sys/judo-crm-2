import { computeAnalyticsSnapshot } from "../analytics";
import type { DB } from "../../types";
import type { PeriodFilter } from "../period";

describe("computeAnalyticsSnapshot with period", () => {
  const buildDB = (): DB => ({
    clients: [
      {
        id: "c1",
        firstName: "Анна",
        lastName: "Иванова",
        phone: "",
        channel: "Telegram",
        birthDate: "2015-01-01T00:00:00.000Z",
        gender: "ж",
        area: "Area1",
        group: "Group1",
        startDate: "2023-12-01T00:00:00.000Z",
        payMethod: "перевод",
        payStatus: "действует",
        status: "действующий",
        payDate: "2024-01-10T00:00:00.000Z",
        payAmount: 60,
        remainingLessons: 0,
      },
      {
        id: "c2",
        firstName: "Борис",
        lastName: "Петров",
        phone: "",
        channel: "Telegram",
        birthDate: "2014-01-01T00:00:00.000Z",
        gender: "м",
        area: "Area1",
        group: "Group1",
        startDate: "2023-10-01T00:00:00.000Z",
        payMethod: "перевод",
        payStatus: "действует",
        status: "действующий",
        payDate: "2023-12-05T00:00:00.000Z",
        payAmount: 70,
        remainingLessons: 0,
      },
    ],
    attendance: [
      { id: "a1", clientId: "c1", date: "2024-01-12T00:00:00.000Z", came: true },
      { id: "a2", clientId: "c2", date: "2023-12-12T00:00:00.000Z", came: true },
    ],
    performance: [],
    schedule: [
      { id: "s1", area: "Area1", group: "Group1", coachId: "coach-1", weekday: 1, time: "10:00", location: "" },
    ],
    leads: [],
    leadsArchive: [],
    leadHistory: [],
    tasks: [],
    tasksArchive: [],
    staff: [],
    settings: {
      areas: ["Area1"],
      groups: ["Group1"],
      limits: { "Area1|Group1": 10 },
      rentByAreaEUR: { Area1: 100 },
      coachSalaryByAreaEUR: { Area1: 50 },
      currencyRates: { EUR: 1, TRY: 1, RUB: 1 },
      coachPayFormula: "",
      analyticsFavorites: [],
    },
    changelog: [],
  });

  it("counts all athletes active within the period", () => {
    const db = buildDB();
    const period: PeriodFilter = { year: 2024, month: 1 };
    const snapshot = computeAnalyticsSnapshot(db, "all", period);

    expect(snapshot.metrics.athletes.values.actual).toBe(2);
    expect(snapshot.metrics.athletes.values.forecast).toBe(2);
    expect(snapshot.metrics.revenue.values.actual).toBe(130);
    expect(snapshot.metrics.revenue.values.forecast).toBe(130);
    expect(snapshot.athleteStats.total).toBe(2);
    expect(snapshot.athleteStats.attendanceRate).toBe(100);
  });

  it("excludes clients whose start date is after the period", () => {
    const db = buildDB();
    db.clients.push({
      id: "c3",
      firstName: "Вика",
      lastName: "Сидорова",
      phone: "",
      channel: "Telegram",
      birthDate: "2016-01-01T00:00:00.000Z",
      gender: "ж",
      area: "Area1",
      group: "Group1",
      startDate: "2024-03-01T00:00:00.000Z",
      payMethod: "перевод",
      payStatus: "действует",
      status: "новый",
      payDate: "2024-03-05T00:00:00.000Z",
      payAmount: 80,
      remainingLessons: 0,
    });

    const period: PeriodFilter = { year: 2024, month: 1 };
    const snapshot = computeAnalyticsSnapshot(db, "all", period);

    expect(snapshot.metrics.athletes.values.forecast).toBe(2);
    expect(snapshot.metrics.athletes.values.actual).toBe(2);
  });
});
