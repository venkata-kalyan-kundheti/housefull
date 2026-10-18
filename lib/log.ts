/**
 * lib/log.ts
 *
 * Structured logger for Housefull.
 * The ONLY file permitted to invoke console methods (per ESLint rule).
 * Every output is sanitized using redactSecrets.
 */

import { getConfig, redactSecrets } from "./config";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getActiveLogLevel(): LogLevel {
  try {
    return getConfig().LOG_LEVEL;
  } catch {
    return "info";
  }
}

function shouldLog(level: LogLevel): boolean {
  const currentLevel = getActiveLogLevel();
  return LEVEL_SEVERITY[level] >= LEVEL_SEVERITY[currentLevel];
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return "";
  try {
    const serialized = JSON.stringify(meta);
    return " " + redactSecrets(serialized);
  } catch {
    return " [Unserializable metadata]";
  }
}

export const log = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (!shouldLog("debug")) return;
    const sanitized = redactSecrets(message);
    const metaStr = formatMeta(meta);
    console.warn(`[DEBUG] ${new Date().toISOString()} ${sanitized}${metaStr}`);
  },

  info(message: string, meta?: Record<string, unknown>): void {
    if (!shouldLog("info")) return;
    const sanitized = redactSecrets(message);
    const metaStr = formatMeta(meta);
    console.warn(`[INFO] ${new Date().toISOString()} ${sanitized}${metaStr}`);
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    if (!shouldLog("warn")) return;
    const sanitized = redactSecrets(message);
    const metaStr = formatMeta(meta);
    console.warn(`[WARN] ${new Date().toISOString()} ${sanitized}${metaStr}`);
  },

  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    if (!shouldLog("error")) return;
    const sanitized = redactSecrets(message);
    let errStr = "";
    if (error instanceof Error) {
      errStr = ` | ${error.name}: ${redactSecrets(error.message)}`;
      if (error.stack) {
        errStr += `\n${redactSecrets(error.stack)}`;
      }
    } else if (error) {
      errStr = ` | ${redactSecrets(String(error))}`;
    }
    const metaStr = formatMeta(meta);
    console.error(`[ERROR] ${new Date().toISOString()} ${sanitized}${errStr}${metaStr}`);
  },
};
