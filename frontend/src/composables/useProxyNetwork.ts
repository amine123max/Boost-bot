import { shallowRef, ref } from "vue";
import {
  proxyClient,
  type ProxyAction,
  type ProxySnapshot,
} from "@/lib/api/proxy-client";
import { getAppErrorMessage } from "@/lib/api/transport";

const snapshot = shallowRef<ProxySnapshot | null>(null);
const busy = ref(false);
const error = ref("");
let pending: Promise<void> | null = null;
let generation = 0;
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
  busy.value = true;
  ++generation;
  try {
    snapshot.value = await proxyClient.action(name, options);
    error.value = "";
    return snapshot.value;
  } finally {
    busy.value = false;
  }
}
export function useProxyNetwork() {
  return { snapshot, busy, error, refresh, action };
}
