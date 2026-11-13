import type { TranslatedCatalog } from "../../index.js";
export default {
  "refusal": "아직 이 봇의 사용 허가를 받지 않았습니다. 소유자에게 알렸으며, 승인되면 바로 대화할 수 있습니다.",
  "approved": "소유자가 사용을 승인했습니다. 이제 저와 대화할 수 있습니다.",
  "chWeixin": "WeChat",
  "chFeishu": "Feishu",
  "chWeb": "웹",
  "who": "{channel} 사용자 {name}",
  "ownerNotice": "‘{bot}’ 봇의 사용 요청이 있습니다: {who}{said}\n허용하려면 ‘yes {code}’, 거부하려면 ‘no {code}’라고 답하거나 Boost의 정보 패널에서 처리하세요.",
  "allowedAck": "✅ ‘{who}’ 님의 봇 사용을 허용했습니다",
  "deniedAck": "❌ ‘{who}’ 님의 요청을 거부했습니다",
  "ownerOf": "{channel} 소유자{who}",
  "notSet": " 미설정",
  "listSep": ", ",
  "pendingRequests": "; 사용 요청 {count}개 대기 중(‘yes <code>’로 답하거나 앱의 정보 패널에서 처리하세요)",
  "policy": "사용 가능한 사람: 소유자와 허용 목록에 있는 사람만({owners}; {allowed}명 허용됨){req}",
  "said": ": ‘{text}’"
} satisfies TranslatedCatalog["access"];
