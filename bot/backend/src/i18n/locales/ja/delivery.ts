import type { TranslatedCatalog } from "../../index.js";
export default {
  "chWeixin": "WeChat",
  "chFeishu": "Feishu",
  "digestTasks": "バックグラウンドタスク {count} 件：",
  "digestReminders": "リマインダー {count} 件：",
  "digestMessages": "メッセージ {count} 件：",
  "listSep": "、",
  "andMore": "ほか",
  "nudgeReminders": "お届けするリマインダーがあと {count} 件あります（{list}{more}）。引き続き時間どおりに通知できるよう、「ok」と返信してください。",
  "nudgeResults": "お届けする結果があと {count} 件あります（{list}{more}）。続けて送信できるよう、「ok」と返信してください。",
  "nudgeMessages": "お届けするメッセージがあと {count} 件あります（{list}{more}）。続けて送信できるよう、「ok」と返信してください。",
  "ackReminder": "わかりました。その時間にお知らせします。",
  "ackSend": "わかりました。その時間に送信します。",
  "heldResults": {
    "other": "{channel} に未配信の結果 {count} 件"
  },
  "heldMessages": {
    "other": "{channel} に未配信のメッセージ {count} 件"
  },
  "failedResults": {
    "other": "{channel} に送信できなかった結果 {count} 件"
  },
  "failedMessages": {
    "other": "{channel} に送信できなかったメッセージ {count} 件"
  },
  "heldLine": "受け取るには {channel} でメッセージを送ってください",
  "head": "{title}。{line}",
  "retrying": "引き続き再試行中",
  "fileItem": "[ファイル {name}]",
  "goneTooLong": "待機時間が長すぎるため、送信を中止しました",
  "goneReplied": "すでにメッセージを受信しています",
  "goneKeptFailing": "送信が繰り返し失敗しました（{error}）",
  "goneFailed": "送信に失敗しました：{error}",
  "today": "今日 {hm}",
  "tonight": "今夜 {hm}",
  "tomorrowMorning": "明朝 {hm}",
  "tomorrow": "明日 {hm}",
  "weekday0": "日曜 {hm}",
  "weekday1": "月曜 {hm}",
  "weekday2": "火曜 {hm}",
  "weekday3": "水曜 {hm}",
  "weekday4": "木曜 {hm}",
  "weekday5": "金曜 {hm}",
  "weekday6": "土曜 {hm}",
  "date": "{month}{d}日 {hm}",
  "month1": "1月",
  "month2": "2月",
  "month3": "3月",
  "month4": "4月",
  "month5": "5月",
  "month6": "6月",
  "month7": "7月",
  "month8": "8月",
  "month9": "9月",
  "month10": "10月",
  "month11": "11月",
  "month12": "12月",
  "recovered": "アプリの再起動により、前回のメッセージ{preview}の処理が完了しませんでした。もう一度送信してください。",
  "quoted": "「{text}」"
} satisfies TranslatedCatalog["delivery"];
