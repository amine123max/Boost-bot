import type { ObjectDirective } from "vue";
import {
  normalizeColumnWeights,
  resizeColumnWeights,
} from "@/lib/table-columns";
const disposers = new WeakMap<HTMLTableElement, () => void>();
export const resizableColumns: ObjectDirective<HTMLTableElement, number[]> = {
  mounted(table, binding) {
    const headers = Array.from(
      table.querySelectorAll<HTMLTableCellElement>("thead th"),
    );
    let group = table.querySelector("colgroup");
    if (!group) {
      group = document.createElement("colgroup");
      table.prepend(group);
    }
    while (group.children.length < headers.length)
      group.appendChild(document.createElement("col"));
    const columns = Array.from(group.children) as HTMLTableColElement[];
    let widths = normalizeColumnWeights(binding.value || [], headers.length);
    const update = () =>
      columns.forEach((col, i) => {
        col.style.width = widths[i] + "%";
      });
    update();
    table.classList.add("resizable-table");
    const cleanups: (() => void)[] = [];
    headers.slice(0, -1).forEach((header, index) => {
      const originalLabel = header.getAttribute("aria-label");
      header.setAttribute("aria-label", header.textContent?.trim() || "列");
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "column-resize-handle";
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-orientation", "vertical");
      handle.setAttribute(
        "aria-label",
        "调整" + header.textContent?.trim() + "列宽",
      );
      let startX = 0,
        start: number[] | null = null;
      const down = (event: PointerEvent) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        startX = event.clientX;
        start = [...widths];
        handle.setPointerCapture(event.pointerId);
        table.classList.add("resizing-columns");
      };
      const move = (event: PointerEvent) => {
        if (!start) return;
        const size = table.getBoundingClientRect().width;
        if (size > 0) {
          widths = resizeColumnWeights(
            start,
            index,
            ((event.clientX - startX) / size) * 100,
          );
          update();
        }
      };
      const end = () => {
        start = null;
        table.classList.remove("resizing-columns");
      };
      const key = (event: KeyboardEvent) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        widths = resizeColumnWeights(
          widths,
          index,
          (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 3 : 1),
        );
        update();
      };
      handle.addEventListener("pointerdown", down);
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
      handle.addEventListener("lostpointercapture", end);
      handle.addEventListener("keydown", key);
      header.appendChild(handle);
      cleanups.push(() => {
        handle.removeEventListener("pointerdown", down);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        handle.removeEventListener("lostpointercapture", end);
        handle.removeEventListener("keydown", key);
        handle.remove();
        if (originalLabel == null) header.removeAttribute("aria-label");
        else header.setAttribute("aria-label", originalLabel);
      });
    });
    disposers.set(table, () => cleanups.forEach((cleanup) => cleanup()));
  },
  unmounted(table) {
    disposers.get(table)?.();
    disposers.delete(table);
  },
};
