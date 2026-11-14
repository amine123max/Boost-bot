import type { MessengerId } from "../../core/types.js";
import type { Store } from "../../store/db.js";
import { DiscordTransport } from "./discord.js";
import { SlackTransport } from "./slack.js";
import { TelegramTransport } from "./telegram.js";
import { DingTalkTransport } from './dingtalk.js';
import { QQTransport } from './qq.js';
import type { MessengerTransport } from "./transport.js";

/** 每个平台要填的凭据（界面的输入框也按这个来） */
export const MESSENGER_FIELDS: Readonly<Record<MessengerId, readonly string[]>> = {
  telegram: ["token"],
  slack: ["botToken", "appToken"],
  discord: ["token"],
  dingtalk: ['clientId', 'clientSecret'],
  qq: ['appId', 'clientSecret'],
};

/** Telegram 长轮询收到哪了：存在 KV 里，重启后接着收；换了机器人要清掉 */
export const telegramOffsetKey = (botId: string) => `telegram-offset:${botId}`;

export function createTransport(id: MessengerId, botId: string, credentials: Record<string, string>, store: Store): MessengerTransport {
  switch (id) {
    case 'dingtalk': return new DingTalkTransport(credentials.clientId, credentials.clientSecret);
    case 'qq': return new QQTransport(credentials.appId, credentials.clientSecret, {
      sandbox: credentials.sandbox === 'true',
      context: {
        get: chat => { try { return JSON.parse(store.getKV(`qq-reply:${botId}:${credentials.appId}:${credentials.sandbox || 'false'}:${chat}`) || 'null') || undefined; } catch { return undefined; } },
        set: (chat, value) => store.setKV(`qq-reply:${botId}:${credentials.appId}:${credentials.sandbox || 'false'}:${chat}`, JSON.stringify(value)),
      },
    });
    case "telegram":
      return new TelegramTransport(credentials.token, {
        offset: {
          get: () => Number(store.getKV(telegramOffsetKey(botId)) ?? 0) || 0,
          set: (n) => store.setKV(telegramOffsetKey(botId), String(n)),
        },
      });
    case "slack":
      return new SlackTransport(credentials.botToken, credentials.appToken);
    case "discord":
      return new DiscordTransport(credentials.token);
  }
}
