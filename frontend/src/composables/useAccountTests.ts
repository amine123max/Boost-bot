import { computed, reactive, ref } from "vue";
import { accountClient } from "@/lib/api/account-client";
import { getAppErrorMessage } from "@/lib/api/transport";
import { runAccountTests, type AccountTest } from "@/lib/account-tests";
import { boost, eligibleAccounts, notify, refreshAccounts } from "./useBoost";
import { usePendingActions } from "./usePendingActions";
const { run, isPending } = usePendingActions();
const results = reactive<Record<string, AccountTest>>({});
const running = ref(false);
const pendingSelection = ref(false);
const completed = computed(
  () =>
    eligibleAccounts.value.filter((a) =>
      ["success", "failed"].includes(results[a.id]?.state),
    ).length,
);
const succeeded = computed(
  () =>
    eligibleAccounts.value.filter((a) => results[a.id]?.state === "success")
      .length,
);
async function testOne(accountId: string) {
  return run(accountId, async () => {
    results[accountId] = {
      accountId,
      state: "running",
      message: "",
      testedAt: null,
    };
    try {
      await accountClient.refreshUsage(accountId);
      results[accountId] = {
        accountId,
        state: "success",
        message: "额度接口可用",
        testedAt: Date.now(),
      };
    } catch (e) {
      results[accountId] = {
        accountId,
        state: "failed",
        message: getAppErrorMessage(e),
        testedAt: Date.now(),
      };
    }
  });
}
async function testAll(id?: string) {
  if (id ? isPending(id) : running.value) return;
  if (!id) running.value = true;
  try {
    const accounts = eligibleAccounts.value.filter((a) => !id || a.id === id);
    if (!accounts.length) {
      notify("没有可测试的账号，请先导入或启用账号", true);
      return;
    }
    await runAccountTests(accounts, (a) => testOne(a.id));
    await refreshAccounts().catch((e) =>
      notify(`刷新账号数据失败：${getAppErrorMessage(e)}`, true),
    );
    notify(
      `检测完成：${accounts.filter((a) => results[a.id]?.state === "success").length} / ${accounts.length} 个账号接口可用`,
    );
  } catch (e) {
    notify(getAppErrorMessage(e), true);
  } finally {
    if (!id) running.value = false;
  }
}
export function useAccountTests() {
  return {
    results,
    running,
    pendingSelection,
    completed,
    succeeded,
    testAll,
    isPending,
  };
}
