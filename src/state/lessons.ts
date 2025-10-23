import type { Area, Client, Group, ScheduleSlot } from "../types";
import { getLatestFactPaidAt } from "./paymentFacts";
import {
  isAdultGroup,
  isIndividualGroup,
  subscriptionPlanRequiresManualRemainingLessons,
} from "./payments";

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const MAX_LOOKAHEAD_DAYS = 366 * 2;

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
  client: Pick<Client, "area" | "group" | "payDate" | "payHistory">,
  schedule: ScheduleSlot[],
  today: Date = new Date(),
): number | null {
  const referencePayDate =
    getLatestFactPaidAt(client.payHistory ?? [], { area: client.area, group: client.group }) ??
    client.payDate;

  return estimateGroupRemainingLessonsByParams(
    client.area,
    client.group,
    referencePayDate,
    schedule,
    today,
  );
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
  const exclusiveUntil = new Date(until.getTime());
  exclusiveUntil.setDate(exclusiveUntil.getDate() - 1);
  exclusiveUntil.setHours(23, 59, 59, 999);

  if (exclusiveUntil < from) {
    return 0;
  }

  const relevant = schedule.filter(slot => slot.area === area && slot.group === group);
  if (!relevant.length) return null;

  const sessionsPerWeekday = new Map<number, number>();
  for (const slot of relevant) {
    sessionsPerWeekday.set(slot.weekday, (sessionsPerWeekday.get(slot.weekday) ?? 0) + 1);
  }

  let total = 0;
  for (
    let cursor = new Date(from);
    cursor <= exclusiveUntil;
    cursor = new Date(cursor.getTime() + MS_IN_DAY)
  ) {
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
      return client.remainingLessons;
    }
    return null;
  }

  return estimateGroupRemainingLessons(client, schedule, today);
}

const buildSessionsPerWeekday = (schedule: ScheduleSlot[], area: Area, group: Group) => {
  const relevant = schedule.filter(slot => slot.area === area && slot.group === group);
  if (!relevant.length) {
    return null;
  }

  const sessionsPerWeekday = new Map<number, number>();
  for (const slot of relevant) {
    sessionsPerWeekday.set(slot.weekday, (sessionsPerWeekday.get(slot.weekday) ?? 0) + 1);
  }

  return sessionsPerWeekday;
};

function findNthSessionDate(
  sessionsPerWeekday: Map<number, number>,
  start: Date,
  occurrence: number,
): Date | null {
  if (!occurrence || occurrence < 1) {
    return null;
  }

  let count = 0;
  let cursor = new Date(start.getTime());
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i += 1) {
    const weekday = isoWeekday(cursor);
    const sessions = sessionsPerWeekday.get(weekday) ?? 0;
    if (sessions > 0) {
      for (let k = 0; k < sessions; k += 1) {
        count += 1;
        if (count === occurrence) {
          return cursor;
        }
      }
    }
    cursor = new Date(cursor.getTime() + MS_IN_DAY);
  }

  return null;
}

export function calculateManualPayDate(
  area: Area,
  group: Group,
  remainingLessons: number,
  schedule: ScheduleSlot[],
  referenceDate: Date = new Date(),
): Date | null {
  const sessionsPerWeekday = buildSessionsPerWeekday(schedule, area, group);
  if (!sessionsPerWeekday) {
    return null;
  }

  const normalizedRemaining = Math.max(0, Math.floor(remainingLessons));
  const occurrencesToFind = normalizedRemaining + 1;

  const start = new Date(referenceDate.getTime());
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + 1);

  return findNthSessionDate(sessionsPerWeekday, start, occurrencesToFind);
}

type EarliestSlot = { time: string; weekday: number };

export function buildGroupsByArea(schedule: ScheduleSlot[]): Map<Area, Group[]> {
  const map = new Map<Area, Group[]>();
  const earliestByArea = new Map<Area, EarliestSlot>();
  const earliestByAreaGroup = new Map<Area, Map<Group, EarliestSlot>>();

  for (const slot of schedule) {
    const candidate: EarliestSlot = { time: slot.time, weekday: slot.weekday };
    const current = earliestByArea.get(slot.area);
    if (!current) {
      earliestByArea.set(slot.area, candidate);
    } else {
      const timeCompare = candidate.time.localeCompare(current.time);
      if (timeCompare < 0 || (timeCompare === 0 && candidate.weekday < current.weekday)) {
        earliestByArea.set(slot.area, candidate);
      }
    }

    const areaGroups = map.get(slot.area);
    if (areaGroups) {
      if (!areaGroups.includes(slot.group)) {
        areaGroups.push(slot.group);
      }
    } else {
      map.set(slot.area, [slot.group]);
    }

    const groupMap = earliestByAreaGroup.get(slot.area);
    if (!groupMap) {
      earliestByAreaGroup.set(slot.area, new Map([[slot.group, candidate]]));
    } else {
      const currentGroupEarliest = groupMap.get(slot.group);
      if (!currentGroupEarliest) {
        groupMap.set(slot.group, candidate);
      } else {
        const timeCompare = candidate.time.localeCompare(currentGroupEarliest.time);
        if (
          timeCompare < 0 ||
          (timeCompare === 0 && candidate.weekday < currentGroupEarliest.weekday)
        ) {
          groupMap.set(slot.group, candidate);
        }
      }
    }
  }

  for (const [area, groups] of map) {
    groups.sort((groupA, groupB) => {
      const groupMap = earliestByAreaGroup.get(area);
      const earliestA = groupMap?.get(groupA);
      const earliestB = groupMap?.get(groupB);

      if (earliestA && earliestB) {
        const timeCompare = earliestA.time.localeCompare(earliestB.time);
        if (timeCompare !== 0) {
          return timeCompare;
        }
        const weekdayCompare = earliestA.weekday - earliestB.weekday;
        if (weekdayCompare !== 0) {
          return weekdayCompare;
        }
      } else if (earliestA) {
        return -1;
      } else if (earliestB) {
        return 1;
      }

      return groupA.localeCompare(groupB);
    });
  }

  const sortedEntries = Array.from(map.entries()).sort((a, b) => {
    const earliestA = earliestByArea.get(a[0]);
    const earliestB = earliestByArea.get(b[0]);

    if (earliestA && earliestB) {
      const timeCompare = earliestA.time.localeCompare(earliestB.time);
      if (timeCompare !== 0) {
        return timeCompare;
      }
      const weekdayCompare = earliestA.weekday - earliestB.weekday;
      if (weekdayCompare !== 0) {
        return weekdayCompare;
      }
    } else if (earliestA) {
      return -1;
    } else if (earliestB) {
      return 1;
    }

    return a[0].localeCompare(b[0]);
  });

  return new Map(sortedEntries);
}
