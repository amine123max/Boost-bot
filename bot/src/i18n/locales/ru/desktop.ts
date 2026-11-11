import type { TranslatedCatalog } from "../../index.js";
export default {
  trayOpen: "Открыть {product}",
  trayOpenInBrowser: "Открыть в браузере",
  trayAutostart: "Запускать при входе в систему",
  trayOpenDataDir: "Открыть папку данных",
  trayQuit: "Выйти",
  errorTitle: "В работе {product} возникла ошибка",
  errorDetail: "{message}\n\nПодробности в журнале: {log}",
  logDisabled: "(выключено)",
  bootFailed: "Не удалось запустить {product}",
  uiNotStarted: "Не удалось запустить локальный интерфейс",
  trayNeeds: "Требует внимания ({count})",
} satisfies TranslatedCatalog["desktop"];
