import {
  computeAnalyticsSnapshot,
  formatAthleteMetricValue,
  formatLeadMetricValue,
  type AthleteStats,
  type LeadStats,
} from "../analytics";
import type { DB } from "../../types";
import type { PeriodFilter } from "../period";

describe("analytics metric formatting", () => {
  const athleteStats: AthleteStats = {
    total: 10.4,
    payments: 2.6,
    new: 1.2,
    firstRenewals: 0.7,
    canceled: 0.2,
    returned: 1,
    dropIns: 3.9,
    attendanceRate: 87.3,
  };

  const leadStats: LeadStats = {
    created: 12.2,
    converted: 3.5,
    canceled: 0.6,
  };

  it("keeps a single decimal for attendance rate", () => {
    expect(formatAthleteMetricValue("attendanceRate", athleteStats)).toBe("87,3%");
  });

  it("formats other athlete metrics without fractional digits", () => {
    expect(formatAthleteMetricValue("total", athleteStats)).toBe("10");
    expect(formatAthleteMetricValue("payments", athleteStats)).toBe("3");
    expect(formatAthleteMetricValue("new", athleteStats)).toBe("1");
    expect(formatAthleteMetricValue("firstRenewals", athleteStats)).toBe("1");
    expect(formatAthleteMetricValue("canceled", athleteStats)).toBe("0");
    expect(formatAthleteMetricValue("returned", athleteStats)).toBe("1");
    expect(formatAthleteMetricValue("dropIns", athleteStats)).toBe("4");
  });

  it("formats lead metrics without fractional digits", () => {
    expect(formatLeadMetricValue("created", leadStats)).toBe("12");
    expect(formatLeadMetricValue("converted", leadStats)).toBe("4");
    expect(formatLeadMetricValue("canceled", leadStats)).toBe("1");
  });
});

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
        id: "fact-c1-2024-01-other-scope",
        area: "Area2",
        group: "GroupX",
        paidAt: "2024-01-02T00:00:00.000Z",
        amount: 999,
      },
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

  it("ignores ambiguous payment facts without scope metadata when forecasting", () => {
    const db = buildDB();
    db.settings.areas.push("Area2");
    db.settings.groups.push("Group2");
    db.settings.limits = { ...db.settings.limits, "Area2|Group2": 10 };

    db.clients = [db.clients[0]];
    const client = db.clients[0];

    client.placements.push({
      id: "pl-c1-area2",
      area: "Area2",
      group: "Group2",
      payStatus: "действует",
      status: "действующий",
      payDate: "2024-01-10T00:00:00.000Z",
      payAmount: 150,
      payActual: 0,
      remainingLessons: 0,
    });

    client.payHistory = [
      {
        id: "fact-c1-2024-01-ambiguous",
        paidAt: "2024-01-04T00:00:00.000Z",
        amount: 300,
      },
    ];

    const period: PeriodFilter = { year: 2024, month: 1 };
    const snapshot = computeAnalyticsSnapshot(db, "Area1", period, "Group1");

    expect(snapshot.metrics.revenue.values.forecast).toBe(60);
  });

  it("does not forecast revenue for placements due after the period", () => {
    const db = buildDB();
    const client = db.clients[1];
    client.payHistory = [];
    client.payDate = "2023-11-05T00:00:00.000Z";
    client.placements[0].payDate = "2023-11-05T00:00:00.000Z";
    db.clients = [client];

    const period: PeriodFilter = { year: 2023, month: 10 };
    const snapshot = computeAnalyticsSnapshot(db, "Area1", period, "Group1");

    expect(snapshot.metrics.revenue.values.actual).toBe(0);
    expect(snapshot.metrics.revenue.values.forecast).toBe(0);
  });

  it("ignores canceled placements when computing group forecast", () => {
    const db = buildDB();
    const client = db.clients[0];
    client.placements.push({
      id: "pl-c1-canceled",
      area: "Area1",
      group: "Group1",
      payStatus: "архив",
      status: "отмена",
      payDate: "2024-01-10T00:00:00.000Z",
      payAmount: 150,
      payActual: 0,
      remainingLessons: 0,
    });
    db.clients[1].status = "отмена";
    db.clients[1].placements[0].status = "отмена";

    const period: PeriodFilter = { year: 2024, month: 1 };
    const snapshot = computeAnalyticsSnapshot(db, "Area1", period, "Group1");

    expect(snapshot.metrics.revenue.values.forecast).toBe(60);
    expect(snapshot.metrics.athletes.values.forecast).toBe(1);
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

  it("sums multiple Джикджилли placements for area forecasts", () => {
    const db = buildDB();
    db.settings.areas.push("Джикджилли");
    db.settings.groups.push("Джикджилли-утро", "Джикджилли-вечер");
    db.settings.limits = {
      ...db.settings.limits,
      "Джикджилли|Джикджилли-утро": 10,
      "Джикджилли|Джикджилли-вечер": 10,
    };
    db.settings.rentByAreaEUR = {
      ...db.settings.rentByAreaEUR,
      Джикджилли: 0,
    };
    db.settings.coachSalaryByAreaEUR = {
      ...db.settings.coachSalaryByAreaEUR,
      Джикджилли: 0,
    };
    db.schedule.push(
      {
        id: "sched-dzh-1",
        area: "Джикджилли",
        group: "Джикджилли-утро",
        coachId: "coach-2",
        weekday: 2,
        time: "09:00",
        location: "",
      },
      {
        id: "sched-dzh-2",
        area: "Джикджилли",
        group: "Джикджилли-вечер",
        coachId: "coach-3",
        weekday: 4,
        time: "18:00",
        location: "",
      },
    );
    db.clients.push({
      id: "client-dzh",
      firstName: "Данил",
      lastName: "Смирнов",
      phone: "",
      channel: "Telegram",
      birthDate: "2013-05-01T00:00:00.000Z",
      gender: "м",
      area: "Джикджилли",
      group: "Джикджилли-утро",
      startDate: "2023-11-01T00:00:00.000Z",
      payMethod: "перевод",
      payStatus: "действует",
      status: "действующий",
      payDate: "2024-01-10T00:00:00.000Z",
      payActual: 0,
      remainingLessons: 0,
      placements: [
        {
          id: "pl-dzh-1",
          area: "Джикджилли",
          group: "Джикджилли-утро",
          payStatus: "действует",
          status: "действующий",
          payDate: "2024-01-10T00:00:00.000Z",
          payAmount: 80,
          payActual: 0,
          remainingLessons: 0,
        },
        {
          id: "pl-dzh-2",
          area: "Джикджилли",
          group: "Джикджилли-вечер",
          payStatus: "действует",
          status: "действующий",
          payDate: "2024-01-10T00:00:00.000Z",
          payAmount: 90,
          payActual: 0,
          remainingLessons: 0,
        },
      ],
      payHistory: [],
    });

    const period: PeriodFilter = { year: 2024, month: 1 };
    const areaSnapshot = computeAnalyticsSnapshot(db, "Джикджилли", period);
    const morningSnapshot = computeAnalyticsSnapshot(db, "Джикджилли", period, "Джикджилли-утро");
    const eveningSnapshot = computeAnalyticsSnapshot(db, "Джикджилли", period, "Джикджилли-вечер");

    expect(areaSnapshot.metrics.revenue.values.forecast).toBe(
      morningSnapshot.metrics.revenue.values.forecast +
        eveningSnapshot.metrics.revenue.values.forecast,
    );
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
          group: "Group2",
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

  describe("half-month plan forecasting", () => {
    const period: PeriodFilter = { year: 2023, month: 10 };

    const buildHalfMonthDB = (paymentDates: string[] = []): DB => ({
      revision: 0,
      clients: [
        {
          id: "half-1",
          firstName: "Полина",
          lastName: "Лунина",
          phone: "",
          channel: "Telegram",
          birthDate: "2015-03-10T00:00:00.000Z",
          gender: "ж",
          area: "Area1",
          group: "Group1",
          startDate: "2023-08-01T00:00:00.000Z",
          payMethod: "перевод",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "half-month",
          payDate: "2023-10-01T00:00:00.000Z",
          payAmount: 27.5,
          payActual: 0,
          remainingLessons: 0,
          placements: [
            {
              id: "pl-half-1",
              area: "Area1",
              group: "Group1",
              payStatus: "действует",
              status: "действующий",
              subscriptionPlan: "half-month",
              payDate: "2023-10-01T00:00:00.000Z",
              payAmount: 27.5,
              payActual: 0,
              remainingLessons: 0,
            },
          ],
          payHistory: paymentDates.map((paidAt, index) => ({
            id: `fact-half-${index}`,
            paidAt,
            amount: 27.5,
            subscriptionPlan: "half-month",
          })),
        },
      ],
      attendance: [],
      performance: [],
      schedule: [],
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
        rentByAreaEUR: { Area1: 0 },
        coachSalaryByAreaEUR: { Area1: 0 },
        currencyRates: { EUR: 1, TRY: 1, RUB: 1 },
        coachPayFormula: "",
        analyticsFavorites: [],
      },
      changelog: [],
    });

    it("forecasts a full month with no October payments", () => {
      const db = buildHalfMonthDB();

      const snapshot = computeAnalyticsSnapshot(db, "Area1", period, "Group1");

      expect(snapshot.metrics.revenue.values.actual).toBe(0);
      expect(snapshot.metrics.revenue.values.forecast).toBe(55);
      expect(snapshot.metrics.revenue.values.remaining).toBe(55);
    });

    it("keeps forecast monthly when a single October fact exists", () => {
      const db = buildHalfMonthDB(["2023-10-05T00:00:00.000Z"]);

      const snapshot = computeAnalyticsSnapshot(db, "Area1", period, "Group1");

      expect(snapshot.metrics.revenue.values.actual).toBe(27.5);
      expect(snapshot.metrics.revenue.values.forecast).toBe(55);
      expect(snapshot.metrics.revenue.values.remaining).toBe(27.5);
    });

    it("tracks full payment when two October facts exist", () => {
      const db = buildHalfMonthDB([
        "2023-10-05T00:00:00.000Z",
        "2023-10-20T00:00:00.000Z",
      ]);

      const snapshot = computeAnalyticsSnapshot(db, "Area1", period, "Group1");

      expect(snapshot.metrics.revenue.values.actual).toBe(55);
      expect(snapshot.metrics.revenue.values.forecast).toBe(55);
      expect(snapshot.metrics.revenue.values.remaining).toBe(0);
    });
  });
});
