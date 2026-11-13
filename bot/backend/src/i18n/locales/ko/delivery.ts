import type { TranslatedCatalog } from "../../index.js";
export default {
  "chWeixin": "WeChat",
  "chFeishu": "Feishu",
  "digestTasks": "백그라운드 작업 {count}개:",
  "digestReminders": "알림 {count}개:",
  "digestMessages": "메시지 {count}개:",
  "listSep": ", ",
  "andMore": " 외",
  "nudgeReminders": "전할 알림이 {count}개 더 있습니다({list}{more}). 제시간에 계속 알려 드릴 수 있도록 ‘ok’라고 답해 주세요.",
  "nudgeResults": "전할 결과가 {count}개 더 있습니다({list}{more}). 계속 보내 드릴 수 있도록 ‘ok’라고 답해 주세요.",
  "nudgeMessages": "전할 메시지가 {count}개 더 있습니다({list}{more}). 계속 보내 드릴 수 있도록 ‘ok’라고 답해 주세요.",
  "ackReminder": "알겠습니다. 그때 알려 드릴게요.",
  "ackSend": "알겠습니다. 그때 보내 드릴게요.",
  "heldResults": {
    "other": "{channel}에 전달하지 못한 결과 {count}개"
  },
  "heldMessages": {
    "other": "{channel}에 전달하지 못한 메시지 {count}개"
  },
  "failedResults": {
    "other": "{channel}로 전송 실패한 결과 {count}개"
  },
  "failedMessages": {
    "other": "{channel}로 전송 실패한 메시지 {count}개"
  },
  "heldLine": "받으려면 {channel}에서 메시지를 보내세요",
  "head": "{title}. {line}",
  "retrying": "계속 재시도 중",
  "fileItem": "[파일 {name}]",
  "goneTooLong": "대기 시간이 너무 길어 전송을 종료했습니다",
  "goneReplied": "이미 메시지를 보냈습니다",
  "goneKeptFailing": "전송이 계속 실패했습니다({error})",
  "goneFailed": "전송 실패: {error}",
  "today": "오늘 {hm}",
  "tonight": "오늘 밤 {hm}",
  "tomorrowMorning": "내일 아침 {hm}",
  "tomorrow": "내일 {hm}",
  "weekday0": "일요일 {hm}",
  "weekday1": "월요일 {hm}",
  "weekday2": "화요일 {hm}",
  "weekday3": "수요일 {hm}",
  "weekday4": "목요일 {hm}",
  "weekday5": "금요일 {hm}",
  "weekday6": "토요일 {hm}",
  "date": "{month} {d}일 {hm}",
  "month1": "1월",
  "month2": "2월",
  "month3": "3월",
  "month4": "4월",
  "month5": "5월",
  "month6": "6월",
  "month7": "7월",
  "month8": "8월",
  "month9": "9월",
  "month10": "10월",
  "month11": "11월",
  "month12": "12월",
  "recovered": "앱이 다시 시작되어 마지막 메시지{preview}의 처리를 완료하지 못했습니다. 다시 보내 주세요.",
  "quoted": " ‘{text}’"
} satisfies TranslatedCatalog["delivery"];
