import { computeAnalyticsSnapshot } from "../analytics";
import type { DB } from "../../types";
import type { PeriodFilter } from "../period";

describe("computeAnalyticsSnapshot with period", () => {
  const buildDB = (): DB => ({
    revision: 0,
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
        payActual: 60,
        remainingLessons: 0,
        placements: [
          {
            id: "pl-c1",
            area: "Area1",
            group: "Group1",
            payStatus: "действует",
            status: "действующий",
            payDate: "2024-01-10T00:00:00.000Z",
            payAmount: 60,
            payActual: 60,
            remainingLessons: 0,
          },
        ],
        payHistory: [
          {
            id: "fact-c1-2024-01",
            paidAt: "2024-01-05T00:00:00.000Z",
            amount: 60,
          },
        ],
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
        payActual: 70,
        remainingLessons: 0,
        placements: [
          {
            id: "pl-c2",
            area: "Area1",
            group: "Group1",
            payStatus: "действует",
            status: "действующий",
            payDate: "2023-12-05T00:00:00.000Z",
            payAmount: 70,
            payActual: 70,
            remainingLessons: 0,
          },
        ],
        payHistory: [
          {
            id: "fact-c2-2023-10",
            paidAt: "2023-10-05T00:00:00.000Z",
            amount: 65,
          },
          {
            id: "fact-c2-2023-11",
            paidAt: "2023-11-05T00:00:00.000Z",
            amount: 75,
          },
          {
            id: "fact-c2-2024-01",
            paidAt: "2024-01-05T00:00:00.000Z",
            amount: 70,
          },
        ],
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
    expect(snapshot.athleteStats.payments).toBe(2);
    expect(snapshot.athleteStats.attendanceRate).toBe(100);
  });

  it("prefers payment facts for forecast when they exist in the period", () => {
    const db = buildDB();
    db.clients[1].status = "отмена";
    db.clients[0].payAmount = 55;
    db.clients[0].placements[0].payAmount = 55;
    db.clients[0].payHistory = [
      {
        id: "fact-c1-2024-01",
        area: "Area1",
        group: "Group1",
        paidAt: "2024-01-03T00:00:00.000Z",
        amount: 130,
      },
    ];

    const period: PeriodFilter = { year: 2024, month: 1 };
    const snapshot = computeAnalyticsSnapshot(db, "Area1", period, "Group1");

    expect(snapshot.metrics.revenue.values.forecast).toBe(130);
    expect(snapshot.metrics.revenue.values.remaining).toBe(0);
  });

  it("counts actual revenue even if the pay status is not active", () => {
    const db = buildDB();
    db.clients[1].payStatus = "ожидает оплаты";

    const period: PeriodFilter = { year: 2024, month: 1 };
    const snapshot = computeAnalyticsSnapshot(db, "all", period);

    expect(snapshot.metrics.revenue.values.actual).toBe(130);
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
      payActual: 0,
      remainingLessons: 0,
      placements: [
        {
          id: "pl-c3",
          area: "Area1",
          group: "Group1",
          payStatus: "действует",
          status: "новый",
          payDate: "2024-03-05T00:00:00.000Z",
          payAmount: 80,
          payActual: 0,
          remainingLessons: 0,
        },
      ],
    });

    const period: PeriodFilter = { year: 2024, month: 1 };
    const snapshot = computeAnalyticsSnapshot(db, "all", period);

    expect(snapshot.metrics.athletes.values.forecast).toBe(2);
    expect(snapshot.metrics.athletes.values.actual).toBe(2);
  });

  it("uses maximum values for target projections", () => {
    const db = buildDB();
    const period: PeriodFilter = { year: 2024, month: 1 };
    const snapshot = computeAnalyticsSnapshot(db, "all", period);

    expect(snapshot.metrics.revenue.values.target).toBe(550);
    expect(snapshot.metrics.profit.values.target).toBe(400);
    expect(snapshot.metrics.fill.values.target).toBe(100);
    expect(snapshot.metrics.athletes.values.target).toBe(10);
  });

  it("uses payment history amounts for October period", () => {
    const db = buildDB();
    const period: PeriodFilter = { year: 2023, month: 10 };
    const snapshot = computeAnalyticsSnapshot(db, "all", period);

    expect(snapshot.metrics.revenue.values.actual).toBe(65);
    expect(snapshot.athleteStats.payments).toBe(1);
  });

  it("uses payment history amounts for November period", () => {
    const db = buildDB();
    const period: PeriodFilter = { year: 2023, month: 11 };
    const snapshot = computeAnalyticsSnapshot(db, "all", period);

    expect(snapshot.metrics.revenue.values.actual).toBe(75);
    expect(snapshot.athleteStats.payments).toBe(1);
  });

  it("parses string payment amounts when summing revenue", () => {
    const db = buildDB();
    (db.clients[0].payHistory as any)?.push({
      id: "fact-c1-2024-02-string",
      paidAt: "2024-02-05T00:00:00.000Z",
      amount: "85,50",
    });

    const period: PeriodFilter = { year: 2024, month: 2 };
    const snapshot = computeAnalyticsSnapshot(db, "all", period);

    expect(snapshot.metrics.revenue.values.actual).toBeCloseTo(85.5, 5);
    expect(snapshot.athleteStats.payments).toBe(1);
  });

  it("counts placements that differ from the client's primary group", () => {
    const db = buildDB();
    db.settings.groups.push("Group2");
    db.settings.limits["Area1|Group2"] = 5;

    db.clients.push({
      id: "c3",
      firstName: "Григорий",
      lastName: "Смирнов",
      phone: "",
      channel: "Telegram",
      birthDate: "2013-05-01T00:00:00.000Z",
      gender: "м",
      area: "Area1",
      group: "Group1",
      startDate: "2023-09-01T00:00:00.000Z",
      payMethod: "перевод",
      payStatus: "действует",
      status: "действующий",
      payDate: "2024-01-05T00:00:00.000Z",
      payAmount: 80,
      payActual: 80,
      remainingLessons: 0,
      placements: [
        {
          id: "pl-c3-primary",
          area: "Area1",
          group: "Group1",
          payStatus: "действует",
          status: "действующий",
          payDate: "2023-12-05T00:00:00.000Z",
          payAmount: 80,
          payActual: 80,
          remainingLessons: 0,
        },
        {
          id: "pl-c3-secondary",
          area: "Area1",
          group: "Group2",
          payStatus: "действует",
          status: "действующий",
          payDate: "2024-01-05T00:00:00.000Z",
          payAmount: 80,
          payActual: 80,
          remainingLessons: 0,
        },
      ],
      payHistory: [
        {
          id: "fact-c3-2024-01",
          paidAt: "2024-01-05T00:00:00.000Z",
          amount: 80,
        },
      ],
    });

    const period: PeriodFilter = { year: 2024, month: 1 };
    const snapshot = computeAnalyticsSnapshot(db, "Area1", period, "Group2");

    expect(snapshot.metrics.athletes.values.actual).toBe(1);
    expect(snapshot.metrics.athletes.values.forecast).toBe(1);
    expect(snapshot.metrics.revenue.values.actual).toBe(80);
    expect(snapshot.metrics.revenue.values.forecast).toBe(80);
    expect(snapshot.athleteStats.total).toBe(1);
  });

  it("omits rent, coach salary and profit when filtering by group", () => {
    const db = buildDB();
    const period: PeriodFilter = { year: 2024, month: 1 };
    const snapshot = computeAnalyticsSnapshot(db, "Area1", period, "Group1");

    expect(snapshot.rent).toBe(0);
    expect(snapshot.coachSalary).toBe(0);
    expect(snapshot.metrics.profit.values.actual).toBe(0);
    expect(snapshot.metrics.profit.values.forecast).toBe(0);
    expect(snapshot.metrics.profit.values.target).toBe(0);
  });

  it("uses Джикджилли фокус override for forecast revenue", () => {
    const db = buildDB();
    db.settings.areas = ["джикджилли"];
    db.settings.groups = ["фокус"];
    db.settings.limits = { "джикджилли|фокус": 10 };
    db.settings.rentByAreaEUR = { джикджилли: 0 };
    db.settings.coachSalaryByAreaEUR = { джикджилли: 0 };
    db.schedule = [
      {
        id: "s-focus",
        area: "джикджилли",
        group: "фокус",
        coachId: "coach-1",
        weekday: 1,
        time: "10:00",
        location: "",
      },
    ];
    db.clients = [
      {
        id: "focus-athlete",
        firstName: "Игорь",
        lastName: "Фокусов",
        phone: "",
        channel: "Telegram",
        birthDate: "2014-01-01T00:00:00.000Z",
        gender: "м",
        area: "джикджилли",
        group: "фокус",
        startDate: "2023-09-01T00:00:00.000Z",
        payMethod: "перевод",
        payStatus: "действует",
        status: "действующий",
        payDate: "2024-01-05T00:00:00.000Z",
        payActual: 25,
        remainingLessons: 0,
        placements: [
          {
            id: "pl-focus-athlete",
            area: "джикджилли",
            group: "фокус",
            payStatus: "действует",
            status: "действующий",
            payDate: "2024-01-05T00:00:00.000Z",
            payActual: 25,
            remainingLessons: 0,
          },
        ],
        payHistory: [
          {
            id: "fact-focus-2024-01",
            paidAt: "2024-01-05T00:00:00.000Z",
            amount: 25,
          },
        ],
      },
    ];
    db.attendance = [];

    const period: PeriodFilter = { year: 2024, month: 1 };
    const snapshot = computeAnalyticsSnapshot(db, "джикджилли", period, "фокус");

    expect(snapshot.metrics.revenue.values.actual).toBe(25);
    expect(snapshot.metrics.revenue.values.forecast).toBe(25);
    expect(snapshot.metrics.revenue.values.target).toBe(250);
  });

  it("ignores stored pay amount when override enforces a lower price", () => {
    const db = buildDB();
    db.settings.areas = ["джикджилли"];
    db.settings.groups = ["фокус"];
    db.settings.limits = { "джикджилли|фокус": 10 };
    db.schedule = [
      {
        id: "s-focus",
        area: "джикджилли",
        group: "фокус",
        coachId: "coach-1",
        weekday: 1,
        time: "10:00",
        location: "",
      },
    ];
    db.clients = [
      {
        id: "focus-athlete",
        firstName: "Игорь",
        lastName: "Фокусов",
        phone: "",
        channel: "Telegram",
        birthDate: "2014-01-01T00:00:00.000Z",
        gender: "м",
        area: "джикджилли",
        group: "фокус",
        startDate: "2023-09-01T00:00:00.000Z",
        payMethod: "перевод",
        payStatus: "действует",
        status: "действующий",
        subscriptionPlan: "monthly",
        payDate: "2024-01-05T00:00:00.000Z",
        payAmount: 55,
        payActual: 25,
        remainingLessons: 0,
        placements: [
          {
            id: "pl-focus-athlete",
            area: "джикджилли",
            group: "фокус",
            payStatus: "действует",
            status: "действующий",
            subscriptionPlan: "monthly",
            payDate: "2024-01-05T00:00:00.000Z",
            payAmount: 55,
            payActual: 25,
            remainingLessons: 0,
          },
        ],
        payHistory: [
          {
            id: "fact-focus-2024-01",
            paidAt: "2024-01-05T00:00:00.000Z",
            amount: 25,
          },
        ],
      },
    ];
    db.attendance = [];

    const period: PeriodFilter = { year: 2024, month: 1 };
    const snapshot = computeAnalyticsSnapshot(db, "джикджилли", period, "фокус");

    expect(snapshot.metrics.revenue.values.forecast).toBe(25);
    expect(snapshot.metrics.revenue.values.target).toBe(250);
  });
});
