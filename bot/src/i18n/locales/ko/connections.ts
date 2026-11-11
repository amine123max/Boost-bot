import type { TranslatedCatalog } from "../../index.js";
export default {
  failed: "연결을 완료하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.",
  feishuStartRefused: "Feishu 인증을 시작하지 못했습니다. 다시 시도하거나 기존 앱을 사용하세요.",
  feishuDeclined: "Feishu에서 인증을 취소했습니다.",
  feishuQrExpired: "QR 코드가 만료되었습니다. 다시 시도하세요.",
  feishuAppRefused: "Feishu가 이 앱을 거부했습니다. App ID, App Secret 및 메시지 권한을 확인하세요.",
  feishuNoRefreshToken: "Feishu에서 로그인 유지에 필요한 인증 정보를 받지 못했습니다. 다시 인증하세요.",
  feishuAuthExpired: "인증이 만료되었습니다. 다시 시도하세요.",
  feishuAuthIncomplete: "Feishu 인증이 완료되지 않았습니다. 다시 시도하세요.",
  notionUnavailable: "Notion 로그인 서비스에 연결할 수 없습니다. 잠시 후 다시 시도하세요.",
  notionUnexpected: "Notion 로그인 서비스에서 예상하지 못한 응답을 받았습니다.",
  notionRegistrationUnavailable: "Notion 로그인 서비스에서 새 클라이언트를 받지 않습니다.",
  notionRegistrationRefused: "Notion 로그인 서비스에 앱을 등록하지 못했습니다.",
  notionLinkExpired: "이 로그인 링크는 만료되었습니다. 설정에서 다시 시작하세요.",
  notionDeclined: "인증을 취소했습니다.",
  notionAuthIncomplete: "Notion 인증이 완료되지 않았습니다.",
  notionExchangeFailed: "Notion 인증이 완료되지 않았습니다. 다시 시도하세요.",
} satisfies TranslatedCatalog["connections"];
