import { useEffect, useState } from 'react';
import { readCachedCentralConfig, subscribeCentralConfig } from '../services/domains/licensing/centralConfigStore';

/**
 * Subscribes a React component to live updates of `central_cached_config`
 * (same-window dispatches and cross-tab/cross-window storage events).
 * Returns a monotonically increasing version number to trigger re-evaluation.
 */
export function useCentralConfigVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return subscribeCentralConfig(() => {
      readCachedCentralConfig();
      setVersion((v) => v + 1);
    });
  }, []);

  return version;
}

