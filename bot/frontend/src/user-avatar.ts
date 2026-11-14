// Each local user receives one random, high-contrast color, retained on reload.
const colors = [
  "#4f46e5",
  "#7c3aed",
  "#be185d",
  "#b45309",
  "#047857",
  "#0e7490",
  "#1d4ed8",
];
const sessionColors = new Map<string, string>();
export function userAvatarColor(username: string): string {
  const cached = sessionColors.get(username);
  if (cached) return cached;
  const key = `boost.bot.user-avatar.v1.${encodeURIComponent(username)}`;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(key);
  } catch {
    /* Session state remains usable. */
  }
  const color =
    saved && colors.includes(saved)
      ? saved
      : colors[Math.floor(Math.random() * colors.length)];
  sessionColors.set(username, color);
  try {
    localStorage.setItem(key, color);
  } catch {
    /* Retain color in memory. */
  }
  return color;
}
