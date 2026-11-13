import type { TranslatedCatalog } from "../../index.js";
export default {
  refusal:
    "Вам пока не разрешён доступ к этому боту; владелец уведомлён. После его разрешения можно сразу начать общение.",
  approved: "Владелец разрешил доступ. Теперь вы можете общаться со мной.",
  chWeixin: "WeChat",
  chFeishu: "Feishu",
  chWeb: "веб",
  who: "пользователь {channel} {name}",
  ownerNotice:
    "Кто-то хочет пользоваться ботом «{bot}»: {who}{said}\nОтветьте «yes {code}», чтобы разрешить, или «no {code}», чтобы отказать. Также запрос можно обработать на панели сведений Boost.",
  allowedAck: "✅ Пользователю «{who}» разрешён доступ к боту",
  deniedAck: "❌ Пользователю «{who}» отказано",
  ownerOf: "владелец в {channel}{who}",
  notSet: " не задан",
  listSep: ", ",
  pendingRequests:
    "; ожидают запросы на доступ: {count} (ответьте «yes <code>» или обработайте их на панели сведений)",
  policy:
    "Доступ: только владельцы и разрешённые пользователи ({owners}; разрешено: {allowed}){req}",
  said: ": «{text}»",
} satisfies TranslatedCatalog["access"];
