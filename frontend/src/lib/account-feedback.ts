// Keep account-pool feedback aligned with the original useAccounts mutations.
export function usageRefreshError(message: string) {
  return message.toLowerCase().includes("refresh token failed with status 401")
    ? "账号长期未登录，refresh 已过期，已改为不可用状态"
    : message;
}
export function importSummary(result: {
  total?: number;
  created?: number;
  updated?: number;
  failed?: number;
}) {
  return `导入完成：共${result.total || 0}，新增${result.created || 0}，更新${result.updated || 0}，失败${result.failed || 0}`;
}
export function exportSummary(result: {
  canceled?: boolean;
  exported?: number;
  outputDir?: string;
}) {
  if (result.canceled) return "已取消导出";
  const summary = `已导出 ${result.exported || 0} 个账号`;
  return result.outputDir === "browser-download"
    ? `${summary}，浏览器将开始下载`
    : result.outputDir
      ? `${summary}到 ${result.outputDir}`
      : summary;
}
export function warmupSummary(result: {
  requested?: number;
  succeeded?: number;
  failed?: number;
  results?: {
    ok: boolean;
    accountName: string;
    accountId: string;
    message: string;
  }[];
}) {
  if (!result.requested) return "当前没有可预热的账号";
  if (!result.failed)
    return `预热完成：共${result.requested}个账号，成功${result.succeeded || 0}个`;
  const summary = `预热完成：成功${result.succeeded || 0}个，失败${result.failed}个`;
  const failure = result.results?.find((item) => !item.ok);
  return failure?.message
    ? `${summary}；首个失败: ${failure.accountName || failure.accountId} - ${failure.message}`
    : summary;
}
