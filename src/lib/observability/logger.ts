export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  entrypoint?: string;
  route?: string;
  callId?: string;
  correlationId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(context: LogContext): Logger;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_KEY_PARTS = [
  "authorization",
  "token",
  "api_key",
  "apikey",
  "secret",
  "password",
  "email",
  "phone",
  "address",
  "transcript",
  "recording",
  "payload",
  "object_key",
];

const MAX_VALUE_LENGTH = 1000;

export function createLogger(options: {
  minLevel?: LogLevel;
  context?: LogContext;
} = {}): Logger {
  const minLevel = options.minLevel ?? "info";
  const baseContext = options.context ?? {};

  function emit(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[minLevel]) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...sanitize(baseContext),
      ...sanitize(data),
    };

    const line = JSON.stringify(entry);
    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  return {
    debug: (message, data) => emit("debug", message, data),
    info: (message, data) => emit("info", message, data),
    warn: (message, data) => emit("warn", message, data),
    error: (message, data) => emit("error", message, data),
    child: (context) => createLogger({
      minLevel,
      context: { ...baseContext, ...context },
    }),
  };
}

function sanitize(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) {
    return undefined;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = sanitizeValue(key, value);
  }

  return result;
}

function sanitizeValue(key: string, value: unknown): unknown {
  const normalizedKey = key.toLowerCase();
  if (SENSITIVE_KEY_PARTS.some((part) => normalizedKey.includes(part))) {
    return "[REDACTED]";
  }

  if (typeof value === "string" && value.length > MAX_VALUE_LENGTH) {
    return `${value.slice(0, MAX_VALUE_LENGTH)}...[truncated]`;
  }

  return value;
}
