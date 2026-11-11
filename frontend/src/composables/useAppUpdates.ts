import { computed, onBeforeUnmount, onMounted, reactive, watch } from "vue";
import { appClient } from "@/lib/api/app-client";
import type {
  PendingUpdateResult,
  UpdateCheckResult,
} from "@/lib/api/app-updates";
import { getAppErrorMessage, isTauriRuntime } from "@/lib/api/transport";
import { boost } from "./useBoost";
import { notify } from "./useNotifications";

export const appUpdates = reactive({
  currentVersion: "",
  repo: "",
  check: null as UpdateCheckResult | null,
  pending: null as PendingUpdateResult | null,
  checking: false,
  preparing: false,
  applying: false,
  error: "",
  dialogOpen: false,
});
export const updateBusy = computed(
  () => appUpdates.checking || appUpdates.preparing || appUpdates.applying,
);
let announcedTag = "";

export async function checkAppUpdate(manual = true) {
  if (!isTauriRuntime() || updateBusy.value) return;
  appUpdates.checking = true;
  appUpdates.error = "";
  try {
    const result = await appClient.checkUpdate();
    appUpdates.check = result;
    appUpdates.currentVersion = result.currentVersion;
    appUpdates.repo = result.repo;
    if (
      !result.hasUpdate ||
      appUpdates.pending?.releaseTag !== result.releaseTag
    )
      appUpdates.pending = null;
    if (result.hasUpdate && (manual || announcedTag !== result.releaseTag)) {
      announcedTag = result.releaseTag;
      appUpdates.dialogOpen = true;
    } else if (manual && !result.hasUpdate) {
      notify("当前版本已是最新");
    }
  } catch (error) {
    appUpdates.error = getAppErrorMessage(error);
    if (manual) notify(`检查更新失败：${appUpdates.error}`, true);
  } finally {
    appUpdates.checking = false;
  }
}

export async function prepareAppUpdate() {
  if (!isTauriRuntime() || updateBusy.value || !appUpdates.check?.canPrepare)
    return;
  appUpdates.preparing = true;
  appUpdates.error = "";
  try {
    const result = await appClient.prepareUpdate();
    if (!result.prepared) throw new Error("更新尚未准备完成，请重试");
    const status = await appClient.getStatus();
    appUpdates.pending = status.pending;
    if (!status.pending) throw new Error("未找到已下载的更新，请重试");
    notify("更新已下载，可安装新版本");
  } catch (error) {
    appUpdates.error = getAppErrorMessage(error);
    notify(`下载更新失败：${appUpdates.error}`, true);
  } finally {
    appUpdates.preparing = false;
  }
}

export async function applyAppUpdate() {
  if (!isTauriRuntime() || updateBusy.value || !appUpdates.pending) return;
  appUpdates.applying = true;
  appUpdates.error = "";
  try {
    const result = appUpdates.pending.isPortable
      ? await appClient.applyUpdatePortable()
      : await appClient.launchInstaller();
    if (!result.ok) throw new Error(result.message || "启动更新失败");
    notify(result.message || "已启动更新");
    appUpdates.pending = null;
    appUpdates.dialogOpen = false;
  } catch (error) {
    appUpdates.error = getAppErrorMessage(error);
    notify(`安装更新失败：${appUpdates.error}`, true);
  } finally {
    appUpdates.applying = false;
  }
}

// Mount once in the main window. Tray preview windows do not check for updates.
export function useAutomaticAppUpdates() {
  let timer: ReturnType<typeof setInterval> | undefined;
  const stopWatching = watch(
    () =>
      isTauriRuntime() &&
      boost.ready &&
      boost.settings?.updateAutoCheck === true,
    (enabled) => {
      clearInterval(timer);
      timer = undefined;
      if (!enabled) return;
      void checkAppUpdate(false);
      timer = setInterval(() => void checkAppUpdate(false), 24 * 60 * 60 * 1000);
    },
    { immediate: true },
  );
  onMounted(async () => {
    if (!isTauriRuntime()) return;
    try {
      const status = await appClient.getStatus();
      appUpdates.currentVersion = status.currentVersion;
      appUpdates.repo = status.repo;
      if (
        !appUpdates.pending &&
        !appUpdates.preparing &&
        !appUpdates.applying &&
        (!appUpdates.check ||
          (appUpdates.check.hasUpdate &&
            status.pending?.releaseTag === appUpdates.check.releaseTag))
      )
        appUpdates.pending = status.pending;
      // A status read must not overwrite a newer check already in progress.
      if (!appUpdates.check && !appUpdates.checking) {
        appUpdates.check = status.lastCheck;
        appUpdates.error = status.lastError || "";
      }
    } catch (error) {
      appUpdates.error = getAppErrorMessage(error);
    }
  });
  onBeforeUnmount(() => {
    stopWatching();
    clearInterval(timer);
  });
}
