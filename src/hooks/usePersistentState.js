// @flow
import { useEffect, useRef, useState } from "react";

export default function usePersistentState<T>(key: string, defaultValue: T, delay: number = 300): [T, (T => void)] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        return (JSON.parse(raw): T);
      }
    } catch (e) {}
    localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  });

  const timeoutRef = useRef<?TimeoutID>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch (e) {}
    }, delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [state, key, delay]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        try {
          localStorage.setItem(key, JSON.stringify(state));
        } catch (e) {}
      }
    };
  }, []);

  return [state, setState];
}
