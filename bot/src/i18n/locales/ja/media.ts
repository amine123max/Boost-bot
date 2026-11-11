import type { TranslatedCatalog } from "../../index.js";
export default {
  "pricePerSecond": "{price}/秒（{res}）",
  "pricePerImage": "{price}/枚",
  "pricePerCall": "{price}/回",
  "priceToken": "トークン数に応じて課金",
  "seconds": "{n} 秒",
  "references": {
    "other": "参照 {count} 件"
  },
  "summaryPrompt": "プロンプト：{prompt}",
  "summaryParams": "設定：{params}",
  "summaryPrice": "参考価格：{price}",
  "confirmHeaderImage": "画像を生成",
  "confirmHeaderVideo": "動画を生成",
  "confirmQuestionImage": "{model} でこの画像を生成しますか？",
  "confirmQuestionVideo": "{model} でこの動画を生成しますか？",
  "confirmDetail": "{summary}{reason}\n別のモデル名で返信することもできます。",
  "reasonCost": "推定費用は約 ${amount} で、${limit} を超えています",
  "reasonCostUnknown": "今回の費用は見積もれません",
  "tagDefault": "既定",
  "tagBotPick": "ボットが選択",
  "cancel": "キャンセル",
  "cancelDesc": "今回は生成しない"
} satisfies TranslatedCatalog["media"];
