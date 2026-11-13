<script lang="ts">
import { defineComponent, h } from "vue";
const icons: Record<string, string> = {
  chevron: "m9 5 7 7-7 7",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  panel: "M3 5h18v14H3ZM15 5v14",
  plus: "M12 5v14M5 12h14",
  chat: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z",
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  search: "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  arrow: "M12 19V5m-6 6 6-6 6 6",
  stop: "M6 6h12v12H6Z",
  close: "m6 6 12 12M6 18 18 6",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  tasks: "M9 5h11M9 12h11M9 19h11m-7-1 2 2 3-3M3 5h.01M3 12h.01",
  check: "m5 12 4 4L19 6",
  info: "M12 7v6M12 16h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  refresh:
    "M20 7v5h-5M4 17v-5h5M6.1 6a8 8 0 0 1 13.2 3M4.7 15a8 8 0 0 0 13.2 3",
  grid: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5",
  back: "m12 19-7-7 7-7M5 12h14",
  menu: "M4 6h16M4 12h16M4 18h16",
  clock: "M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
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
