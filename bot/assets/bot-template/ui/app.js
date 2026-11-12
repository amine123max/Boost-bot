// 界面只显示 app/state.json（useBot().state），改数据都交给 Bot（send）。
import { html, mount, useBot, Page, Card, Stack, Empty } from "/boost-bot/amb/botapp/kit/kit.js";

function App() {
  const bot = useBot();
  if (!bot.ready) return null;
  const state = bot.state || {};
  const items = state.items || [];
  return html`<${Page} title=${state.title}>
    ${items.length
      ? html`<${Stack}>${items.map((it) => html`<${Card} key=${it.id} on=${it.changed}>${it.text}<//>`)}<//>`
      : html`<${Empty}>${bot.t("empty")}<//>`}
  <//>`;
}

mount(App);
