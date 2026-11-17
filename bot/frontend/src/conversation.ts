import type {
  Route,
  Message,
  LiveTurn,
  Approval,
  History,
  Activity,
  FileItem,
} from "./types";
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
  type Ref,
  type UnwrapNestedRefs,
} from "vue";
import { api, enc, stream } from "./api";

/** A subscription belongs to one route. Aborting it never cancels server work. */
export function useConversation(route: Ref<Route>, changed: () => void) {
  const messages = ref<Message[]>([]),
    live = ref<LiveTurn | null>(null),
    pending = ref<Approval[]>([]),
    loading = ref(false),
    refreshing = ref(false),
    modelChanging = ref(false),
    submitting = ref(false),
    error = ref("");
  const running = ref(false),
    stopping = ref(false),
    model = ref(""),
    conversationId = ref(""),
    draft = ref("");
  const path = computed(() =>
    route.value.kind === "group"
      ? `/groups/${enc(route.value.id)}`
      : `/bots/${enc(route.value.id)}/chat`,
  );
  const drafts = new Map<string, string>();
  const intents = new Map<string, { key: string; requestId: string }>();
  let generation = 0,
    historyRequest = 0,
    loadRequest = 0;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let indicatorEnd: ReturnType<typeof setTimeout> | undefined;
  const active = () =>
    ["chat", "group"].includes(route.value.kind) && !!route.value.id;

  async function history(ticket = generation) {
    const request = ++historyRequest;
    const data = await api<History>(path.value);
    if (ticket !== generation || request !== historyRequest) return null;
    messages.value = data.messages || [];
    if (route.value.kind !== 'group' && Array.isArray(data.live)) {
      for (const turn of data.live) {
        if (!turn.userText || (turn.userMessageId && messages.value.some(message => message.id === turn.userMessageId))) continue;
        messages.value.push({ id: `live-user:${turn.id}`, role: 'user', content: turn.userText, createdAt: turn.startedAt });
      }
    }
    if (live.value && Array.isArray(data.live) && data.live[0]?.userText) live.value.userText = data.live[0].userText;
    pending.value = data.pending || [];
    model.value = data.model || "";
    conversationId.value = data.conversationId || "";
    return data;
  }
  function event(name: string, raw: unknown, ticket: number) {
    if (ticket !== generation || !raw || typeof raw !== "object") return;
    if (name === 'user') {
      const data = raw as { turnId: string; message: Message };
      if (!data.message || data.message.role !== 'user' || typeof data.message.id !== 'number') return;
      messages.value = messages.value.filter(message => message.id !== `live-user:${data.turnId}` && message.id !== data.message.id);
      messages.value.push(data.message);
      if (live.value?.id === data.turnId) live.value.userMessageId = Number(data.message.id);
      return;
    }
    const data = raw as LiveTurn &
      Activity &
      FileItem & { message?: string; error?: string };
    if (name === "snapshot" || name === "turn") {
      live.value = { ...data, botId: data.botId || route.value.id };
      stopping.value = !!data.stopping;
    } else if (name === "text") {
      if (!live.value) live.value = { botId: route.value.id, text: "" };
      live.value.text = data.text;
    } else if (name === "interim" && live.value)
      (live.value.interim ||= []).push(data.text);
    else if (name === "activity" && live.value) {
      const steps = (live.value.steps ||= []);
      const index = steps.findIndex((s) => s.id === data.id);
      if (index >= 0) steps[index] = data;
      else steps.push(data);
    } else if (name === "file" && live.value) {
      const files = (live.value.files ||= []);
      if (!files.some((f) => f.path === data.path)) files.push(data);
    } else if (name === "prompt")
      void history(ticket).catch((e) => {
        if (ticket === generation) error.value = (e as Error).message;
      });
    else if (name === "stopping") stopping.value = true;
    else if (name === "error")
      error.value = data.message || data.error || "处理失败，请重试。";
    else if (name === "turnEnd") {
      live.value = null;
      void history(ticket).catch((e) => {
        if (ticket === generation) error.value = (e as Error).message;
      });
    }
  }
  async function follow(
    url: string,
    body?: unknown,
    initial?: LiveTurn | null,
  ) {
    if (controller) return;
    const ticket = generation,
      ac = new AbortController();
    controller = ac;
    running.value = true;
    if (initial) live.value = initial;
    let completed = false,
      failed = false;
    try {
      await stream(url, {
        body,
        signal: ac.signal,
        onEvent: (name, data) => {
          if (ac.signal.aborted || ticket !== generation) return;
          if (name === "done" || name === "error") completed = true;
          event(name, data, ticket);
        },
      });
      if (!completed && !ac.signal.aborted)
        throw new Error(
          "消息连接已断开。点击重新连接可继续查看，任务仍在服务端运行。",
        );
    } catch (e) {
      if (ticket === generation && (e as Error).name !== "AbortError") {
        error.value = (e as Error).message;
        failed = true;
      }
    } finally {
      if (controller === ac) controller = undefined;
      if (ticket === generation && !ac.signal.aborted) {
        stopping.value = false;
        try {
          const data = await history(ticket);
          if (data) {
            running.value =
              route.value.kind === "group"
                ? !!data.group?.running
                : Array.isArray(data.live) && data.live.length > 0;
            live.value = Array.isArray(data.live)
              ? data.live[0] || null
              : data.live;
            if (running.value && !failed) schedule(500);
          }
        } catch (e) {
          if (ticket === generation) error.value = (e as Error).message;
        }
        changed();
      }
    }
  }
  function schedule(delay = 5000) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.hidden) schedule();
      else void load(false);
    }, delay);
  }
  async function load(showLoading = true) {
    if (!active() || controller) return;
    const ticket = generation;
    if (showLoading && !messages.value.length && !live.value) loading.value = true;
    const request = ++loadRequest;
    clearTimeout(indicatorEnd);
    let indicatorSince = refreshing.value ? performance.now() : 0;
    const indicator = setTimeout(() => {
      if (ticket === generation && request === loadRequest) {
        indicatorSince = performance.now();
        refreshing.value = true;
      }
    }, 180);
    try {
      const data = await history(ticket);
      if (!data) return;
      if (showLoading) error.value = "";
      running.value =
        route.value.kind === "group"
          ? !!data.group?.running
          : Array.isArray(data.live) && data.live.length > 0;
      live.value = Array.isArray(data.live) ? data.live[0] || null : data.live;
      if (running.value) {
        const url =
          route.value.kind === "group"
            ? `${path.value}/live`
            : `${path.value}/live?turn=${enc(Array.isArray(data.live) ? data.live[0].id || "" : "")}`;
        void follow(url, undefined, live.value);
      } else schedule();
    } catch (e) {
      if (ticket === generation) error.value = (e as Error).message;
    } finally {
      clearTimeout(indicator);
      if (ticket === generation && request === loadRequest) {
        loading.value = false;
        const remaining = indicatorSince ? Math.max(0, 160 - (performance.now() - indicatorSince)) : 0;
        indicatorEnd = setTimeout(() => { if (ticket === generation && request === loadRequest) refreshing.value = false; }, remaining);
      }
    }
  }
  async function submit(text: string, original?: Message): Promise<boolean> {
    text = text.trim();
    if (!text || submitting.value || loading.value || modelChanging.value || stopping.value || !active()) return false;
    if (original && (route.value.kind === 'group' || typeof original.id !== 'number')) return false;
    const ticket = generation, endpoint = path.value;
    const key = JSON.stringify([text, original?.id, original?.content]);
    const previous = intents.get(endpoint);
    const intent = previous?.key === key ? previous : { key, requestId: crypto.randomUUID() };
    intents.set(endpoint, intent);
    error.value = '';
    submitting.value = true;
    clearTimeout(timer);
    if (original) { historyRequest++; controller?.abort(); controller = undefined; }
    try {
      if (route.value.kind === 'group') {
        await api(endpoint + '/messages', { method: 'POST', body: { text, requestId: intent.requestId } });
      } else {
        await api(endpoint + '/messages', { method: 'POST', body: { text, requestId: intent.requestId,
          ...(original ? { editMessageId: original.id, expectedContent: original.content } : {}) } });
      }
      intents.delete(endpoint);
      if (ticket !== generation) return false;
      if (!original && draft.value.trim() === text) draft.value = '';
      const data = await history(ticket).catch((e: Error) => {
        if (ticket === generation) { error.value = e.message; schedule(500); }
        return null;
      });
      if (data) {
        const turns = Array.isArray(data.live) ? data.live : [];
        running.value = route.value.kind === 'group' ? !!data.group?.running : turns.length > 0;
        if (!controller && running.value) {
          live.value = Array.isArray(data.live) ? data.live[0] || null : data.live;
          void follow(endpoint + '/live' + (route.value.kind === 'group' ? '' : '?turn=' + enc(turns[0]?.id || '')), undefined, live.value);
        } else if (!running.value) { live.value = null; schedule(); }
      }
      changed();
      return true;
    } catch (e) {
      if (ticket === generation) { error.value = (e as Error).message; schedule(500); }
      return false;
    } finally { if (ticket === generation) submitting.value = false; }
  }
  async function send(): Promise<boolean> { return submit(draft.value); }
  async function edit(original: Message, text: string): Promise<boolean> { return submit(text, original); }
  async function stop() {
    if (stopping.value) return;
    stopping.value = true;
    const ticket = generation;
    try {
      await api(
        route.value.kind === "group"
          ? `${path.value}/stop`
          : `/conversations/${enc(conversationId.value || `${route.value.id}:web:console`)}/stop`,
        { method: "POST", body: {} },
      );
      if (!controller && ticket === generation) await load(false);
    } catch (e) {
      if (ticket === generation) {
        error.value = (e as Error).message;
        stopping.value = false;
      }
    }
  }
  async function changeModel(value: string) {
    if(modelChanging.value || running.value || loading.value)return;
    const ticket=generation,endpoint=path.value;
    modelChanging.value=true;
    try {
      await api(`${endpoint}/model`, {
        method: "PUT",
        body: { model: value },
      });
      if(ticket===generation){historyRequest++;model.value = value;error.value='';}
    } catch (e) {
      if(ticket===generation)error.value = (e as Error).message;
    } finally {
      if(ticket===generation)modelChanging.value=false;
    }
  }
  async function answer(
    item: Approval,
    action: "approve" | "deny" | "answer",
    text = "",
  ) {
    try {
      await api(`/approvals/${enc(item.id)}/${action}`, {
        method: "POST",
        body: action === "answer" ? { text } : {},
      });
      await history();
    } catch (e) {
      error.value = (e as Error).message;
    }
  }
  watch(
    () => `${route.value.kind}/${route.value.id || ""}`,
    (key, old) => {
      if (old) drafts.set(old, draft.value);
      draft.value = drafts.get(key) || "";
      generation++;
      historyRequest++;
      controller?.abort();
      controller = undefined;
      clearTimeout(timer);
      clearTimeout(indicatorEnd);
      messages.value = [];
      model.value = "";
      conversationId.value = "";
      live.value = null;
      pending.value = [];
      error.value = "";
      running.value = false;
      stopping.value = false;
      loading.value = false;
      refreshing.value = false;
      modelChanging.value = false;
      submitting.value = false;
      if (active()) void load();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
    controller?.abort();
    clearTimeout(timer);
    clearTimeout(indicatorEnd);
  });
  return {
    messages,
    live,
    pending,
    loading,
    refreshing,
    modelChanging,
    submitting,
    error,
    running,
    stopping,
    model,
    conversationId,
    draft,
    load,
    send,
    edit,
    stop,
    changeModel,
    answer,
  };
}

export type Conversation = UnwrapNestedRefs<ReturnType<typeof useConversation>>;
