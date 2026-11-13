import type { TranslatedCatalog } from "../../index.js";
export default {
  "pricePerSecond": "초당 {price}({res})",
  "pricePerImage": "이미지당 {price}",
  "pricePerCall": "호출당 {price}",
  "priceToken": "토큰 단위 과금",
  "seconds": "{n}초",
  "references": {
    "other": "참고 자료 {count}개"
  },
  "summaryPrompt": "프롬프트: {prompt}",
  "summaryParams": "설정: {params}",
  "summaryPrice": "예상 가격: {price}",
  "confirmHeaderImage": "이미지 생성",
  "confirmHeaderVideo": "동영상 생성",
  "confirmQuestionImage": "{model}로 이 이미지를 생성할까요?",
  "confirmQuestionVideo": "{model}로 이 동영상을 생성할까요?",
  "confirmDetail": "{summary}{reason}\n다른 모델 이름으로 답해도 됩니다.",
  "reasonCost": "예상 비용이 약 ${amount}로 ${limit}를 초과합니다",
  "reasonCostUnknown": "이번 실행의 비용을 예상할 수 없습니다",
  "tagDefault": "기본값",
  "tagBotPick": "봇이 선택",
  "cancel": "취소",
  "cancelDesc": "이번에는 생성하지 않음"
} satisfies TranslatedCatalog["media"];
