import { reactive } from "vue";
import type { AggregateApi } from "@/types";

export function useAggregateOptions() {
  const draft = reactive({
    sort: 0,
    authType: "apikey",
    username: "",
    password: "",
    authCustomEnabled: false,
    authParams: "",
    actionCustomEnabled: false,
    action: "",
    modelOverride: "",
    balanceQueryEnabled: false,
    balanceQueryTemplate: "generic",
    balanceQueryBaseUrl: "",
    balanceQueryAccessToken: "",
    balanceQueryUserId: "",
    balanceQueryConfigJson: "",
  });
  function reset(api?: AggregateApi) {
    Object.assign(draft, {
      sort: api?.sort ?? 0,
      authType: api?.authType || "apikey",
      username: "",
      password: "",
      authCustomEnabled: !!api?.authParams,
      authParams: api?.authParams
        ? JSON.stringify(api.authParams, null, 2)
        : "",
      actionCustomEnabled: !!api?.action,
      action: api?.action || "",
      modelOverride: api?.modelOverride || "",
      balanceQueryEnabled: api?.balanceQueryEnabled ?? false,
      balanceQueryTemplate: api?.balanceQueryTemplate || "generic",
      balanceQueryBaseUrl: api?.balanceQueryBaseUrl || "",
      balanceQueryAccessToken: "",
      balanceQueryUserId: api?.balanceQueryUserId || "",
      balanceQueryConfigJson: api?.balanceQueryConfigJson || "",
    });
  }
  function payload() {
    let authParams: Record<string, unknown> | null = null;
    if (draft.authCustomEnabled) {
      try {
        authParams = JSON.parse(draft.authParams);
      } catch {
        throw new Error("认证参数必须为有效 JSON");
      }
      if (
        !authParams ||
        typeof authParams !== "object" ||
        Array.isArray(authParams)
      )
        throw new Error("认证参数必须为 JSON 对象");
    }
    if (draft.balanceQueryEnabled && draft.balanceQueryTemplate === "custom") {
      try {
        const value = JSON.parse(draft.balanceQueryConfigJson);
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error();
      } catch {
        throw new Error("余额查询配置必须为 JSON 对象");
      }
    }
    return {
      ...draft,
      sort: Number(draft.sort),
      authParams,
      action: draft.action.trim(),
      modelOverride: draft.modelOverride.trim(),
      username: draft.username.trim() || null,
      password: draft.password || null,
      balanceQueryAccessToken: draft.balanceQueryAccessToken.trim() || null,
    };
  }
  return { draft, reset, payload };
}
