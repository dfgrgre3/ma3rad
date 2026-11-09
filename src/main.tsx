import React, { Profiler } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { reportSlowReactRender, startRendererPerformanceMonitoring } from './services/shared/rendererPerformanceMonitor';

startRendererPerformanceMonitoring();

function reportRendererError(kind: string, value: unknown): void {
  const error = value instanceof Error ? value : new Error(String(value));
  const report = window.ceramisys?.diagnostics?.reportError;
  if (!report) {
    console.error(`[${kind}]`, error);
    return;
  }
  const pendingReport = report({ kind, message: error.message, stack: error.stack });
  void pendingReport.catch((reportError) => {
    console.error('Could not persist renderer error:', reportError);
  });
}

window.addEventListener('error', (event) => {
  reportRendererError('window-error', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  reportRendererError('unhandled-rejection', event.reason);
});

const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  import.meta.env.DEV
    ? <Profiler id="CeramiSys" onRender={reportSlowReactRender}>{app}</Profiler>
    : app,
);
