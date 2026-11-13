import type { TranslatedCatalog } from "../../index.js";
export default {
  pricePerSecond: "{price}/с ({res})",
  pricePerImage: "{price}/изображение",
  pricePerCall: "{price}/вызов",
  priceToken: "оплата за токены",
  seconds: "{n} с",
  references: {
    one: "{count} образец",
    few: "{count} образца",
    many: "{count} образцов",
    other: "{count} образца",
  },
  summaryPrompt: "Запрос: {prompt}",
  summaryParams: "Настройки: {params}",
  summaryPrice: "Примерная цена: {price}",
  confirmHeaderImage: "Создать изображение",
  confirmHeaderVideo: "Создать видео",
  confirmQuestionImage: "Создать изображение с помощью {model}?",
  confirmQuestionVideo: "Создать видео с помощью {model}?",
  confirmDetail:
    "{summary}{reason}\nМожно также ответить названием другой модели.",
  reasonCost: "Примерная стоимость ${amount}, выше ${limit}",
  reasonCostUnknown: "Не удаётся оценить стоимость этого запуска",
  tagDefault: "по умолчанию",
  tagBotPick: "выбор бота",
  cancel: "Отмена",
  cancelDesc: "Не создавать в этот раз",
} satisfies TranslatedCatalog["media"];
