import { derivePaymentStatus } from "../payments";
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
    placements: [],
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

  it("returns the current client pay status when there are no related tasks", () => {
    const client: Client = { ...baseClient, payStatus: "действует", payActual: 55 };

    expect(derivePaymentStatus(client, [], [])).toBe("действует");
  });

  it("returns debt status when there is an open related task", () => {
    const client: Client = { ...baseClient, payStatus: "ожидание", payActual: 55 };
    const tasks: TaskItem[] = [{ ...baseTask, status: "open" }];

    expect(derivePaymentStatus(client, tasks, [])).toBe("задолженность");
  });

  it("returns active status when all related tasks are done", () => {
    const client: Client = { ...baseClient, payStatus: "ожидание", payActual: 55 };
    const tasks: TaskItem[] = [{ ...baseTask, status: "done" }];

    expect(derivePaymentStatus(client, tasks, [])).toBe("действует");
  });

  it("marks active clients with insufficient payments as debt", () => {
    const client: Client = {
      ...baseClient,
      payStatus: "действует",
      payActual: 20,
    };

    expect(derivePaymentStatus(client, [], [])).toBe("задолженность");
  });

  it("skips debt check when the next pay date is in the future and there are no open payment tasks", () => {
    const client: Client = {
      ...baseClient,
      payStatus: "действует",
      payActual: 0,
      payDate: "2099-01-01T00:00:00.000Z",
    };

    expect(derivePaymentStatus(client, [], [])).toBe("действует");
  });

  it("still marks debt when future-due payments have open tasks", () => {
    const client: Client = {
      ...baseClient,
      payStatus: "действует",
      payActual: 0,
      payDate: "2099-01-01T00:00:00.000Z",
    };

    const tasks: TaskItem[] = [{ ...baseTask, status: "open" }];

    expect(derivePaymentStatus(client, tasks, [])).toBe("задолженность");
  });

  it("keeps active status when future due date is derived from payment facts", () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-03-01T00:00:00.000Z"));

    const client: Client = {
      ...baseClient,
      payStatus: "действует",
      payActual: 0,
      payHistory: [
        {
          id: "fact-future",
          paidAt: "2099-01-10T00:00:00.000Z",
          subscriptionPlan: "monthly",
        },
      ],
      placements: [
        {
          id: "placement-1",
          area: baseClient.area,
          group: baseClient.group,
          payMethod: "наличные",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
        },
      ],
    };

    expect(derivePaymentStatus(client, [], [])).toBe("действует");

    jest.useRealTimers();
  });
});
