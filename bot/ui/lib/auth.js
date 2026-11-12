/** Desktop Bot API calls use an explicit header because third-party iframe cookies may be blocked. */
export function authToken() {
  try {
    return sessionStorage.getItem("amb-token") || "";
  } catch {
    return "";
  }
}

export function authHeaders() {
  const token = authToken();
  return token ? { "x-amb-token": token } : {};
}
