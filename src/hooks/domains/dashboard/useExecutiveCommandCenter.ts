import { useCallback, useEffect, useRef, useState } from 'react';
import { executiveCommandService } from '../../../services/domains/dashboard/ExecutiveCommandService';
import type {
  CommandRange,
  DrilldownKey,
  DrilldownResult,
  ExecutiveCommandOverview,
} from '../../../types/dashboard/executiveCommand';

export function useExecutiveCommandCenter() {
  const [range, setRangeState] = useState<CommandRange>('month');
  const [data, setData] = useState<ExecutiveCommandOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [drilldownKey, setDrilldownKey] = useState<DrilldownKey | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownResult | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const drilldownRequestRef = useRef(0);

  const loadData = useCallback(async (nextRange: CommandRange = range) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = executiveCommandService.getOverview(nextRange);
      if (requestRef.current !== requestId) return;
      setData(result);
      setLastUpdated(new Date());
    } catch (cause) {
      if (requestRef.current !== requestId) return;
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات لوحة القيادة.');
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [range]);

  const setRange = useCallback((nextRange: CommandRange) => {
    setRangeState(nextRange);
    setDrilldownKey(null);
    setDrilldown(null);
    setDrilldownError(null);
  }, []);

  const openDrilldown = useCallback(async (key: DrilldownKey) => {
    const requestId = ++drilldownRequestRef.current;
    setDrilldownKey(key);
    setDrilldown(null);
    setDrilldownError(null);
    setDrilldownLoading(true);
    try {
      const result = executiveCommandService.getDrilldown(key, range);
      if (drilldownRequestRef.current !== requestId) return;
      setDrilldown(result);
    } catch (cause) {
      if (drilldownRequestRef.current !== requestId) return;
      setDrilldownError(cause instanceof Error ? cause.message : 'تعذر تحميل تفاصيل المؤشر.');
    } finally {
      if (drilldownRequestRef.current === requestId) setDrilldownLoading(false);
    }
  }, [range]);

  const closeDrilldown = useCallback(() => {
    drilldownRequestRef.current += 1;
    setDrilldownKey(null);
    setDrilldown(null);
    setDrilldownError(null);
    setDrilldownLoading(false);
  }, []);

  const refresh = useCallback(() => loadData(range), [loadData, range]);

  useEffect(() => {
    void loadData(range);
    // Range is the only trigger; loadData is re-created with it.
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    range,
    setRange,
    data,
    loading,
    error,
    lastUpdated,
    refresh,
    drilldownKey,
    drilldown,
    drilldownLoading,
    drilldownError,
    openDrilldown,
    closeDrilldown,
  };
}
