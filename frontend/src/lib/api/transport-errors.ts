/**
 * 函数 `asRecord`
 *
 *
 * 时间: 2026-04-13
 *
 * # 参数
 * - value: 参数 value
 *
 * # 返回
 * 返回函数执行结果
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 函数 `normalizeKnownAppErrorMessage`
 *
 *
 * 时间: 2026-04-14
 *
 * # 参数
 * - message: 参数 message
 *
 * # 返回
 * 返回函数执行结果
 */
function normalizeKnownAppErrorMessage(message: string): string {
  const trimmed = String(message || "").trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.toLowerCase();
  if (
    normalized === "request or response body error" ||
    normalized === "stream read failed" ||
    normalized === "上游中途断开，未返回具体错误信息"
  ) {
    return "上游中途断开，未返回具体错误信息";
  }
  if (
    normalized === "stream idle timeout" ||
    normalized === "上游流式空闲超时" ||
    normalized.includes("stream_timeout") ||
    normalized.includes("idle timeout")
  ) {
    return "上游流式空闲超时";
  }
  if (
    normalized === "response.incomplete" ||
    normalized === "网络抖动" ||
    normalized === "stream disconnected before completion" ||
    normalized === "连接中断（可能是网络波动或客户端主动取消）"
  ) {
    return "连接中断（可能是网络波动或客户端主动取消）";
  }

  return trimmed;
}

/**
 * 函数 `resolveRpcErrorMessage`
 *
 *
 * 时间: 2026-04-13
 *
 * # 参数
 * - error: 参数 error
 *
 * # 返回
 * 返回函数执行结果
 */
export function resolveRpcErrorMessage(error: unknown): string {
  if (typeof error === "string") return normalizeKnownAppErrorMessage(error);
  const record = asRecord(error);
  if (record?.message && typeof record.message === "string") {
    return normalizeKnownAppErrorMessage(record.message);
  }
  return error ? JSON.stringify(error) : "RPC 请求失败";
}

/**
 * 函数 `resolveBusinessErrorMessage`
 *
 *
 * 时间: 2026-04-13
 *
 * # 参数
 * - payload: 参数 payload
 *
 * # 返回
 * 返回函数执行结果
 */
export function resolveBusinessErrorMessage(payload: unknown): string {
  const source = asRecord(payload);
  if (!source) return "";
  const error = source.error;
  if (source.ok === false) {
    return typeof error === "string"
      ? normalizeKnownAppErrorMessage(error)
      : asRecord(error)?.message
        ? normalizeKnownAppErrorMessage(String(asRecord(error)?.message))
        : "操作失败";
  }
  if (error) {
    return typeof error === "string"
      ? normalizeKnownAppErrorMessage(error)
      : asRecord(error)?.message
        ? normalizeKnownAppErrorMessage(String(asRecord(error)?.message))
        : "";
  }
  return "";
}

/**
 * 函数 `throwIfBusinessError`
 *
 *
 * 时间: 2026-04-13
 *
 * # 参数
 * - payload: 参数 payload
 *
 * # 返回
 * 返回函数执行结果
 */
export function throwIfBusinessError(payload: unknown): void {
  const message = resolveBusinessErrorMessage(payload);
  if (message) {
    throw new Error(message);
  }
}

/**
 * 函数 `unwrapRpcPayload`
 *
 *
 * 时间: 2026-04-13
 *
 * # 参数
 * - payload: 参数 payload
 *
 * # 返回
 * 返回函数执行结果
 */
export function unwrapRpcPayload<T>(payload: unknown): T {
  const responseRecord = asRecord(payload);
  if (responseRecord && "error" in responseRecord) {
    throw Object.assign(new Error(resolveRpcErrorMessage(responseRecord.error)), {
      code: asRecord(responseRecord.error)?.code,
    });
  }
  if (responseRecord && "result" in responseRecord) {
    const result = responseRecord.result as T;
    throwIfBusinessError(result);
    return result;
  }
  throwIfBusinessError(payload);
  return payload as T;
}

/**
 * 函数 `getAppErrorMessage`
 *
 *
 * 时间: 2026-04-13
 *
 * # 参数
 * - error: 参数 error
 * - fallback: 参数 fallback
 *
 * # 返回
 * 返回函数执行结果
 */
export function getAppErrorMessage(
  error: unknown,
  fallback = "操作失败"
): string {
  if (error instanceof Error) {
    const nested = getAppErrorMessage(error.message, "");
    return nested || fallback;
  }

  const businessMessage = resolveBusinessErrorMessage(error);
  if (businessMessage) return businessMessage;

  const rpcMessage = resolveRpcErrorMessage(error).trim();
  if (!rpcMessage || rpcMessage === "null" || rpcMessage === "undefined") {
    return fallback;
  }
  return rpcMessage;
}

export function isManagementReadBusy(error: unknown): boolean {
  const details = asRecord(error);
  return Number(details?.status) === 429 || Number(details?.code) === 429 ||
    /管理请求队列已满|管理请求过多|管理请求排队超时|HTTP\s+429\b|too many requests|management request queue (?:is )?full/i
      .test(getAppErrorMessage(error));
}

/**
 * 函数 `isCommandMissingError`
 *
 *
 * 时间: 2026-04-13
 *
 * # 参数
 * - err: 参数 err
 *
 * # 返回
 * 返回函数执行结果
 */
export function isCommandMissingError(err: unknown): boolean {
  const message = getAppErrorMessage(err, "").toLowerCase();
  return (
    message.includes("unknown command") ||
    message.includes("not found") ||
    message.includes("is not a registered")
  );
}
