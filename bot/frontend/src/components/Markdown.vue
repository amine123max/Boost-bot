<script lang="ts">
import { defineComponent, h } from "vue";
import { parseMarkdown } from "../../compat/lib/markdown.js";
interface Inline {
  t: string;
  text?: string;
  href?: string;
  c?: Array<string | Inline>;
}
interface Block {
  t: string;
  text?: string;
  c: Array<string | Inline> & Block[];
  level: number;
  start?: number;
  items: Array<{ c: Array<string | Inline>; sub: Block[] }>;
  head: Array<Array<string | Inline>>;
  rows: Array<Array<Array<string | Inline>>>;
}
function inline(
  nodes: Array<string | Inline>,
): Array<string | ReturnType<typeof h>> {
  return nodes.map((n) =>
    typeof n === "string"
      ? n
      : n.t === "br"
        ? h("br")
        : n.t === "code"
          ? h("code", n.text)
          : n.t === "a"
            ? h(
                "a",
                { href: n.href, target: "_blank", rel: "noopener noreferrer" },
                inline(n.c || []),
              )
            : h(
                ({ b: "strong", i: "em", s: "del" } as Record<string, string>)[
                  n.t
                ] || "span",
                inline(n.c || []),
              ),
  );
}
function blocks(nodes: Block[]): ReturnType<typeof h>[] {
  return nodes.map((b) => {
    if (b.t === "code") return h("pre", [h("code", b.text)]);
    if (b.t === "hr") return h("hr");
    if (b.t === "quote") return h("blockquote", blocks(b.c));
    if (b.t === "ul" || b.t === "ol")
      return h(
        b.t,
        { start: b.start },
        b.items.map((it) => h("li", [...inline(it.c), ...blocks(it.sub)])),
      );
    if (b.t === "table")
      return h("div", { class: "table-scroll" }, [
        h("table", [
          h("thead", [
            h(
              "tr",
              b.head.map((c) => h("th", inline(c))),
            ),
          ]),
          h(
            "tbody",
            b.rows.map((r) =>
              h(
                "tr",
                r.map((c) => h("td", inline(c))),
              ),
            ),
          ),
        ]),
      ]);
    return h(b.t === "h" ? `h${Math.min(4, b.level)}` : "p", inline(b.c || []));
  });
}
export default defineComponent({
  props: { text: String },
  setup: (props) => () =>
    h(
      "div",
      { class: "md message-markdown" },
      blocks(parseMarkdown(props.text || "") as Block[]),
    ),
});
</script>
