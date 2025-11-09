import { createLogger } from "./logger";

let installed = false;

function isProduction(): boolean {
  try {
    // @ts-ignore
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
  return false;
}

export function installConsoleInterceptor() {
  if (installed) return;
  installed = true;

  const l = createLogger("global");

  const prod = isProduction();
  const original = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  } as const;

  if (prod) {
    console.debug = () => {};
    console.info = () => {};
    console.log = () => {};
    console.warn = (...args: any[]) => { try { l.warn(...args); } catch {} };
    console.error = (...args: any[]) => { try { l.error(...args); } catch {} };
  } else {
    console.debug = (...args: any[]) => { try { l.debug(...args); } catch {} };
    console.info = (...args: any[]) => { try { l.info(...args); } catch {} };
    console.log = (...args: any[]) => { try { l.info(...args); } catch {} };
    console.warn = (...args: any[]) => { try { l.warn(...args); } catch {} };
    console.error = (...args: any[]) => { try { l.error(...args); } catch {} };
  }

  // Return a function to restore if ever needed
  return () => {
    console.debug = original.debug;
    console.info = original.info;
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
    installed = false;
  };
}
