import { LOG_PREFIX } from "./constants.js";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LogContext {
  module?: string;
  operation?: string;
  traceId?: string;
  duration?: number;
  error?: Error | unknown;
  [key: string]: unknown;
}

interface LoggerConfig {
  verbose: boolean;
  level: LogLevel;
  showTimestamp: boolean;
  showCaller: boolean;
  showTrace: boolean;
  indent: string;
}

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: COLORS.cyan,
  [LogLevel.INFO]: COLORS.green,
  [LogLevel.WARN]: COLORS.yellow,
  [LogLevel.ERROR]: COLORS.red,
  [LogLevel.NONE]: COLORS.reset,
};

const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.NONE]: "NONE",
};

let globalConfig: LoggerConfig = {
  verbose: false,
  level: LogLevel.INFO,
  showTimestamp: true,
  showCaller: true,
  showTrace: false,
  indent: "  ",
};

let traceCounter = 0;

export function configureLogger(options: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...options };
}

export function setVerbose(verbose: boolean): void {
  globalConfig.verbose = verbose;
  globalConfig.level = verbose ? LogLevel.DEBUG : LogLevel.INFO;
}

function getTimestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

function getCallerInfo(depth: number = 3): string {
  const stack = new Error().stack;
  if (!stack) return "";

  const lines = stack.split("\n");
  const targetLine = lines[depth];
  if (!targetLine) return "";

  const match = targetLine.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
  if (!match) return "";

  const [, funcName, filePath, line] = match;
  const fileName = filePath.split("/").pop() || filePath;
  const func = funcName || "<anonymous>";
  return `${fileName}:${line} ${func}`;
}

function formatValue(value: unknown, depth: number = 0): string {
  if (depth > 3) return "...";

  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return depth > 0 ? `"${value}"` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.length > 5) {
      const items = value.slice(0, 3).map((v) => formatValue(v, depth + 1));
      return `[${items.join(", ")}, ... ${value.length - 3} more items]`;
    }
    const items = value.map((v) => formatValue(v, depth + 1));
    return `[${items.join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    if (entries.length > 5) {
      const shown = entries.slice(0, 3).map(([k, v]) => `${k}: ${formatValue(v, depth + 1)}`);
      return `{${shown.join(", ")}, ... ${entries.length - 3} more keys}`;
    }
    const formatted = entries.map(([k, v]) => `${k}: ${formatValue(v, depth + 1)}`);
    return `{${formatted.join(", ")}}`;
  }
  return String(value);
}

function formatContext(context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) return "";

  const parts: string[] = [];

  if (context.module) parts.push(`[${context.module}]`);
  if (context.operation) parts.push(`(${context.operation})`);
  if (context.traceId) parts.push(`trace:${context.traceId}`);
  if (context.duration !== undefined) parts.push(`${context.duration}ms`);

  const extraKeys = Object.keys(context).filter(
    (k) => !["module", "operation", "traceId", "duration", "error"].includes(k),
  );
  if (extraKeys.length > 0) {
    const extra: Record<string, unknown> = {};
    extraKeys.forEach((k) => (extra[k] = context[k]));
    parts.push(formatValue(extra));
  }

  return parts.join(" ");
}

function log(level: LogLevel, message: string, context?: LogContext, ...args: unknown[]): void {
  if (level < globalConfig.level) return;

  const parts: string[] = [];

  parts.push(`${COLORS.dim}[${process.pid}]${COLORS.reset}`);

  if (globalConfig.showTimestamp) {
    parts.push(`${COLORS.dim}${getTimestamp()}${COLORS.reset}`);
  }

  const levelColor = LEVEL_COLORS[level];
  const levelName = LEVEL_NAMES[level].padEnd(5);
  parts.push(`${levelColor}${levelName}${COLORS.reset}`);

  parts.push(`${COLORS.bright}${LOG_PREFIX}${COLORS.reset}`);

  const contextStr = formatContext(context);
  if (contextStr) {
    parts.push(`${COLORS.magenta}${contextStr}${COLORS.reset}`);
  }

  parts.push(message);

  if (globalConfig.showCaller && level >= LogLevel.WARN) {
    const caller = getCallerInfo(4);
    if (caller) {
      parts.push(`${COLORS.dim}(${caller})${COLORS.reset}`);
    }
  }

  const formattedArgs = args.map((a) => formatValue(a)).join(" ");
  if (formattedArgs) {
    parts.push(formattedArgs);
  }

  const output = parts.join(" ");

  if (level >= LogLevel.ERROR) {
    console.error(output);
  } else if (level === LogLevel.WARN) {
    console.warn(output);
  } else {
    console.log(output);
  }

  if (context?.error && level >= LogLevel.ERROR && globalConfig.showTrace) {
    const err = context.error;
    if (err instanceof Error && err.stack) {
      console.error(`${COLORS.dim}${err.stack}${COLORS.reset}`);
    }
  }
}

export const logger = {
  debug(message: string, context?: LogContext, ...args: unknown[]): void {
    log(LogLevel.DEBUG, message, context, ...args);
  },

  info(message: string, context?: LogContext, ...args: unknown[]): void {
    log(LogLevel.INFO, message, context, ...args);
  },

  warn(message: string, context?: LogContext, ...args: unknown[]): void {
    log(LogLevel.WARN, message, context, ...args);
  },

  error(message: string, context?: LogContext, ...args: unknown[]): void {
    log(LogLevel.ERROR, message, context, ...args);
  },

  group(label: string, context?: LogContext): void {
    if (!globalConfig.verbose) return;
    const contextStr = formatContext(context);
    console.log(
      `${COLORS.dim}[${process.pid}]${COLORS.reset} ${COLORS.bright}${LOG_PREFIX}${COLORS.reset} ${COLORS.blue}▼${COLORS.reset} ${label}${contextStr ? ` ${contextStr}` : ""}`,
    );
  },

  groupEnd(): void {
    if (!globalConfig.verbose) return;
  },
};

export function generateTraceId(): string {
  traceCounter++;
  const timestamp = Date.now().toString(36);
  const counter = traceCounter.toString(36).padStart(4, "0");
  return `${timestamp}-${counter}`;
}

export class PerformanceTimer {
  private startTime: number;
  private context: LogContext;
  private operation: string;

  constructor(operation: string, context?: LogContext) {
    this.operation = operation;
    this.context = context || {};
    this.startTime = performance.now();

    logger.debug(`⏱️  Starting: ${operation}`, this.context);
  }

  end(message?: string): number {
    const duration = Math.round(performance.now() - this.startTime);
    const msg = message || `✓ Completed: ${this.operation}`;
    logger.debug(msg, { ...this.context, duration });
    return duration;
  }

  checkpoint(label: string): number {
    const elapsed = Math.round(performance.now() - this.startTime);
    logger.debug(`  ↳ ${label}`, { ...this.context, duration: elapsed });
    return elapsed;
  }
}

export class RequestContext {
  traceId: string;
  method: string;
  path: string;
  startTime: number;
  private checkpoints: Array<{ time: number; label: string }> = [];

  constructor(method: string, path: string) {
    this.traceId = generateTraceId();
    this.method = method;
    this.path = path;
    this.startTime = performance.now();

    logger.debug(`→ ${method} ${path}`, { traceId: this.traceId, module: "HTTP" });
  }

  checkpoint(label: string): void {
    const elapsed = Math.round(performance.now() - this.startTime);
    this.checkpoints.push({ time: elapsed, label });
    logger.debug(`  → ${label}`, { traceId: this.traceId, duration: elapsed });
  }

  end(statusCode: number): void {
    const duration = Math.round(performance.now() - this.startTime);
    const statusColor = statusCode < 400 ? COLORS.green : COLORS.red;
    logger.debug(`← ${this.method} ${this.path} ${statusColor}${statusCode}${COLORS.reset}`, {
      traceId: this.traceId,
      duration,
      checkpoints: this.checkpoints.length,
    });
  }

  error(error: Error | unknown): void {
    const duration = Math.round(performance.now() - this.startTime);
    logger.error(`✗ ${this.method} ${this.path}`, {
      traceId: this.traceId,
      duration,
      error,
    });
  }
}

export function createLogger(module: string) {
  return {
    debug(message: string, context?: Omit<LogContext, "module">, ...args: unknown[]): void {
      logger.debug(message, { ...context, module }, ...args);
    },

    info(message: string, context?: Omit<LogContext, "module">, ...args: unknown[]): void {
      logger.info(message, { ...context, module }, ...args);
    },

    warn(message: string, context?: Omit<LogContext, "module">, ...args: unknown[]): void {
      logger.warn(message, { ...context, module }, ...args);
    },

    error(message: string, context?: Omit<LogContext, "module">, ...args: unknown[]): void {
      logger.error(message, { ...context, module }, ...args);
    },

    timer(operation: string, context?: Omit<LogContext, "module">): PerformanceTimer {
      return new PerformanceTimer(operation, { ...context, module });
    },
  };
}

export function logMethod(
  target: unknown,
  propertyKey: string,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  const originalMethod = descriptor.value;
  const className = (target as { constructor: { name: string } }).constructor.name;

  descriptor.value = async function (...args: unknown[]) {
    const timer = new PerformanceTimer(`${className}.${propertyKey}`);
    try {
      const result = await originalMethod.apply(this, args);
      timer.end();
      return result;
    } catch (error) {
      timer.end("❌ Failed");
      throw error;
    }
  };

  return descriptor;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))}${sizes[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
