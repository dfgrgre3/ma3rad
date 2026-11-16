import { AppError } from '../errors/appError';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  error?: Error;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private minLevel: LogLevel;
  private isProduction: boolean;
  private maxHistory: number;
  private history: LogEntry[] = [];

  constructor(options: {
    minLevel?: LogLevel;
    isProduction?: boolean;
    maxHistory?: number;
  } = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.isProduction = options.isProduction ?? (import.meta.env?.PROD === true);
    this.maxHistory = options.maxHistory ?? 100;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const ts = new Date().toISOString();
    const ctx = context ? ` | ${JSON.stringify(context)}` : '';
    return `[${ts}] [${level.toUpperCase()}] ${message}${ctx}`;
  }

  private addToHistory(entry: LogEntry): void {
    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    const entry: LogEntry = { level: 'debug', message, timestamp: new Date().toISOString(), context };
    this.addToHistory(entry);
    if (!this.isProduction) {
      // eslint-disable-next-line no-console
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    const entry: LogEntry = { level: 'info', message, timestamp: new Date().toISOString(), context };
    this.addToHistory(entry);
    if (!this.isProduction) {
      // eslint-disable-next-line no-console
      console.info(this.formatMessage('info', message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return;
    const entry: LogEntry = { level: 'warn', message, timestamp: new Date().toISOString(), context };
    this.addToHistory(entry);
    if (!this.isProduction) {
      // eslint-disable-next-line no-console
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    const entry: LogEntry = { level: 'error', message, timestamp: new Date().toISOString(), context, error };
    this.addToHistory(entry);
    if (!this.isProduction) {
      // eslint-disable-next-line no-console
      console.error(this.formatMessage('error', message, context), error ? error.stack : '');
    } else {
      // في الإنتاج: يمكن إرسال السجلات إلى خدمة مراقبة خارجية هنا
      // مثال: Sentry.captureException(error, { extra: context });
    }
  }

  getHistory(): LogEntry[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  getSlowQueryStats(): {
    totalQueries: number;
    failedQueries: number;
    slowQueryCount: number;
    slowestQueryMs: number;
  } | null {
    return null;
  }
}

export const logger = new Logger();

export function createLogger(options: {
  minLevel?: LogLevel;
  isProduction?: boolean;
  maxHistory?: number;
}): Logger {
  return new Logger(options);
}

export function withErrorHandling<T extends (...args: any[]) => any>(
  fn: T,
  options: { serviceName?: string; operationName?: string } = {}
): T {
  return ((...args: any[]) => {
    try {
      return fn(...args);
    } catch (error) {
      logger.error(
        `خطأ في ${options.serviceName ?? 'غير معروف'}::${options.operationName ?? 'عملية غير معروفة'}`,
        error instanceof Error ? error : new Error(String(error)),
        { args: args.slice(0, 3) }
      );
      throw error;
    }
  }) as T;
}

export function withPerformanceMonitoring<T extends (...args: any[]) => any>(
  fn: T,
  options: { serviceName?: string; operationName?: string; thresholdMs?: number } = {}
): T {
  return ((...args: any[]) => {
    const start = performance.now();
    try {
      return fn(...args);
    } finally {
      const duration = performance.now() - start;
      const threshold = options.thresholdMs ?? 1000;
      if (duration > threshold) {
        logger.warn(
          `عملية بطيئة في ${options.serviceName ?? 'غير معروف'}::${options.operationName ?? 'غير معروف'}`,
          { durationMs: Math.round(duration * 100) / 100, thresholdMs: threshold }
        );
      } else {
        logger.debug(
          `أداء طبيعي في ${options.serviceName ?? 'غير معروف'}::${options.operationName ?? 'غير معروف'}`,
          { durationMs: Math.round(duration * 100) / 100 }
        );
      }
    }
  }) as T;
}