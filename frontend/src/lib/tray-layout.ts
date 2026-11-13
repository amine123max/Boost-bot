import type { TrayPreferences } from "./tray-preferences";
import { traySlots } from "./tray-slots";

// The editor and the native window use these same CSS-pixel dimensions.
export function trayLayoutSize(preferences: TrayPreferences) {
  const slots = traySlots(preferences);
  const width =
    slots.reduce((sum, slot) => sum + (slot.metric ? 53 : 32), 0) +
    Math.max(0, slots.length - 1) * 6 +
    16;
  return {
    horizontalWidth: Math.max(52, width),
    horizontalHeight: 42,
    verticalWidth: 68,
    verticalHeight: Math.max(48, slots.length * 38 + 16),
  };
}
