import { useState, useEffect } from "react";

/**
 * Returns a debounced copy of the provided value after `delayMs` milliseconds.
 * Default delay is 200ms.
 */
export function useDebounce<T>(value: T, delayMs: number = 200): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

export default useDebounce;
