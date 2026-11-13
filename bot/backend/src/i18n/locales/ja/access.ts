import type { TranslatedCatalog } from "../../index.js";
export default {
  "refusal": "このボットの利用はまだ許可されていません。所有者に通知しました。承認されると、すぐに会話を始められます。",
  "approved": "所有者が利用を承認しました。これから私と会話できます。",
  "chWeixin": "WeChat",
  "chFeishu": "Feishu",
  "chWeb": "Web",
  "who": "{channel} のユーザー {name}",
  "ownerNotice": "ボット「{bot}」の利用申請が届きました：{who}{said}\n許可するには「yes {code}」、拒否するには「no {code}」と返信してください。Boost の情報パネルからも対応できます。",
  "allowedAck": "✅「{who}」によるこのボットの利用を許可しました",
  "deniedAck": "❌「{who}」の利用申請を拒否しました",
  "ownerOf": "{channel} の所有者{who}",
  "notSet": "は未設定",
  "listSep": "、",
  "pendingRequests": "。利用申請 {count} 件が承認待ちです（「yes <code>」と返信するか、アプリの情報パネルから対応できます）",
  "policy": "利用できる人：所有者と許可リストのユーザーのみ（{owners}、許可済み {allowed} 人）{req}",
  "said": "：「{text}」"
} satisfies TranslatedCatalog["access"];
