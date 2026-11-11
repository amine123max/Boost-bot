// Diagnostic and clipboard views omit credentials while preserving all configuration keys.
export function redactConfiguration(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (/token|password|secret|credential|api.?key|access.?key/i.test(key))
      return value ? "••••••••" : "";
    if (/url|proxy/i.test(key) && value.includes("://")) {
      if (/[\r\n]/.test(value))
        return value
          .split(/\r?\n/)
          .map((line) => redactConfiguration(line, key))
          .join("\n");
      try {
        const url = new URL(value);
        if (url.username || url.password) {
          url.username = "REDACTED";
          url.password = "REDACTED";
          return url.toString();
        }
      } catch {
        return "••••••••";
      }
    }
    return value;
  }
  if (Array.isArray(value))
    return value.map((item) => redactConfiguration(item, key));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redactConfiguration(v, k)]),
    );
  return value;
}
