import type { TranslatedCatalog } from "../../index.js";
export default {
  sourceProgramFiles: "папка установки",
  sourcePath: "PATH",
  sourcePreview: "предварительная версия",
  sourceStore: "Microsoft Store",
  sourcePrivate: "управляется приложением",
  installWaiting: "подготовка",
  installDownloading: "загружено {received} / {total} МБ{pct}",
  installPct: " ({n}%)",
  installExtracting: "распаковка",
  installVerifying: "проверка подписи",
  installTesting: "пробный запуск",
  installDone: "установлено",
  installFailed: "не установлено: {error}",
  unknownReason: "причина неизвестна",
  slow: "агент выполняет команды через встроенный Windows PowerShell 5.1; каждая может занимать 20–30 секунд",
  statusChecking: "PowerShell: проверка",
  statusFallback:
    "; {from} не запустился ({reason}) и был заменён автоматически",
  statusOk: "PowerShell: {version} (агент выполняет через него команды)",
  statusOkPrivate:
    "PowerShell: {version} (управляется приложением; агент выполняет через него команды)",
  statusInstalling:
    "PowerShell: устанавливаем PowerShell 7 для агента… {progress}. До готовности команды выполняются через Windows PowerShell 5.1",
  statusPrivateBad:
    "PowerShell: PowerShell 7 приложения недоступен ({reason}), поэтому {slow}. Переустановите его одним нажатием в разделе «Настройки → Диагностика»",
  statusInstallFailed:
    "PowerShell: не удалось установить PowerShell 7 для агента ({error}), поэтому {slow}. Повторите в разделе «Настройки → Диагностика» или установите самостоятельно: {winget}",
  statusUnsupported: "PowerShell: {reason}, поэтому {slow}",
  statusSystemIssue:
    "системный PowerShell 7 недоступен ({issue}), поэтому {slow}",
  statusOld: "PowerShell {version} устарел, поэтому {slow}",
  statusNone: "PowerShell 7 не установлен, поэтому {slow}",
  adviceInstall:
    "Установите PowerShell 7 для более быстрых и надёжных команд: {winget} (или откройте {url})",
  advicePrivate:
    "Приложение может установить свою копию без прав администратора: «Настройки → Диагностика → Установить»; либо: {winget}",
  statusAdvice: "PowerShell: {now}. {how}",
  reportChecking: "[PowerShell] проверка",
  reportWhere: " · {path} ({source})",
  reportUnknownVersion: "7 (версия неизвестна)",
  reportOk:
    "[PowerShell] {version}{where} · агент выполняет через него команды",
  reportSystemIssue:
    "[PowerShell] системный PowerShell 7 недоступен{where} · {issue} · агент использует {using}",
  reportDshDefault51: "Windows PowerShell 5.1 (по умолчанию в DSH)",
  reportOld:
    "[PowerShell] {version} устарел{where} · рекомендуется установить PowerShell 7",
  reportNone:
    "[PowerShell] PowerShell 7 не установлен: агент выполняет команды через Windows PowerShell 5.1 (около 25 с на команду в песочнице против около 1 с в версии 7){forced}",
  reportForced: " · смоделировано через AMB_PWSH_FORCE",
  reportFallback: "  автоматическая замена {at}: {from} → {to} · {reason}",
  reportDshDefault: "по умолчанию в DSH",
  privateUnsupported: "невозможно установить: {reason}",
  privateReady: "готов · пробный запуск успешен{test}",
  privateTest: " ({ms} мс, {at})",
  privateBad: "недоступен: {reason}",
  privateUntested: "установлен, пробный запуск ещё не выполнен",
  privateNotInstalled: "не установлен",
  privateInstall: " · установка: {progress}",
  policySystem: "восстановлен системный вариант",
  policyAuto: "автоматическая установка при отсутствии версии 7",
  policyManual: "без автоматической установки",
  privateLine:
    "  PowerShell {version}{arch} приложения · {state}{inst}{dir} · {policy}{ignore}",
  whyMissing:
    "pwsh.exe не найден — возможно, удалён или помещён в карантин антивирусом",
  whyDenied: "нет прав на запуск — возможно, заблокирован защитным ПО",
  whyAntivirus: "заблокирован антивирусом",
  whyPolicy:
    "заблокирован системной политикой (AppLocker / политики ограниченного использования программ)",
  whyWdac: "заблокирован Windows Defender Application Control",
  whyBadExe: "файл повреждён или несовместим с этим компьютером",
  whyCorrupt: "файл повреждён",
  whyCantStart: "не удалось запустить",
  whyLine: "{why} ({detail})",
  agentCantStart: "агент не смог его запустить: {reason}",
  testFailed: "пробный запуск не удался: {error}",
  noticeInstalled:
    "PowerShell {version} установлен для агента и управляется приложением; ваш PowerShell не изменён. Команды будут выполняться намного быстрее.",
  noticeInstallFailed:
    "Не удалось установить PowerShell 7 для агента: {error}. Агент продолжит использовать Windows PowerShell 5.1; повторить можно в разделе «Настройки → Диагностика».",
  noticeSystemTestFailed:
    "Системный PowerShell ({path}) не прошёл пробный запуск: {error}. Теперь агент выполняет команды через {to}.",
  noticeFellBack:
    "PowerShell агента не запустился ({exe}: {reason}) и автоматически заменён на {to}; замена вступит в силу, когда агент освободится. Переустановить или проверить снова можно в разделе «Настройки → Диагностика».",
  descSystem51: "встроенный Windows PowerShell 5.1",
  descPrivate7: "PowerShell 7 приложения",
  privTimeout: "не завершилось за {s} с",
  privCantStart: "не удалось запустить: {error}",
  privUnexpected: "неожиданный вывод (код завершения {code}){out}",
  privColon: ": {text}",
  privRwFailed: "не удалось записать и прочитать временный файл",
  privExtFailed: "не удалось запустить внешнюю программу",
  privNot7: "версия {v}, а не PowerShell 7",
  privWrongVersion: "версия {v}, ожидалась {want}",
  privSigTimeout:
    "Windows PowerShell не вернул результат проверки подписи за 3 минуты",
  privSigFailed: "Windows PowerShell не смог проверить подпись: {error}",
  privExitCode: "код завершения {code}",
  privSigUnreadable: "не удалось прочитать результат проверки подписи: {out}",
  privSigCount: "неверное число результатов проверки подписи",
  privSigInvalid: "Недействительная подпись {name} ({status})",
  privNoSig: "без подписи",
  privNotMs: "{name} подписан не Microsoft ({subject})",
  privUnzipFailed: "не удалось распаковать: {error}",
  privTimedOut: "время истекло",
  privOldWindows:
    "Версия Windows на этом компьютере устарела ({release}); для PowerShell {version} требуется Windows 10 1607 / Windows Server 2016 или новее",
  privStall: "данные не поступали {s} с",
  privDownloadTimeout: "время загрузки истекло",
  privSizeWrong: "неверный размер файла ({len} байт, ожидалось {size})",
  privTooBig: "файл больше ожидаемого (свыше {size} байт)",
  privHash: "SHA256 не совпадает ({got}…, ожидался {want}…)",
  privWindowsOnly: "требуется только в Windows",
  privNoArch:
    "для архитектуры процессора этого компьютера нет пакета PowerShell 7",
  privFileMissing:
    "файл {file} отсутствует — возможно, удалён или помещён в карантин антивирусом",
  privSigNotPassed: "проверка подписи не пройдена: {error}",
  privArchUnsupported: "неподдерживаемая архитектура процессора",
  privInstalling: "установка",
  privBadCopy:
    "установленная копия недоступна ({reason}); переустановите вручную",
  privAlreadyInstalled: "уже установлен",
  privAutoFailedN: "неудачных автоматических установок: {n}",
  privAutoBackoff:
    "последняя автоматическая установка не удалась; повторим позже",
  privCantInstall: "невозможно установить на этот компьютер",
  privMkdir: "не удалось создать папку установки {dir}: {error}",
  privOtherInstalling:
    "другой экземпляр Boost уже некоторое время устанавливает PowerShell 7; повторите позже",
  privOtherWaiting:
    "другой экземпляр Boost устанавливает PowerShell 7; ожидаем завершения",
  privDiscarded: "загруженный файл не прошёл проверку и удалён: {error}",
  privDownloadFailed: "ошибка загрузки ({url}): {error}",
  privExtractedVersion: "распакована версия {v}, ожидалась {want}",
  privUnknown: "неизвестно",
  privMissingAfterExtract:
    "после распаковки отсутствует {file}; возможно, файл заблокирован антивирусом",
  privInUse:
    "старая копия используется и не может быть заменена ({error}); повторите позже",
  privCantPlace: "не удалось переместить в папку установки: {error}",
} satisfies TranslatedCatalog["pwsh"];
