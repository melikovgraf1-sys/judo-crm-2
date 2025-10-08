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
    const client: Client = { ...baseClient, payStatus: "действует" };

    expect(derivePaymentStatus(client, [], [])).toBe("действует");
  });

  it("returns debt status when there is an open related task", () => {
    const client: Client = { ...baseClient, payStatus: "ожидание" };
    const tasks: TaskItem[] = [{ ...baseTask, status: "open" }];

    expect(derivePaymentStatus(client, tasks, [])).toBe("задолженность");
  });

  it("returns active status when all related tasks are done", () => {
    const client: Client = { ...baseClient, payStatus: "ожидание" };
    const tasks: TaskItem[] = [{ ...baseTask, status: "done" }];

    expect(derivePaymentStatus(client, tasks, [])).toBe("действует");
  });
});
