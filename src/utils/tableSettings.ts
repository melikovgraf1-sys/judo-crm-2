import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { SortState } from "../components/tableUtils";

const STORAGE_PREFIX = "judo_crm_table_";

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch (err) {
    console.warn("Local storage is not available", err);
    return null;
  }
}

function buildColumnsKey(key: string): string {
  return `${STORAGE_PREFIX}${key}_columns`;
}

function buildSortKey(key: string): string {
  return `${STORAGE_PREFIX}${key}_sort`;
}

function sanitizeVisibleColumns(
  value: unknown,
  available: string[],
  fallback: string[],
): string[] {
  const ensureFallback = () => {
    const cleanedFallback: string[] = [];
    for (const id of fallback) {
      if (typeof id !== "string") continue;
      if (!available.includes(id)) continue;
      if (cleanedFallback.includes(id)) continue;
      cleanedFallback.push(id);
    }
    if (cleanedFallback.length > 0) {
      return cleanedFallback;
    }
    return [...available];
  };

  if (!Array.isArray(value)) {
    return ensureFallback();
  }
  const cleaned: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    if (!available.includes(item)) continue;
    if (cleaned.includes(item)) continue;
    cleaned.push(item);
  }
  if (cleaned.length === 0) {
    return ensureFallback();
  }
  return cleaned;
}

function sanitizeSort(value: unknown, available: string[]): SortState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Partial<Record<keyof SortState, unknown>>;
  const columnId = typeof raw.columnId === "string" ? raw.columnId : null;
  const direction = raw.direction === "asc" || raw.direction === "desc" ? raw.direction : null;
  if (!columnId || !direction) {
    return null;
  }
  if (!available.includes(columnId)) {
    return null;
  }
  return { columnId, direction };
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function sortEqual(a: SortState | null, b: SortState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.columnId === b.columnId && a.direction === b.direction;
}

function readVisibleColumns(key: string, available: string[], fallback: string[]): string[] {
  const storage = getStorage();
  const safeFallback = sanitizeVisibleColumns(fallback, available, fallback);
  if (!storage) {
    return safeFallback;
  }
  try {
    const raw = storage.getItem(buildColumnsKey(key));
    if (!raw) {
      return safeFallback;
    }
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeVisibleColumns(parsed, available, safeFallback);
  } catch (err) {
    console.warn("Failed to read persisted table columns", err);
    return safeFallback;
  }
}

function persistVisibleColumns(key: string, columns: string[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(buildColumnsKey(key), JSON.stringify(columns));
  } catch (err) {
    console.warn("Failed to persist table columns", err);
  }
}

function readSortState(key: string, available: string[], fallback: SortState | null): SortState | null {
  const storage = getStorage();
  const safeFallback = fallback ? sanitizeSort(fallback, available) : null;
  if (!storage) {
    return safeFallback ?? null;
  }
  try {
    const raw = storage.getItem(buildSortKey(key));
    if (!raw) {
      return safeFallback ?? null;
    }
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeSort(parsed, available) ?? safeFallback ?? null;
  } catch (err) {
    console.warn("Failed to read persisted table sort", err);
    return safeFallback ?? null;
  }
}

function persistSortState(key: string, sort: SortState | null): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (!sort) {
      storage.removeItem(buildSortKey(key));
      return;
    }
    storage.setItem(buildSortKey(key), JSON.stringify(sort));
  } catch (err) {
    console.warn("Failed to persist table sort", err);
  }
}

export function usePersistentTableSettings(
  key: string,
  availableColumns: string[],
  defaultVisibleColumns: string[],
  defaultSort: SortState | null = null,
): {
  visibleColumns: string[];
  setVisibleColumns: Dispatch<SetStateAction<string[]>>;
  sort: SortState | null;
  setSort: Dispatch<SetStateAction<SortState | null>>;
} {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    readVisibleColumns(key, availableColumns, defaultVisibleColumns),
  );
  const [sort, setSort] = useState<SortState | null>(() =>
    readSortState(key, availableColumns, defaultSort),
  );

  useEffect(() => {
    setVisibleColumns(prev => {
      const next = sanitizeVisibleColumns(prev, availableColumns, defaultVisibleColumns);
      return arraysEqual(prev, next) ? prev : next;
    });
  }, [availableColumns, defaultVisibleColumns]);

  useEffect(() => {
    setSort(prev => {
      const next = sanitizeSort(prev, availableColumns);
      if (sortEqual(prev, next ?? null)) {
        return prev;
      }
      return next ?? (defaultSort ? sanitizeSort(defaultSort, availableColumns) : null);
    });
  }, [availableColumns, defaultSort]);

  useEffect(() => {
    persistVisibleColumns(key, visibleColumns);
  }, [key, visibleColumns]);

  useEffect(() => {
    persistSortState(key, sort);
  }, [key, sort]);

  return { visibleColumns, setVisibleColumns, sort, setSort };
}
