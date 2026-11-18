import type {
  Route,
  Message,
  LiveTurn,
  Approval,
  History,
  Activity,
  FileItem,
  QueuedMessage,
  QuestionAnswer,
  Task,
} from "./types";
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
  type Ref,
  type UnwrapNestedRefs,
} from "vue";
import { api, ApiError, enc, stream } from "./api";

/** A subscription belongs to one route. Aborting it never cancels server work. */
export function useConversation(route: Ref<Route>, changed: () => void) {
  const messages = ref<Message[]>([]),
    live = ref<LiveTurn | null>(null),
    pending = ref<Approval[]>([]),
    loading = ref(false),
    refreshing = ref(false),
    modelChanging = ref(false),
    submitting = ref(false),
    recovering = ref(false),
    readError = ref(""),
    error = ref("");
  const running = ref(false),
    stopping = ref(false),
    model = ref(""),
    conversationId = ref(""),
    draft = ref("");
  const queued = ref<QueuedMessage[]>([]), tasks = ref<Task[]>([]), queueBusy = ref('');
  const path = computed(() =>
    route.value.kind === "group"
      ? `/groups/${enc(route.value.id)}`
      : `/bots/${enc(route.value.id)}/chat`,
  );
  let cursor: { turnId: string; seq: string } | undefined;
  const liveUrl = (endpoint: string, turnId?: string) =>
    `${endpoint}/live?format=${route.value.kind === 'group' ? 'delta' : 'replay'}${turnId ? '&turn=' + enc(turnId) : ''}${cursor && cursor.turnId === turnId && live.value?.id === turnId ? '&since=' + enc(cursor.seq) : ''}`;
  const drafts = new Map<string, string>();
  const intents = new Map<string, { key: string; requestId: string }>();
  let generation = 0,
    historyRequest = 0,
    loadRequest = 0,
    streamFailures = 0,
    historyFailures = 0;
  let historyAbort: AbortController | undefined;
  let controller: AbortController | undefined;
  let updates: AbortController | undefined, updateRetry: ReturnType<typeof setTimeout> | undefined;
  let updateRefresh: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let indicatorEnd: ReturnType<typeof setTimeout> | undefined;
  const active = () =>
    ["chat", "group"].includes(route.value.kind) && !!route.value.id;

  function watchUpdates(ticket = generation, delay = 600) {
    if (route.value.kind !== 'chat' || !route.value.id || ticket !== generation) return;
    const ac = new AbortController();
    updates = ac;
    void stream(path.value + '/updates', { signal: ac.signal, onEvent: name => {
      if (name === 'ready') delay = 600;
      if ((name !== 'history' && name !== 'ready') || ac.signal.aborted || ticket !== generation) return;
      if (updateRefresh) return;
      updateRefresh = setTimeout(() => {
        updateRefresh = undefined;
        if (ticket !== generation) return;
        if (controller || recovering.value) void syncHistory(ticket);
        else void load(false);
      }, 40);
    } }).catch(error => {
      if (denied(error)) ac.abort();
    }).finally(() => {
      if (!ac.signal.aborted && ticket === generation) {
        updateRetry = setTimeout(() => watchUpdates(ticket, Math.min(delay * 2, 15_000)), delay);
      }
    });
  }

  function stopUpdates() {
    updates?.abort();
    updates = undefined;
    clearTimeout(updateRetry);
    clearTimeout(updateRefresh);
    updateRefresh = undefined;
  }

  async function history(ticket = generation) {
    const request = ++historyRequest;
    const data = await api<History>(path.value, { signal: historyAbort?.signal }).catch(error => {
      if (ticket !== generation || request !== historyRequest) return null;
      throw error;
    });
    if (!data || ticket !== generation || request !== historyRequest) return null;
    messages.value = data.messages || [];
    if (route.value.kind !== 'group' && Array.isArray(data.live)) {
      for (const turn of data.live) {
        if (!turn.userText || (turn.userMessageId && messages.value.some(message => message.id === turn.userMessageId))) continue;
        messages.value.push({ id: `live-user:${turn.id}`, role: 'user', content: turn.userText, createdAt: turn.startedAt });
      }
    }
    if (live.value && Array.isArray(data.live) && data.live[0]?.userText) live.value.userText = data.live[0].userText;
    pending.value = data.pending || [];
    queued.value = data.queued || [];
    tasks.value = data.tasks || [];
    model.value = data.model || "";
    conversationId.value = data.conversationId || "";
    return data;
  }
  const denied = (error: unknown) => error instanceof ApiError && [401, 403].includes(error.status);
  const retryDelay = (failures: number) => Math.min(350 * 2 ** Math.min(failures - 1, 6), 15_000);
  async function syncHistory(ticket = generation) {
    try {
      const data = await history(ticket);
      if (data) {
        historyFailures = 0;
        readError.value = "";
      }
      return data;
    } catch (e) {
      if (ticket === generation) {
        if (denied(e) || (e instanceof ApiError && e.status === 404)) {
          readError.value = (e as Error).message;
          recovering.value = false;
          clearTimeout(timer);
        } else {
          recovering.value = true;
          schedule(retryDelay(++historyFailures));
        }
      }
      return null;
    }
  }
  function event(name: string, raw: unknown, ticket: number) {
    if (ticket !== generation || !raw || typeof raw !== "object") return;
    if (name === 'ready') {
      recovering.value = false;
      return;
    }
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
      recovering.value = false;
    } else if (name === "text") {
      if (!live.value) live.value = { botId: route.value.id, text: "" };
      live.value.text = data.text;
    } else if (name === 'textDelta') {
      if (!live.value) live.value = { botId: route.value.id, text: '' };
      const { offset, append } = raw as { offset: number; append: string };
      if (offset !== live.value.text.length || typeof append !== 'string') {
        cursor = undefined;
        throw new Error('回复流增量与当前快照不匹配。');
      }
      live.value.text += append;
    } else if (name === "interim" && live.value) {
      if ((raw as { replace?: boolean }).replace) live.value.text = "";
      (live.value.interim ||= []).push(data.text);
    }
    else if (name === "activity" && live.value) {
      const steps = (live.value.steps ||= []);
      const index = steps.findIndex((s) => s.id === data.id);
      if (index >= 0) steps[index] = data;
      else steps.push(data);
    } else if (name === "file" && live.value) {
      const files = (live.value.files ||= []);
      if (!files.some((f) => f.path === data.path)) files.push(data);
    } else if (name === "prompt" || name === "queue")
      void syncHistory(ticket);
    else if (name === "stopping") stopping.value = true;
    else if (name === "error")
      error.value = data.message || data.error || "处理失败，请重试。";
    else if (name === "turnEnd") {
      const settled = live.value;
      void syncHistory(ticket).then(data => {
        if (data && live.value === settled) live.value = null;
      });
    }
  }
  async function follow(url: string) {
    if (controller) return;
    const ticket = generation,
      ac = new AbortController();
    controller = ac;
    running.value = true;
    let completed = false,
      failed = false;
    try {
      await stream(url, {
        signal: ac.signal,
        onEvent: (name, data, seq) => {
          if (ac.signal.aborted || ticket !== generation) return;
          if (name === "done" || name === "error") completed = true;
          event(name, data, ticket);
          if (seq && live.value?.id && /^\d{1,15}$/.test(seq)) {
            cursor = { turnId: live.value.id, seq };
            recovering.value = false;
          }
        },
      });
      if (!completed && !ac.signal.aborted)
        throw new Error("消息连接已断开。");
    } catch (e) {
      if (ticket === generation && !ac.signal.aborted) {
        failed = true;
        if (denied(e)) {
          readError.value = (e as Error).message;
          recovering.value = false;
          clearTimeout(timer);
          return;
        }
        recovering.value = true;
        streamFailures++;
      }
    } finally {
      if (controller === ac) controller = undefined;
      if (ticket === generation && !ac.signal.aborted && !readError.value) {
        if (completed && !failed) streamFailures = 0;
        stopping.value = false;
        schedule(failed ? retryDelay(streamFailures) : 0);
        changed();
      }
    }
  }
  function schedule(delay = route.value.kind === 'chat' ? 30_000 : 5000) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.hidden && !recovering.value && !running.value) schedule();
      else if (controller) {
        void syncHistory().then(data => { if (data && controller) recovering.value = false; });
      } else void load(false);
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
      const data = await syncHistory(ticket);
      if (!data) return;
      running.value =
        route.value.kind === "group"
          ? !!data.group?.running
          : Array.isArray(data.live) && data.live.length > 0;
      const next = Array.isArray(data.live) ? data.live[0] || null : data.live;
      if (!next || !cursor || cursor.turnId !== next.id || live.value?.id !== next.id) {
        cursor = undefined;
        live.value = next;
      }
      if (running.value) {
        const url = liveUrl(path.value, Array.isArray(data.live) ? data.live[0]?.id : undefined);
        void follow(url);
      } else {
        streamFailures = 0;
        recovering.value = false;
        schedule();
      }
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
      const data = await syncHistory(ticket);
      if (data) {
        const turns = Array.isArray(data.live) ? data.live : [];
        running.value = route.value.kind === 'group' ? !!data.group?.running : turns.length > 0;
        if (!controller && running.value) {
          live.value = Array.isArray(data.live) ? data.live[0] || null : data.live;
          void follow(liveUrl(endpoint, turns[0]?.id));
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
  async function changeQueue(id: string, action: 'edit' | 'remove' | 'guide' | 'retry', text?: string) {
    if (queueBusy.value) return false;
    const ticket = generation;
    queueBusy.value = id;
    try {
      await api(`${path.value}/queue/${enc(id)}`, { method: 'POST', body: {
        action, text, ...(action === 'guide' && live.value?.id ? { expectedTurnId: live.value.id } : {}),
      } });
      if (ticket === generation) {
        await syncHistory(ticket);
        if (!controller) void load(false);
      }
      return ticket === generation;
    } catch (e) {
      if (ticket === generation) error.value = (e as Error).message;
      return false;
    } finally { if (ticket === generation) queueBusy.value = ''; }
  }
  async function refreshHistory() { await syncHistory(); }
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
    text: string | QuestionAnswer[] = "",
  ) {
    const ticket = generation;
    try {
      await api(`/approvals/${enc(item.id)}/${action}`, {
        method: "POST",
        body: action === "answer" ? (Array.isArray(text) ? { answers: text } : { text }) : {},
      });
      if (ticket === generation) {
        pending.value = pending.value.filter(row => row.id !== item.id);
        void syncHistory(ticket);
      }
      return true;
    } catch (e) {
      if (ticket === generation) error.value = (e as Error).message;
      return false;
    }
  }
  watch(
    () => `${route.value.kind}/${route.value.id || ""}`,
    (key, old) => {
      if (old) drafts.set(old, draft.value);
      draft.value = drafts.get(key) || "";
      generation++;
      streamFailures = historyFailures = 0;
      cursor = undefined;
      historyAbort?.abort();
      historyAbort = new AbortController();
      historyRequest++;
      controller?.abort();
      stopUpdates();
      controller = undefined;
      clearTimeout(timer);
      clearTimeout(indicatorEnd);
      messages.value = [];
      model.value = "";
      conversationId.value = "";
      live.value = null;
      pending.value = [];
      queued.value = [];
      tasks.value = [];
      queueBusy.value = '';
      error.value = "";
      readError.value = "";
      recovering.value = false;
      running.value = false;
      stopping.value = false;
      loading.value = false;
      refreshing.value = false;
      modelChanging.value = false;
      submitting.value = false;
      if (active()) {
        void load();
        watchUpdates();
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
    historyAbort?.abort();
    controller?.abort();
    stopUpdates();
    clearTimeout(timer);
    clearTimeout(indicatorEnd);
  });
  return {
    messages,
    live,
    pending,
    queued,
    tasks,
    queueBusy,
    loading,
    refreshing,
    modelChanging,
    submitting,
    error,
    readError,
    recovering,
    running,
    stopping,
    model,
    conversationId,
    draft,
    load,
    send,
    edit,
    changeQueue,
    refreshHistory,
    stop,
    changeModel,
    answer,
  };
}

export type Conversation = UnwrapNestedRefs<ReturnType<typeof useConversation>>;
