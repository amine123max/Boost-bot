import { shallowRef, ref, computed } from "vue";
import { usePendingActions } from "./usePendingActions";
import {
  proxyClient,
  type ProxyAction,
  type ProxySnapshot,
} from "@/lib/api/proxy-client";
import { getAppErrorMessage } from "@/lib/api/transport";

const snapshot = shallowRef<ProxySnapshot | null>(null);
const actions = usePendingActions();
const activeCount = ref(0);
const busy = computed(() => activeCount.value > 0);
const error = ref("");
let pending: Promise<void> | null = null;
let generation = 0;
let appliedGeneration = 0;
async function refresh() {
  if (busy.value) return;
  if (pending) return pending;
  const version = generation;
  pending = proxyClient
    .get()
    .then((value) => {
      if (version === generation) {
        snapshot.value = value;
        error.value = "";
      }
    })
    .catch((reason) => {
      error.value = getAppErrorMessage(reason);
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
async function action(
  name: ProxyAction,
  options: Record<string, unknown> = {},
) {
  const target =
    name === "bind"
      ? options.accountId
      : name === "remove" || name === "test"
        ? options.nodeId
        : "";
  return actions.run(`${name}:${String(target || "")}`, async () => {
    ++activeCount.value;
    const version = ++generation;
    try {
      const value = await proxyClient.action(name, options);
      if (version >= appliedGeneration) {
        appliedGeneration = version;
        snapshot.value = value;
      }
      error.value = "";
      return value;
    } finally {
      --activeCount.value;
      if (!activeCount.value) {
        if (pending) await pending;
        await refresh();
      }
    }
  });
}
export function useProxyNetwork() {
  return {
    snapshot,
    busy,
    error,
    refresh,
    action,
    isPending: actions.isPending,
  };
}
