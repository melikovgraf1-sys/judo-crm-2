import type { Client } from "../types";
import { calcAgeYears, calcExperienceMonths } from "../state/utils";

export type AgeExperienceFilter = {
  minAge: number | null;
  maxAge: number | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
};

export type AgeExperienceFilterInput = {
  minAgeText: string;
  maxAgeText: string;
  minExperienceYearsText: string;
  maxExperienceYearsText: string;
};

const parsePositiveInt = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed);
};

const parsePositiveNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed < 0 ? 0 : parsed;
};

export const parseAgeExperienceFilter = ({
  minAgeText,
  maxAgeText,
  minExperienceYearsText,
  maxExperienceYearsText,
}: AgeExperienceFilterInput): AgeExperienceFilter => ({
  minAge: parsePositiveInt(minAgeText),
  maxAge: parsePositiveInt(maxAgeText),
  minExperienceYears: parsePositiveNumber(minExperienceYearsText),
  maxExperienceYears: parsePositiveNumber(maxExperienceYearsText),
});

export const isAgeExperienceFilterActive = (filter: AgeExperienceFilter): boolean =>
  filter.minAge != null ||
  filter.maxAge != null ||
  filter.minExperienceYears != null ||
  filter.maxExperienceYears != null;

export const matchesClientAgeExperience = (client: Client, filter: AgeExperienceFilter): boolean => {
  const age = calcAgeYears(client.birthDate);
  if (filter.minAge != null && age < filter.minAge) {
    return false;
  }
  if (filter.maxAge != null && age > filter.maxAge) {
    return false;
  }

  const experienceYears = calcExperienceMonths(client.startDate) / 12;
  if (filter.minExperienceYears != null && experienceYears < filter.minExperienceYears) {
    return false;
  }
  if (filter.maxExperienceYears != null && experienceYears > filter.maxExperienceYears) {
    return false;
  }

  return true;
};
