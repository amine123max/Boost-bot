import type { TranslatedCatalog } from "../../index.js";
export default {
  invalid_key: "{name} не принял этот ключ. Проверьте его и попробуйте снова",
  rate_limited: "{name} сейчас ограничивает запросы. Попробуйте чуть позже",
  network: "Не удаётся подключиться к {name}. Если этому устройству нужен прокси, сначала настройте его",
  upstream: "{name} не вернул список моделей: {detail}",
} satisfies TranslatedCatalog["official"];
