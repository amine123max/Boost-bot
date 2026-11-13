import type { TrayPreferences, TrayWidget } from "./tray-preferences";
export interface TraySlot {
  widgets: Array<{ widget: TrayWidget; index: number }>;
  metric: boolean;
}
export function traySlots(preferences: TrayPreferences): TraySlot[] {
  const slots: TraySlot[] = [];
  preferences.pages.forEach((page, index) => {
    const widget = page.widgets[0];
    const metric = !["progress", "quota", "tps"].includes(widget.kind);
    const last = slots.at(-1);
    if (metric && last?.metric && last.widgets.length < 3)
      last.widgets.push({ widget, index });
    else slots.push({ widgets: [{ widget, index }], metric });
  });
  return slots;
}
