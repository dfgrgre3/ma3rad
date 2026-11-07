import type { ProfilerOnRenderCallback } from 'react';

const LONG_TASK_THRESHOLD_MS = 50;
const SLOW_RENDER_THRESHOLD_MS = 50;

export function startRendererPerformanceMonitoring(): () => void {
  if (!import.meta.env.DEV || typeof PerformanceObserver === 'undefined') {
    return () => {};
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration >= LONG_TASK_THRESHOLD_MS) {
        console.warn('[performance] Renderer long task', {
          durationMs: Math.round(entry.duration * 100) / 100,
          startTimeMs: Math.round(entry.startTime * 100) / 100,
        });
      }
    }
  });

  if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    observer.disconnect();
    return () => {};
  }

  observer.observe({ entryTypes: ['longtask'] });
  return () => observer.disconnect();
}

export const reportSlowReactRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  if (!import.meta.env.DEV || actualDuration < SLOW_RENDER_THRESHOLD_MS) return;

  console.warn('[performance] Slow React render', {
    id,
    phase,
    actualDurationMs: Math.round(actualDuration * 100) / 100,
    baseDurationMs: Math.round(baseDuration * 100) / 100,
    startTimeMs: Math.round(startTime * 100) / 100,
    commitTimeMs: Math.round(commitTime * 100) / 100,
  });
};
