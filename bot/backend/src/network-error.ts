import { isIP } from "node:net";
import { t } from "./i18n/index.js";

/** Only a refused connection to a loopback HTTP proxy, never a generic 502 or local service failure. */
export function localProxyFailureHint(message: string): string | undefined {
  const match = /\bproxyconnect\s+tcp:\s*dial\s+tcp(?:4|6)?\s+(\[[\da-f:]+\]|localhost|127(?:\.\d{1,3}){3}):(\d{1,5}):\s*(?:connect(?:ex)?:\s*)?(?:connection refused\b|ECONNREFUSED\b|No connection could be made because the target machine actively refused it\b)/i.exec(message);
  if (!match) return;
  const host = match[1]!.replace(/^\[|\]$/g, "").toLowerCase();
  const port = Number(match[2]);
  const loopback = host === "localhost" || (isIP(host) === 4 && host.startsWith("127.")) || host === "::1" || host === "0:0:0:0:0:0:0:1";
  if (!loopback || port < 1 || port > 65535) return;
  return t("runtime.localProxyRefused", { address: `${match[1]}:${port}` });
}

/** Diagnostics retain the original error after the actionable explanation. */
export function explainLocalProxyError(message: string): string {
  const hint = localProxyFailureHint(message);
  return hint && !message.startsWith(hint) ? `${hint}\n${message}` : message;
}
