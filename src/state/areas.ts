import type { Area } from "../types";

export const RESERVE_AREA_NAME = "резерв";

export function isReserveArea(area?: Area | null): boolean {
  if (!area) {
    return false;
  }
  return area.trim().toLowerCase() === RESERVE_AREA_NAME;
}
