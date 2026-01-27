import { applyPaymentStatusRules, derivePaymentStatus } from "../payments";
import type { Client, ScheduleSlot, TaskItem } from "../../types";

const schedule: ScheduleSlot[] = [
  {
    id: "slot-1",
    area: "area-1",
    group: "group-1",
    weekday: 1,
    time: "18:00",
    coachId: "coach-1",
    location: "hall",
  },
  {
    id: "slot-2",
    area: "area-2",
    group: "group-2",
    weekday: 3,
    time: "19:00",
    coachId: "coach-2",
    location: "hall",
  },
];

describe("derivePaymentStatus", () => {
  const baseClient: Client = {
    id: "client-1",
    firstName: "Ivan",
    channel: "Telegram",
    birthDate: "2020-01-01",
    gender: "м",
    area: "area-1",
    group: "group-1",
    startDate: "2020-01-01",
    payMethod: "наличные",
    payStatus: "ожидание",
    status: "новый",
    subscriptionPlan: "monthly",
    placements: [
      {
        id: "placement-1",
        area: "area-1",
        group: "group-1",
        payMethod: "наличные",
        payStatus: "ожидание",
        status: "действующий",
        subscriptionPlan: "monthly",
      },
    ],
  };

  const baseTask: TaskItem = {
    id: "task-1",
    title: "Оплата",
    due: "2024-01-01",
    assigneeType: "client",
    assigneeId: baseClient.id,
    status: "open",
    topic: "оплата",
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2024-03-15T00:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns 'ожидание' when a placement has no payment tasks", () => {
    const client: Client = {
      ...baseClient,
      placements: baseClient.placements,
    };

    const result = derivePaymentStatus(client, [], [], schedule);

    expect(result).toEqual({
      client: "ожидание",
      placements: { "placement-1": "ожидание" },
    });
  });

  it("flags debt only for placements with open payment tasks", () => {
    const client: Client = {
      ...baseClient,
      placements: [
        ...baseClient.placements,
        {
          id: "placement-2",
          area: "area-2",
          group: "group-2",
          payMethod: "наличные",
          payStatus: "ожидание",
          status: "действующий",
          subscriptionPlan: "monthly",
        },
      ],
    };

    const tasks: TaskItem[] = [
      { ...baseTask, id: "task-2", placementId: "placement-2", status: "open" },
    ];

    const result = derivePaymentStatus(client, tasks, [], schedule);

    expect(result.placements).toEqual({
      "placement-1": "ожидание",
      "placement-2": "задолженность",
    });
    expect(result.client).toBe("задолженность");
  });

  it("switches to 'действует' when a payment fact exists for the current period", () => {
    const client: Client = {
      ...baseClient,
      payHistory: [
        {
          id: "fact-1",
          paidAt: "2024-03-05T10:00:00.000Z",
          area: "area-1",
          group: "group-1",
        },
      ],
    };

    const result = derivePaymentStatus(client, [], [], schedule);

    expect(result).toEqual({
      client: "действует",
      placements: { "placement-1": "действует" },
    });
  });

  it("keeps unaffected placements in 'ожидание' when another placement has a fact", () => {
    const client: Client = {
      ...baseClient,
      placements: [
        ...baseClient.placements,
        {
          id: "placement-2",
          area: "area-2",
          group: "group-2",
          payMethod: "наличные",
          payStatus: "ожидание",
          status: "действующий",
          subscriptionPlan: "monthly",
        },
      ],
      payHistory: [
        {
          id: "fact-1",
          paidAt: "2024-03-05T10:00:00.000Z",
          area: "area-2",
          group: "group-2",
        },
      ],
    };

    const result = derivePaymentStatus(client, [], [], schedule);

    expect(result.placements).toEqual({
      "placement-1": "ожидание",
      "placement-2": "действует",
    });
    expect(result.client).toBe("действует");
  });

  it("marks placements with future payment facts as 'перенос'", () => {
    const client: Client = {
      ...baseClient,
      payHistory: [
        {
          id: "fact-future",
          paidAt: "2024-04-05T10:00:00.000Z",
          area: "area-1",
          group: "group-1",
        },
      ],
    };

    const result = derivePaymentStatus(client, [], [], schedule);

    expect(result).toEqual({
      client: "перенос",
      placements: { "placement-1": "перенос" },
    });
  });

  it("drops 'перенос' once frozen lessons are consumed", () => {
    const client: Client = {
      ...baseClient,
      payHistory: [
        {
          id: "fact-freeze",
          paidAt: "2024-02-15T10:00:00.000Z",
          area: "area-1",
          group: "group-1",
          subscriptionPlan: "monthly",
          frozenLessons: 3,
        },
      ],
    };

    jest.setSystemTime(new Date("2024-03-20T00:00:00.000Z"));
    const midResult = derivePaymentStatus(client, [], [], schedule);
    expect(midResult).toEqual({
      client: "перенос",
      placements: { "placement-1": "перенос" },
    });

    jest.setSystemTime(new Date("2024-04-10T00:00:00.000Z"));
    const laterResult = derivePaymentStatus(client, [], [], schedule);
    expect(laterResult).toEqual({
      client: "ожидание",
      placements: { "placement-1": "ожидание" },
    });
  });
});

describe("applyPaymentStatusRules", () => {
  const baseClient: Client = {
    id: "client-1",
    firstName: "Ivan",
    channel: "Telegram",
    birthDate: "2020-01-01",
    gender: "м",
    area: "area-1",
    group: "group-1",
    startDate: "2020-01-01",
    payMethod: "наличные",
    payStatus: "действует",
    status: "новый",
    subscriptionPlan: "monthly",
    placements: [
      {
        id: "placement-1",
        area: "area-1",
        group: "group-1",
        payMethod: "наличные",
        payStatus: "действует",
        status: "действующий",
        subscriptionPlan: "monthly",
      },
      {
        id: "placement-2",
        area: "area-2",
        group: "group-2",
        payMethod: "наличные",
        payStatus: "действует",
        status: "действующий",
        subscriptionPlan: "monthly",
      },
    ],
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2024-03-15T00:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("updates individual placements and the client status", () => {
    const tasks: TaskItem[] = [
      {
        id: "task-1",
        title: "Оплата",
        due: "2024-03-20",
        assigneeType: "client",
        assigneeId: baseClient.id,
        status: "open",
        topic: "оплата",
        placementId: "placement-2",
      },
    ];

    const [updated] = applyPaymentStatusRules([baseClient], tasks, [], {}, schedule);

    expect(updated.payStatus).toBe("задолженность");
    expect(updated.placements).toEqual([
      { ...baseClient.placements[0], payStatus: "ожидание" },
      { ...baseClient.placements[1], payStatus: "задолженность" },
    ]);
  });

  it("respects frozen lessons when recomputing statuses", () => {
    const client: Client = {
      ...baseClient,
      payStatus: "ожидание",
      placements: baseClient.placements.map(placement => ({ ...placement, payStatus: "ожидание" })),
      payHistory: [
        {
          id: "fact-freeze",
          paidAt: "2024-02-15T10:00:00.000Z",
          area: "area-1",
          group: "group-1",
          subscriptionPlan: "monthly",
          frozenLessons: 3,
        },
      ],
    };

    const [initial] = applyPaymentStatusRules([client], [], [], {}, schedule);
    expect(initial.payStatus).toBe("перенос");
    expect(initial.placements?.[0].payStatus).toBe("перенос");

    jest.setSystemTime(new Date("2024-04-10T00:00:00.000Z"));
    const [after] = applyPaymentStatusRules([client], [], [], {}, schedule);
    expect(after.payStatus).toBe("ожидание");
    expect(after.placements?.[0].payStatus).toBe("ожидание");
  });
});
