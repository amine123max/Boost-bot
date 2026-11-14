<script lang="ts">
import { defineComponent, h } from "vue";
const icons: Record<string, string> = {
  chevron: "m9 5 7 7-7 7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  model: "M8 3h8l5 9-5 9H8L3 12l5-9ZM8 3l8 18M16 3 8 21M3 12h18",
  bot: "M8 4h8l4 5v9l-4 3H8l-4-3V9l4-5ZM12 4V2M9 11v3M15 11v3",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  panel: "M3 5h18v14H3ZM15 5v14",
  plus: "M12 5v14M5 12h14",
  chat: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z",
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  search: "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  arrow: "M12 19V5m-6 6 6-6 6 6",
  stop: "M6 6h12v12H6Z",
  close: "m6 6 12 12M6 18 18 6",
  settings: "M9.7 2.8h4.6l.5 2a7.5 7.5 0 0 1 1.7 1l2-.6 2.3 4-1.5 1.4a8 8 0 0 1 0 2l1.5 1.4-2.3 4-2-.6a7.5 7.5 0 0 1-1.7 1l-.5 2H9.7l-.5-2a7.5 7.5 0 0 1-1.7-1l-2 .6-2.3-4 1.5-1.4a8 8 0 0 1 0-2L3.2 9.2l2.3-4 2 .6a7.5 7.5 0 0 1 1.7-1l.5-2ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  tasks: "M9 5h11M9 12h11M9 19h11m-7-1 2 2 3-3M3 5h.01M3 12h.01",
  check: "m5 12 4 4L19 6",
  info: "M12 7v6M12 16h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  refresh:
    "M20 7v5h-5M4 17v-5h5M6.1 6a8 8 0 0 1 13.2 3M4.7 15a8 8 0 0 0 13.2 3",
  grid: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7ZM8 12l3 3 5-6",
  "shield-alert": "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7ZM12 8v5M12 16h.01",
  "permission-auto": "M12 3 4 6v7c0 5 8 8 8 8s8-3 8-8V6ZM9 9l3 3-3 3M14 15h2",
  hand: "M8 12V5a1.5 1.5 0 0 1 3 0v6M11 11V3.5a1.5 1.5 0 0 1 3 0V11M14 11V5a1.5 1.5 0 0 1 3 0v7M17 12V8a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-14 0l-2-4a1.5 1.5 0 0 1 2.5-1.5L8 12Z",
  monitor: "M3 4h18v13H3ZM8 21h8M12 17v4",
  database: "M21 6c0 2-4 3-9 3S3 8 3 6s4-3 9-3 9 1 9 3ZM3 6v12c0 2 4 3 9 3s9-1 9-3V6M3 12c0 2 4 3 9 3s9-1 9-3",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5",
  back: "m12 19-7-7 7-7M5 12h14",
  menu: "M4 6h16M4 12h16M4 18h16",
  clock: "M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  download: "M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4",
  expand: "M14 3h7v7M21 3l-7 7M10 21H3v-7m0 7 7-7",
};
export default defineComponent({
  props: { name: String, size: { default: 18 } },
  setup: (props) => () =>
    h(
      "svg",
      {
        width: props.size,
        height: props.size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.65,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "aria-hidden": "true",
        focusable: "false",
      },
      [h("path", { d: icons[props.name || "info"] || icons.info })],
    ),
});
</script>
