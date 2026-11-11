import type { TranslatedCatalog } from "../../index.js";
export default {
  failed: "接続を完了できませんでした。ネットワークを確認して、もう一度お試しください。",
  feishuStartRefused: "Feishu の認証を開始できませんでした。もう一度試すか、既存のアプリを使ってください。",
  feishuDeclined: "Feishu で認証をキャンセルしました。",
  feishuQrExpired: "QR コードの有効期限が切れました。もう一度お試しください。",
  feishuAppRefused: "Feishu にアプリが拒否されました。App ID、App Secret、メッセージの権限を確認してください。",
  feishuNoRefreshToken: "Feishu から継続利用に必要な認証情報を取得できませんでした。もう一度認証してください。",
  feishuAuthExpired: "認証の有効期限が切れました。もう一度お試しください。",
  feishuAuthIncomplete: "Feishu の認証が完了しませんでした。もう一度お試しください。",
  notionUnavailable: "Notion のログインサービスに接続できません。しばらくしてからお試しください。",
  notionUnexpected: "Notion のログインサービスから予期しない応答がありました。",
  notionRegistrationUnavailable: "Notion のログインサービスは新しいクライアントを受け付けていません。",
  notionRegistrationRefused: "Notion のログインサービスにアプリを登録できませんでした。",
  notionLinkExpired: "このログインリンクの有効期限が切れました。設定からやり直してください。",
  notionDeclined: "認証をキャンセルしました。",
  notionAuthIncomplete: "Notion の認証が完了しませんでした。",
  notionExchangeFailed: "Notion の認証が完了しませんでした。もう一度お試しください。",
} satisfies TranslatedCatalog["connections"];
