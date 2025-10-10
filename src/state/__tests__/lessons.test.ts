import { getEffectiveRemainingLessons } from "../lessons";
import type { Client, ScheduleSlot } from "../../types";

const baseClient: Client = {
  id: "client-1",
  firstName: "Иван",
  channel: "Telegram",
  birthDate: "2010-01-01",
  gender: "м",
  area: "Area1",
  group: "индивидуальные",
  startDate: "2024-01-01",
  payMethod: "перевод",
  payStatus: "действует",
  status: "действующий",
  subscriptionPlan: "monthly",
  placements: [
    {
      id: "placement-1",
      area: "Area1",
      group: "индивидуальные",
      payStatus: "действует",
      status: "действующий",
      subscriptionPlan: "monthly",
    },
  ],
};

const schedule: ScheduleSlot[] = [
  { id: "slot-1", area: "Area1", group: "индивидуальные", coachId: "coach-1", weekday: 2, time: "10:00", location: "" },
];

test("getEffectiveRemainingLessons returns negative values for manual groups", () => {
  const client: Client = { ...baseClient, remainingLessons: -4 };

  const result = getEffectiveRemainingLessons(client, schedule);

  expect(result).toBe(-4);
});
