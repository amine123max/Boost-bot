// 添加数据账号时显示给用户的授权错误；工具调用的诊断文字仍保留英文。
import type { Catalog } from "../types.js";

export const zh = {
  failed: "连接未能完成，请检查网络后重试。",
  feishuStartRefused: "飞书未能开始授权，请重试，或使用已有的应用。",
  feishuDeclined: "你在飞书中取消了授权。",
  feishuQrExpired: "二维码已过期，请重试。",
  feishuAppRefused: "飞书拒绝了这个应用，请检查 App ID、App Secret 和消息权限。",
  feishuNoRefreshToken: "飞书没有返回长期登录凭据，请重新授权。",
  feishuAuthExpired: "授权已过期，请重试。",
  feishuAuthIncomplete: "飞书授权未完成，请重试。",
  notionUnavailable: "无法连接 Notion 登录服务，请稍后重试。",
  notionUnexpected: "Notion 登录服务返回了无法识别的内容，请重试。",
  notionRegistrationUnavailable: "Notion 登录服务暂不接受新客户端，请稍后重试。",
  notionRegistrationRefused: "Notion 登录服务未能注册此应用，请重试。",
  notionLinkExpired: "此登录链接已过期，请从设置中重新开始。",
  notionDeclined: "你取消了授权。",
  notionAuthIncomplete: "Notion 授权未完成。",
  notionExchangeFailed: "Notion 授权未完成，请重试。",
} satisfies Catalog;

export const en: Catalog<typeof zh> = {
  failed: "The connection could not be completed. Check your network and try again.",
  feishuStartRefused: "Feishu refused to start. Try again, or use an app you already have.",
  feishuDeclined: "You declined in Feishu.",
  feishuQrExpired: "The QR code expired. Try again.",
  feishuAppRefused: "Feishu refused this app. Check the App ID and Secret, and that the app has the message permissions.",
  feishuNoRefreshToken: "Feishu didn't give a long-lived sign-in. Try again.",
  feishuAuthExpired: "The authorization expired. Try again.",
  feishuAuthIncomplete: "Feishu didn't complete the authorization. Try again.",
  notionUnavailable: "Could not reach Notion's sign-in service. Try again in a moment.",
  notionUnexpected: "Notion's sign-in service gave an unexpected reply.",
  notionRegistrationUnavailable: "Notion's sign-in service doesn't accept new clients.",
  notionRegistrationRefused: "Notion's sign-in service refused to register this app.",
  notionLinkExpired: "This sign-in link has expired. Start again from Settings.",
  notionDeclined: "You declined the authorization.",
  notionAuthIncomplete: "Notion didn't complete the authorization.",
  notionExchangeFailed: "Notion didn't complete the authorization. Try again.",
};
