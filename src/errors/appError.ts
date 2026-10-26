export class AppError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(message: string, code = 'UNEXPECTED_ERROR', retryable = false, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function toAppError(
  value: unknown,
  fallbackCode = 'UNEXPECTED_ERROR',
  fallbackMessage = 'حدث خطأ غير متوقع.',
): AppError {
  if (value instanceof AppError) return value;
  if (value instanceof Error) {
    const shaped = value as Error & { code?: unknown; retryable?: unknown };
    return new AppError(
      value.message || fallbackMessage,
      typeof shaped.code === 'string' ? shaped.code : fallbackCode,
      shaped.retryable === true,
      { cause: value },
    );
  }
  if (value && typeof value === 'object') {
    const shaped = value as { message?: unknown; code?: unknown; retryable?: unknown };
    return new AppError(
      typeof shaped.message === 'string' && shaped.message ? shaped.message : fallbackMessage,
      typeof shaped.code === 'string' ? shaped.code : fallbackCode,
      shaped.retryable === true,
    );
  }
  return new AppError(typeof value === 'string' && value ? value : fallbackMessage, fallbackCode);
}
