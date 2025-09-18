export type SortDirection = "asc" | "desc";

export interface SortState {
  columnId: string;
  direction: SortDirection;
}

export function toggleSort(current: SortState | null, columnId: string): SortState | null {
  if (!current || current.columnId !== columnId) {
    return { columnId, direction: "asc" };
  }
  if (current.direction === "asc") {
    return { columnId, direction: "desc" };
  }
  return null;
}

export function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;

  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  const aDate = typeof a === "string" && !Number.isNaN(Date.parse(a)) ? new Date(a) : null;
  const bDate = typeof b === "string" && !Number.isNaN(Date.parse(b)) ? new Date(b) : null;
  if (aDate && bDate) {
    return aDate.getTime() - bDate.getTime();
  }

  if (typeof a === "boolean" && typeof b === "boolean") {
    if (a === b) return 0;
    return a ? 1 : -1;
  }

  const aNum = Number(a);
  const bNum = Number(b);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
    return aNum - bNum;
  }

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}
