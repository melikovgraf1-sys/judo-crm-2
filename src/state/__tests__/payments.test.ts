import { applyPaymentStatusRules, derivePaymentStatus } from "../payments";
import type { Client, TaskItem } from "../../types";

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

    const result = derivePaymentStatus(client, [], []);

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

    const result = derivePaymentStatus(client, tasks, []);

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

    const result = derivePaymentStatus(client, [], []);

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

    const result = derivePaymentStatus(client, [], []);

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

    const result = derivePaymentStatus(client, [], []);

    expect(result).toEqual({
      client: "перенос",
      placements: { "placement-1": "перенос" },
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

    const [updated] = applyPaymentStatusRules([baseClient], tasks, []);

    expect(updated.payStatus).toBe("задолженность");
    expect(updated.placements).toEqual([
      { ...baseClient.placements[0], payStatus: "ожидание" },
      { ...baseClient.placements[1], payStatus: "задолженность" },
    ]);
  });
});
