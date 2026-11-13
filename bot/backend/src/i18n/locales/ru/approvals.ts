import type { TranslatedCatalog } from "../../index.js";
export default {
  noSuchCode:
    "⚠️ Запрос {code} не ожидает разрешения: возможно, он истёк или уже обработан",
  needCode: "Ожидают разрешения: {count}. Ответьте с кодом, например y {code}",
  expiredOrDone: "⚠️ Запрос {code} истёк или уже обработан",
  approved: "✅ Запрос {code} разрешён (только на этот раз)",
  rejected: "❌ В запросе {code} отказано",
  prompt: "Нужно разрешение: {tool}{cmd}{why} — ответьте y {code} / n {code}",
  promptWhy: " ({reason})",
  hintMulti:
    "(Каждый ответ — с новой строки: укажите номер варианта или напишите ответ)",
  hintOptions: "(Ответьте номером варианта{multi} или напишите свой ответ)",
  hintOptionsMulti: " или несколькими через запятую",
  hintFree: "(Напишите ответ)",
  replyYesNo:
    "Ответьте y {code}, чтобы разрешить, или n {code}, чтобы отказать",
  quoteNeedsAnswer: "Напишите ответ, цитируя сообщение",
  alreadyAnswered: "На этот вопрос уже ответили",
  taskApproval:
    "Нужно разрешение (задача «{title}»): {what} — ответьте y {code} / n {code}",
  taskQuestion: "❓ Вопрос от «{title}»: {question}",
  taskHintOptions:
    "(ответьте номером{multi} или процитируйте это сообщение с ответом)",
  taskHintMulti: "; можно выбрать несколько",
  taskHintQuote: "(процитируйте это сообщение с ответом)",
  taskDefault: "Без ответа будет выбран вариант: {answer}",
  allowOnce: "Разрешить один раз",
  deny: "Отказать",
} satisfies TranslatedCatalog["approvals"];
