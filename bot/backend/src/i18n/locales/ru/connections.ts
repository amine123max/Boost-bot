import type { TranslatedCatalog } from "../../index.js";
export default {
  failed: "Не удалось завершить подключение. Проверьте сеть и повторите попытку.",
  feishuStartRefused: "Не удалось начать авторизацию в Feishu. Повторите попытку или используйте существующее приложение.",
  feishuDeclined: "Вы отменили авторизацию в Feishu.",
  feishuQrExpired: "Срок действия QR-кода истёк. Повторите попытку.",
  feishuAppRefused: "Feishu отклонил приложение. Проверьте App ID, App Secret и разрешения на работу с сообщениями.",
  feishuNoRefreshToken: "Feishu не предоставил данные для сохранения входа. Авторизуйтесь ещё раз.",
  feishuAuthExpired: "Срок действия авторизации истёк. Повторите попытку.",
  feishuAuthIncomplete: "Авторизация в Feishu не завершена. Повторите попытку.",
  notionUnavailable: "Не удалось связаться со службой входа Notion. Повторите попытку чуть позже.",
  notionUnexpected: "Служба входа Notion вернула неожиданный ответ.",
  notionRegistrationUnavailable: "Служба входа Notion не принимает новых клиентов.",
  notionRegistrationRefused: "Служба входа Notion не смогла зарегистрировать приложение.",
  notionLinkExpired: "Срок действия ссылки для входа истёк. Начните заново в настройках.",
  notionDeclined: "Вы отменили авторизацию.",
  notionAuthIncomplete: "Авторизация в Notion не завершена.",
  notionExchangeFailed: "Авторизация в Notion не завершена. Повторите попытку.",
} satisfies TranslatedCatalog["connections"];
