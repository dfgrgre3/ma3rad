import { useCallback, useRef } from 'react';

/**
 * Stable idempotency key per logical submission sequence.
 *
 * The key is created lazily on first use and reused until `resetKey()` is
 * called (after a successful submit, or when the component starts a new
 * operation). Retrying with the same key returns the previously recorded
 * result instead of duplicating the write — protecting against double-clicks
 * and network retries.
 */
export function useIdempotencyKey(): { getKey: () => string; resetKey: () => void } {
  const keyRef = useRef<string | null>(null);

  const getKey = useCallback((): string => {
    if (!keyRef.current) keyRef.current = `ui-${crypto.randomUUID()}`;
    return keyRef.current;
  }, []);

  const resetKey = useCallback((): void => {
    keyRef.current = null;
  }, []);

  return { getKey, resetKey };
}
