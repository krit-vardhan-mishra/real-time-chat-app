// Shared logger for both client (browser) and server (node)
// Goals:
// - In development: allow verbose debug/info logs
// - In production: allow only warn/error by default (can be overridden)
// - Namespaced loggers for clearer sources
// - Safe in both environments (no assumptions about process/import.meta/localStorage)

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function nowISO() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function isProduction(): boolean {
  try {
    // Browser (Vite): import.meta.env.DEV is boolean
    // @ts-ignore - guarded
    if (typeof import.meta !== "undefined" && (import.meta as any)?.env) {
      // @ts-ignore
      return !(import.meta as any).env.DEV;
    }
  } catch {}
  try {
    if (typeof process !== "undefined" && process?.env) {
      return process.env.NODE_ENV === "production";
    }
  } catch {}
  return false; // default to dev if unknown
}

function readConfiguredLevel(defaultLevel: LogLevel): LogLevel {
  // Server override via env
  try {
    if (typeof process !== "undefined" && process?.env?.LOG_LEVEL) {
      const lvl = process.env.LOG_LEVEL.toLowerCase() as LogLevel;
      if (lvl in levelWeight) return lvl;
    }
  } catch {}
  // Client override via localStorage
  try {
    if (typeof window !== "undefined" && window?.localStorage) {
      const lvl = window.localStorage.getItem("LOG_LEVEL");
      if (lvl && (lvl.toLowerCase() as LogLevel) in levelWeight) {
        return lvl.toLowerCase() as LogLevel;
      }
    }
  } catch {}
  return defaultLevel;
}

let currentLevel: LogLevel = readConfiguredLevel(isProduction() ? "warn" : "debug");

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

function shouldLog(level: LogLevel) {
  return levelWeight[level] >= levelWeight[currentLevel];
}

function formatPrefix(namespace?: string) {
  const ts = nowISO();
  const env = isProduction() ? "PROD" : "DEV";
  const side = typeof window === "undefined" ? "server" : "client";
  return `[${ts}] [${env}/${side}]${namespace ? ` [${namespace}]` : ""}`;
}

export interface ILogger {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

export function createLogger(namespace?: string): ILogger {
  return {
    debug: (...args: any[]) => {
      if (!shouldLog("debug")) return;
      try { console.debug(formatPrefix(namespace), ...args); } catch { /* noop */ }
    },
    info: (...args: any[]) => {
      if (!shouldLog("info")) return;
      try { console.info(formatPrefix(namespace), ...args); } catch { /* noop */ }
    },
    warn: (...args: any[]) => {
      if (!shouldLog("warn")) return;
      try { console.warn(formatPrefix(namespace), ...args); } catch { /* noop */ }
    },
    error: (...args: any[]) => {
      if (!shouldLog("error")) return;
      try { console.error(formatPrefix(namespace), ...args); } catch { /* noop */ }
    },
  } as const;
}

// A default root logger for quick use
export const logger = createLogger();
