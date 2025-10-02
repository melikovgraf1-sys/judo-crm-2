import type { Area, Client, Group, ScheduleSlot } from "../types";
import {
  isAdultGroup,
  isIndividualGroup,
  subscriptionPlanRequiresManualRemainingLessons,
} from "./payments";

const MS_IN_DAY = 24 * 60 * 60 * 1000;

export function requiresManualRemainingLessons(group: string): boolean {
  return isIndividualGroup(group) || isAdultGroup(group);
}

export function clientRequiresManualRemainingLessons(
  client: Pick<Client, "group" | "subscriptionPlan">,
): boolean {
  if (requiresManualRemainingLessons(client.group)) {
    return true;
  }
  return subscriptionPlanRequiresManualRemainingLessons(client.subscriptionPlan);
}

const isoWeekday = (date: Date): number => {
  const day = date.getDay();
  return day === 0 ? 7 : day;
};

export function estimateGroupRemainingLessons(
  client: Pick<Client, "area" | "group" | "payDate">,
  schedule: ScheduleSlot[],
  today: Date = new Date(),
): number | null {
  return estimateGroupRemainingLessonsByParams(client.area, client.group, client.payDate, schedule, today);
}

export function estimateGroupRemainingLessonsByParams(
  area: Area,
  group: Group,
  payDate: string | undefined,
  schedule: ScheduleSlot[],
  today: Date = new Date(),
): number | null {
  if (!payDate) return null;

  const until = new Date(payDate);
  if (Number.isNaN(until.getTime())) return null;

  const from = new Date(today);
  from.setHours(0, 0, 0, 0);
  until.setHours(23, 59, 59, 999);

  if (until < from) {
    return 0;
  }

  const relevant = schedule.filter(slot => slot.area === area && slot.group === group);
  if (!relevant.length) return null;

  const sessionsPerWeekday = new Map<number, number>();
  for (const slot of relevant) {
    sessionsPerWeekday.set(slot.weekday, (sessionsPerWeekday.get(slot.weekday) ?? 0) + 1);
  }

  let total = 0;
  for (let cursor = new Date(from); cursor <= until; cursor = new Date(cursor.getTime() + MS_IN_DAY)) {
    const weekday = isoWeekday(cursor);
    const sessions = sessionsPerWeekday.get(weekday);
    if (sessions) {
      total += sessions;
    }
  }

  return total;
}

export function getEffectiveRemainingLessons(
  client: Client,
  schedule: ScheduleSlot[],
  today: Date = new Date(),
): number | null {
  if (clientRequiresManualRemainingLessons(client)) {
    if (typeof client.remainingLessons === "number") {
      return client.remainingLessons < 0 ? 0 : client.remainingLessons;
    }
    return null;
  }

  return estimateGroupRemainingLessons(client, schedule, today);
}

export function buildGroupsByArea(schedule: ScheduleSlot[]): Map<Area, Group[]> {
  const map = new Map<Area, Group[]>();

  for (const slot of schedule) {
    const groups = map.get(slot.area);
    if (groups) {
      if (!groups.includes(slot.group)) {
        groups.push(slot.group);
      }
    } else {
      map.set(slot.area, [slot.group]);
    }
  }

  for (const [, groups] of map) {
    groups.sort();
  }

  return map;
}
