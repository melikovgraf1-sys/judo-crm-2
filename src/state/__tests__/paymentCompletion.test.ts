import { resolvePaymentCompletion } from "../paymentCompletion";
import type { Client, TaskItem } from "../../types";

const baseClient: Client = {
  id: "client-1",
  firstName: "Иван",
  channel: "Telegram",
  birthDate: "2015-01-01T00:00:00.000Z",
  gender: "м",
  area: "Основная",
  group: "7-10 лет",
  startDate: "2024-01-01T00:00:00.000Z",
  payMethod: "перевод",
  payStatus: "ожидание",
  status: "действующий",
  subscriptionPlan: "monthly",
  payDate: "2024-10-05T00:00:00.000Z",
  placements: [
    {
      id: "place-1",
      area: "Основная",
      group: "7-10 лет",
      payMethod: "перевод",
      payStatus: "ожидание",
      status: "действующий",
      subscriptionPlan: "monthly",
      payDate: "2024-10-05T00:00:00.000Z",
    },
    {
      id: "place-2",
      area: "Основная",
      group: "Доп. группа",
      payMethod: "перевод",
      payStatus: "ожидание",
      status: "действующий",
      subscriptionPlan: "monthly",
      payDate: "2024-10-07T00:00:00.000Z",
    },
  ],
  payHistory: [],
};

const applyUpdates = (client: Client, updates: Partial<Client>): Client => ({
  ...client,
  ...updates,
  placements: updates.placements ?? client.placements,
  payHistory: updates.payHistory ?? client.payHistory,
});

describe("resolvePaymentCompletion", () => {
  it("does not shift primary placement twice when completing payment for another placement", () => {
    const paymentTask: TaskItem = {
      id: "task-1",
      title: "Оплата",
      due: "2024-10-01T00:00:00.000Z",
      status: "open",
      topic: "оплата",
      assigneeType: "client",
      assigneeId: baseClient.id,
      placementId: "place-1",
    };

    const firstUpdates = resolvePaymentCompletion({
      client: baseClient,
      task: paymentTask,
      schedule: [],
      completedAt: "2024-10-10T00:00:00.000Z",
    });

    const afterFirst = applyUpdates(baseClient, firstUpdates);

    expect(afterFirst.payDate).toBe("2024-11-05T00:00:00.000Z");
    expect(afterFirst.placements[0]?.payDate).toBe("2024-11-05T00:00:00.000Z");

    const secondTask: TaskItem = { ...paymentTask, id: "task-2", placementId: "place-2" };

    const secondUpdates = resolvePaymentCompletion({
      client: afterFirst,
      task: secondTask,
      schedule: [],
      completedAt: "2024-10-12T00:00:00.000Z",
    });

    expect(secondUpdates.payDate).toBeUndefined();

    const afterSecond = applyUpdates(afterFirst, secondUpdates);

    expect(afterSecond.payDate).toBe("2024-11-05T00:00:00.000Z");
    expect(afterSecond.placements[0]?.payDate).toBe("2024-11-05T00:00:00.000Z");
    expect(afterSecond.placements[1]?.payDate).toBe("2024-11-07T00:00:00.000Z");
  });
});
