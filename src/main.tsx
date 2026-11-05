import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
