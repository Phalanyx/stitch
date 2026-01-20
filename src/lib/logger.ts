/**
 * Logger utility for consistent logging across API services.
 * Creates prefixed loggers for easy identification of log sources.
 */

export interface Logger {
  info: (msg: string, ctx?: object) => void;
  warn: (msg: string, ctx?: object) => void;
  error: (msg: string, ctx?: object) => void;
}

/**
 * Create a logger with a consistent prefix for identifying the source.
 * @param prefix - The prefix to prepend to all log messages (e.g., "Session API")
 * @returns Logger object with info, warn, and error methods
 */
export function createLogger(prefix: string): Logger {
  return {
    info: (msg: string, ctx?: object) => {
      if (ctx) {
        console.log(`[${prefix}] ${msg}`, ctx);
      } else {
        console.log(`[${prefix}] ${msg}`);
      }
    },
    warn: (msg: string, ctx?: object) => {
      if (ctx) {
        console.warn(`[${prefix}] ${msg}`, ctx);
      } else {
        console.warn(`[${prefix}] ${msg}`);
      }
    },
    error: (msg: string, ctx?: object) => {
      if (ctx) {
        console.error(`[${prefix}] ${msg}`, ctx);
      } else {
        console.error(`[${prefix}] ${msg}`);
      }
    },
  };
}

/**
 * Generate a unique request ID for tracing requests across log messages.
 * @returns A unique request ID in the format "req_{timestamp}_{random}"
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
