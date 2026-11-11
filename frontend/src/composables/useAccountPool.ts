import { computed, ref, watch } from "vue";
import type { Account } from "@/types";
import { accountClient } from "@/lib/api/account-client";
import { getAppErrorMessage } from "@/lib/api/transport";
import { boost, notify, refreshAccounts } from "./useBoost";
import { serviceClient } from "@/lib/api/service-client";
import {
  orderAccountsBySize,
  planAccountNumbers,
  runAccountBatch,
} from "@/lib/account-workflows";
import {
  usageRefreshError,
  exportSummary,
} from "@/lib/account-feedback";

export function useAccountPool(busy: { value: boolean }) {
  const selected = ref<string[]>([]);
  const action = ref("");
  const confirming = ref("");
  const targets = ref<string[]>([]);
  const numberingStart = ref(1);
  const exportMode = ref<"single" | "multiple">("multiple");
  const resetAccount = ref<Account | null>(null);
  const working = ref("");
  watch(
    () => boost.accounts.map((a) => a.id),
    (ids) => {
      selected.value = selected.value.filter((id) => ids.includes(id));
    },
  );
  const scope = computed(() =>
    selected.value.length
      ? boost.accounts.filter((a) => selected.value.includes(a.id))
      : boost.accounts,
  );
  function toggle(id: string) {
    selected.value = selected.value.includes(id)
      ? selected.value.filter((value) => value !== id)
      : [...selected.value, id];
  }
  function selectVisible(accounts: Account[]) {
    const allSelected = accounts.every((a) => selected.value.includes(a.id));
    const ids = new Set(selected.value);
    for (const a of accounts) allSelected ? ids.delete(a.id) : ids.add(a.id);
    selected.value = [...ids];
  }
  async function execute(
    task: () => Promise<unknown>,
    message?: string,
    errorPrefix = "账号操作失败",
  ) {
    if (busy.value) return;
    if (!boost.connected) {
      working.value = "";
      notify("服务未连接，暂时无法操作账号", true);
      return;
    }
    busy.value = true;
    try {
      await task();
      if (message) notify(message);
    } catch (e) {
      const message = getAppErrorMessage(e);
      notify(
        `${errorPrefix}: ${errorPrefix === "刷新失败" ? usageRefreshError(message) : message}`,
        true,
      );
    } finally {
      await refreshAccounts().catch((e) =>
        notify(`刷新账号列表失败: ${getAppErrorMessage(e)}`, true),
      );
      busy.value = false;
      working.value = "";
    }
  }
  async function batch(
    ids: string[],
    operation: (id: string) => Promise<unknown>,
  ) {
    const result = await runAccountBatch(ids, operation);
    if (result.failed.length)
      throw new Error(
        `成功 ${result.succeeded} 个，失败 ${result.failed.length} 个：${result.failed[0]}`,
      );
    return result;
  }
  async function chooseAction(command?: string) {
    const value = command || action.value;
    action.value = "";
    if (!value || busy.value) return;
    targets.value = scope.value.map((a) => a.id);
    if (["delete", "cleanup", "export", "number"].includes(value)) {
      if (value === "delete" && !selected.value.length) {
        notify("请先选择要删除的账号", true);
        return;
      }
      confirming.value = value;
      return;
    }
    working.value = value;
    const errors: Record<string, string> = {
      refresh: "刷新失败",
      tokens: "批量刷新 AT/RT 失败",
      list: "刷新账号列表失败",
      large: "调整账号顺序失败",
      small: "调整账号顺序失败",
    };
    await execute(
      async () => {
        if (value === "list") {
          await refreshAccounts();
          notify("账号列表已刷新");
        }
        if (value === "refresh") {
          if (!scope.value.some((a) => a.status !== "disabled")) {
            notify("当前没有可刷新的账号");
            return;
          }
          if (!selected.value.length) await accountClient.refreshUsage();
          else
            await batch(
              scope.value
                .filter((a) => a.status !== "disabled")
                .map((a) => a.id),
              (id) => accountClient.refreshUsage(id),
            );
          notify("账号用量已刷新");
        }
        if (value === "tokens") {
          if (!selected.value.length) {
            const result = await accountClient.refreshAllChatgptAuthTokens();
            const first = result.results?.find((item) => !item.ok);
            notify(
              `AT/RT 刷新完成：成功${result.succeeded || 0}个，${result.failed ? `失败${result.failed}个，` : ""}跳过${result.skipped || 0}个${result.failed && first?.message ? `；首个失败：${first.message}` : ""}`,
              Boolean(result.failed),
            );
          } else {
            await batch(targets.value, (id) =>
              accountClient.refreshChatgptAuthTokens(id),
            );
            notify("账号 AT/RT 已刷新");
          }
        }
        if (value === "enable" || value === "disable") {
          await batch(targets.value, (id) =>
            value === "enable"
              ? accountClient.enableAccount(id)
              : accountClient.disableAccount(id),
          );
          notify(
            `已${value === "enable" ? "启用" : "禁用"} ${targets.value.length} 个账号`,
          );
        }
        if (value === "large" || value === "small") {
          const plan = planAccountNumbers(
            orderAccountsBySize(scope.value, value === "large").map(
              (a) => a.id,
            ),
            1,
          );
          await batch(
            plan.map((a) => a.id),
            (id) =>
              accountClient.updateSort(id, plan.find((a) => a.id === id)!.sort),
          );
          notify(`账号顺序已调整（${plan.length} 项）`);
        }
      },
      undefined,
      errors[value],
    );
  }
  const cleanupStatuses = ref<string[]>(["banned", "unavailable"]);
  async function confirm() {
    working.value = confirming.value;
    const errors: Record<string, string> = {
      delete: "批量删除失败",
      cleanup: "清理失败",
      export: "导出失败",
      number: "调整账号顺序失败",
      reset: "额度重置失败",
    };
    await execute(
      async () => {
        switch (confirming.value) {
          case "delete":
            await accountClient.deleteMany(targets.value);
            notify(`已删除 ${targets.value.length} 个账号`);
            break;
          case "cleanup": {
            const result = await accountClient.deleteByStatuses({
              statuses: cleanupStatuses.value,
            });
            notify(
              result.deleted
                ? `已清理 ${result.deleted} 个账号`
                : "未发现可清理的账号",
            );
            break;
          }
          case "export": {
            const result = await accountClient.export({
              selectedAccountIds: targets.value,
              exportMode: exportMode.value,
            });
            notify(exportSummary(result));
            break;
          }
          case "number": {
            const plan = planAccountNumbers(
              targets.value,
              numberingStart.value,
            );
            await batch(
              plan.map((a) => a.id),
              (id) =>
                accountClient.updateSort(
                  id,
                  plan.find((a) => a.id === id)!.sort,
                ),
            );
            notify("账号编号已保存");
            break;
          }
          case "reset":
            await accountClient.resetUsageQuota(resetAccount.value!.id);
            notify("额度重置成功");
            break;
        }
        confirming.value = "";
      },
      undefined,
      errors[confirming.value],
    );
  }
  async function rowAction(account: Account, value: string) {
    if (value === "reset") {
      resetAccount.value = account;
      confirming.value = "reset";
      return;
    }
    working.value = `${account.id}:${value}`;
    const errors: Record<string, string> = {
      refresh: "刷新失败",
      tokens: "刷新 AT/RT 失败",
      credits: "查询重置次数失败",
      prefer: "设置优先账号失败",
      "clear-prefer": "取消优先账号失败",
      up: "调整账号顺序失败",
      down: "调整账号顺序失败",
    };
    await execute(
      async () => {
        if (value === "refresh") {
          await accountClient.refreshUsage(account.id);
          notify("账号用量已刷新");
        }
        if (value === "tokens") {
          await accountClient.refreshChatgptAuthTokens(account.id);
          notify("账号 AT/RT 已刷新");
        }
        if (value === "credits") {
          account.quotaResetAvailableCount =
            await accountClient.queryResetCredits(account.id);
          notify(
            account.quotaResetAvailableCount == null
              ? "重置次数查询完成"
              : `剩余重置次数：${account.quotaResetAvailableCount}`,
          );
        }
        if (value === "prefer") {
          await accountClient.setPreferred(account.id);
          boost.selectedId = await serviceClient.getManualPreferredAccountId();
          notify("已设为优先账号");
        }
        if (value === "clear-prefer") {
          await accountClient.clearPreferred(account.id);
          notify("已取消优先账号");
        }
        if (value === "up" || value === "down") {
          const ids = boost.accounts.map((a) => a.id);
          const index = ids.indexOf(account.id),
            next = index + (value === "up" ? -1 : 1);
          if (next < 0 || next >= ids.length) {
            notify(
              value === "up" ? "当前账号已经在最前面" : "当前账号已经在最后面",
            );
            return;
          }
          [ids[index], ids[next]] = [ids[next], ids[index]];
          const plan = planAccountNumbers(ids, 1);
          await batch(ids, (id) =>
            accountClient.updateSort(id, plan.find((a) => a.id === id)!.sort),
          );
          notify(`账号顺序已调整（${plan.length} 项）`);
        }
        if (value === "clear-prefer")
          boost.selectedId = await serviceClient.getManualPreferredAccountId();
      },
      undefined,
      errors[value],
    );
  }
  return {
    selected,
    action,
    confirming,
    targets,
    numberingStart,
    exportMode,
    cleanupStatuses,
    resetAccount,
    working,
    toggle,
    selectVisible,
    chooseAction,
    confirm,
    rowAction,
  };
}
