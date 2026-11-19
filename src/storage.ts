import { useEffect, useState } from 'react';

/** useState persisted to localStorage (shopping list and ticked items live only on this device). */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable (private mode): keep working in memory.
    }
  }, [key, value]);
  return [value, setValue] as const;
}
