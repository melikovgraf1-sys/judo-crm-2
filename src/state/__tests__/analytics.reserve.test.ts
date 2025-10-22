import { computeAnalyticsSnapshot } from "../analytics";
import { RESERVE_AREA_NAME } from "../reserve";
import type { DB } from "../../types";

const buildDB = (): DB => ({
  revision: 1,
  clients: [
    {
      id: "main-client",
      firstName: "Main",
      lastName: "Client",
      phone: "",
      channel: "",
      birthDate: "2010-01-01T00:00:00.000Z",
      gender: "м",
      area: "Main Area",
      group: "Group A",
      startDate: "2023-01-01T00:00:00.000Z",
      payMethod: "перевод",
      payStatus: "действует",
      status: "действующий",
      payDate: "2024-01-01T00:00:00.000Z",
      payAmount: 150,
      payActual: 100,
      remainingLessons: 0,
      placements: [
        {
          id: "placement-main",
          area: "Main Area",
          group: "Group A",
          payStatus: "действует",
          status: "действующий",
          payDate: "2024-01-01T00:00:00.000Z",
          payAmount: 150,
          payActual: 100,
          remainingLessons: 0,
        },
      ],
      payHistory: [],
    },
    {
      id: "reserve-client",
      firstName: "Reserve",
      lastName: "Client",
      phone: "",
      channel: "",
      birthDate: "2010-01-01T00:00:00.000Z",
      gender: "ж",
      area: RESERVE_AREA_NAME,
      group: "Reserve Group",
      startDate: "2023-01-01T00:00:00.000Z",
      payMethod: "перевод",
      payStatus: "действует",
      status: "действующий",
      payDate: "2024-01-01T00:00:00.000Z",
      payAmount: 200,
      payActual: 200,
      remainingLessons: 0,
      placements: [
        {
          id: "placement-reserve",
          area: RESERVE_AREA_NAME,
          group: "Reserve Group",
          payStatus: "действует",
          status: "действующий",
          payDate: "2024-01-01T00:00:00.000Z",
          payAmount: 200,
          payActual: 200,
          remainingLessons: 0,
        },
      ],
      payHistory: [],
    },
  ],
  attendance: [],
  performance: [],
  schedule: [
    {
      id: "slot-main",
      area: "Main Area",
      group: "Group A",
      coachId: "coach-1",
      weekday: 1,
      time: "10:00",
      location: "",
    },
  ],
  leads: [],
  leadsArchive: [],
  leadHistory: [],
  tasks: [],
  tasksArchive: [],
  staff: [],
  settings: {
    areas: ["Main Area", RESERVE_AREA_NAME],
    groups: ["Group A", "Reserve Group"],
    limits: { "Main Area|Group A": 10 },
    rentByAreaEUR: { "Main Area": 50, [RESERVE_AREA_NAME]: 10 },
    coachSalaryByAreaEUR: { "Main Area": 30, [RESERVE_AREA_NAME]: 5 },
    currencyRates: { EUR: 1, TRY: 1, RUB: 1 },
    coachPayFormula: "",
    analyticsFavorites: [],
  },
  changelog: [],
});

describe("computeAnalyticsSnapshot reserve handling", () => {
  it("ignores reserve clients in aggregate analytics", () => {
    const db = buildDB();

    const snapshot = computeAnalyticsSnapshot(db, "all");

    expect(snapshot.metrics.revenue.values.actual).toBe(100);
    expect(snapshot.metrics.revenue.values.forecast).toBe(150);
    expect(snapshot.metrics.athletes.values.actual).toBe(1);
    expect(snapshot.metrics.athletes.values.forecast).toBe(1);
    expect(snapshot.capacity).toBe(10);
    expect(snapshot.rent).toBe(50);
    expect(snapshot.coachSalary).toBe(30);
  });

  it("returns zero metrics when the reserve area is selected explicitly", () => {
    const db = buildDB();

    const snapshot = computeAnalyticsSnapshot(db, RESERVE_AREA_NAME);

    expect(snapshot.metrics.revenue.values.actual).toBe(0);
    expect(snapshot.metrics.revenue.values.forecast).toBe(0);
    expect(snapshot.metrics.athletes.values.actual).toBe(0);
    expect(snapshot.metrics.athletes.values.forecast).toBe(0);
    expect(snapshot.capacity).toBe(0);
    expect(snapshot.rent).toBe(0);
    expect(snapshot.coachSalary).toBe(0);
  });
});

