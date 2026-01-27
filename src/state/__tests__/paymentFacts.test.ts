import { getPaymentFactDueDate } from "../paymentFacts";
import type { PaymentFact, ScheduleSlot } from "../../types";

describe("getPaymentFactDueDate", () => {
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
  ];

  it("pushes the due date forward by the number of frozen lessons", () => {
    const fact: PaymentFact = {
      id: "fact-1",
      paidAt: "2024-03-01T10:00:00.000Z",
      area: "area-1",
      group: "group-1",
      subscriptionPlan: "monthly",
      frozenLessons: 2,
    };

    const due = getPaymentFactDueDate(fact, {
      schedule,
      placement: { area: "area-1", group: "group-1" },
    });

    expect(due).toBe("2024-04-15T00:00:00.000Z");
  });

  it("falls back to the base due date when no schedule is provided", () => {
    const fact: PaymentFact = {
      id: "fact-2",
      paidAt: "2024-03-01T10:00:00.000Z",
      area: "area-1",
      group: "group-1",
      subscriptionPlan: "monthly",
      frozenLessons: 2,
    };

    const due = getPaymentFactDueDate(fact);

    expect(due).toBe("2024-04-01T00:00:00.000Z");
  });
});
